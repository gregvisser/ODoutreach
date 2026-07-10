import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * applyBrandedSignatureToAllClientMailboxesAction — the "one-click, set once
 * per client" bulk signature. The branded-template + sender-signature helpers
 * run for real (pure); we mock only the I/O boundaries.
 */
const {
  requireStaff,
  requireMutator,
  clientFindFirst,
  clientUpdate,
  mbFindMany,
  mbUpdate,
  auditCreate,
} = vi.hoisted(() => ({
  requireStaff: vi.fn(),
  requireMutator: vi.fn(),
  clientFindFirst: vi.fn(),
  clientUpdate: vi.fn(),
  mbFindMany: vi.fn(),
  mbUpdate: vi.fn(),
  auditCreate: vi.fn(),
}));

vi.mock("@/server/auth/staff", () => ({
  requireOpensDoorsStaff: (...a: unknown[]) => requireStaff(...a),
}));
vi.mock("@/server/mailbox-identities/mutator-access", () => ({
  requireClientMailboxMutator: (...a: unknown[]) => requireMutator(...a),
}));
vi.mock("@/server/mailbox/gmail-signature-sync", () => ({
  syncGmailSignatureForMailbox: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/db", () => ({
  prisma: {
    client: {
      findFirst: (...a: unknown[]) => clientFindFirst(...a),
      update: (...a: unknown[]) => clientUpdate(...a),
    },
    clientMailboxIdentity: {
      findMany: (...a: unknown[]) => mbFindMany(...a),
      update: (...a: unknown[]) => mbUpdate(...a),
    },
    auditLog: { create: (...a: unknown[]) => auditCreate(...a) },
  },
}));

import {
  applyBrandedSignatureToAllClientMailboxesAction,
  setClientSignaturePhoneAction,
} from "./mailbox-signature-actions";

beforeEach(() => {
  requireStaff.mockReset();
  requireMutator.mockReset();
  clientFindFirst.mockReset();
  clientUpdate.mockReset();
  mbFindMany.mockReset();
  mbUpdate.mockReset();
  auditCreate.mockReset();
  requireStaff.mockResolvedValue({ id: "staff1", email: "s@opensdoors.co.uk" });
  requireMutator.mockResolvedValue(undefined);
  clientFindFirst.mockResolvedValue({
    id: "c1",
    name: "Idverde",
    website: "https://idverde.co.uk",
    logoUrl: null,
    signaturePhone: "+44 20 7946 0000",
  });
  clientUpdate.mockResolvedValue({});
  mbUpdate.mockResolvedValue({});
  auditCreate.mockResolvedValue({});
});

describe("applyBrandedSignatureToAllClientMailboxesAction", () => {
  it("only targets CONNECTED, in-workspace mailboxes with NO signature (non-destructive)", async () => {
    mbFindMany.mockResolvedValue([]);
    await applyBrandedSignatureToAllClientMailboxesAction("c1");
    expect(mbFindMany).toHaveBeenCalledTimes(1);
    expect(mbFindMany.mock.calls[0][0].where).toMatchObject({
      clientId: "c1",
      workspaceRemovedAt: null,
      connectionStatus: "CONNECTED",
      senderSignatureHtml: null,
      senderSignatureText: null,
    });
  });

  it("writes a CLIENT-branded signature (manual source) to each empty mailbox and audits", async () => {
    mbFindMany.mockResolvedValue([
      { id: "mb1", email: "adam@idverde.co.uk", displayName: "Adam", senderDisplayName: null, senderPhone: null },
      { id: "mb2", email: "dan@idverde.co.uk", displayName: null, senderDisplayName: "Dan H", senderPhone: "07700 900111" },
    ]);

    const res = await applyBrandedSignatureToAllClientMailboxesAction("c1");

    expect(mbUpdate).toHaveBeenCalledTimes(2);
    const first = mbUpdate.mock.calls[0][0];
    expect(first.where).toEqual({ id: "mb1" });
    expect(first.data.senderSignatureSource).toBe("manual");
    expect(first.data.senderDisplayName).toBe("Adam");
    // The CLIENT's website (not opensdoors.co.uk) is woven into the signature.
    expect(first.data.senderSignatureHtml).toContain("idverde.co.uk");
    expect(first.data.senderSignatureHtml).not.toContain("opensdoors.co.uk");
    expect(first.data.senderSignatureText).toContain("idverde.co.uk");
    // mb1 has no number of its own → uses the client's company landline.
    expect(first.data.senderSignatureHtml).toContain("7946 0000");
    // mb2 has its own direct line → that wins over the company landline.
    const second = mbUpdate.mock.calls[1][0].data;
    expect(second.senderDisplayName).toBe("Dan H");
    expect(second.senderSignatureHtml).toContain("900111");
    expect(second.senderSignatureHtml).not.toContain("7946 0000");

    expect(auditCreate).toHaveBeenCalledTimes(2);
    expect(res.ok).toBe(true);
    expect(res.ok && res.message).toContain("2 mailboxes");
  });

  it("derives a human name from the email when no real name exists (never stores the raw address)", async () => {
    mbFindMany.mockResolvedValue([
      {
        id: "mb1",
        email: "daniel.harper@idverde.co.uk",
        displayName: null,
        senderDisplayName: null,
        senderPhone: null,
      },
    ]);

    await applyBrandedSignatureToAllClientMailboxesAction("c1");

    const data = mbUpdate.mock.calls[0][0].data;
    // No explicit name → derive one from the local-part so the signature and the
    // From header carry a person, never the raw address as a name.
    expect(data.senderDisplayName).toBe("Daniel Harper");
    expect(data.senderDisplayName).not.toContain("@");
    // The address must still appear exactly once in the plain text and not more
    // than twice in the HTML (mailto + visible link text only, never a name line).
    const occurrences = (s: string) =>
      s.split("daniel.harper@idverde.co.uk").length - 1;
    expect(occurrences(data.senderSignatureText)).toBe(1);
    expect(occurrences(data.senderSignatureHtml)).toBe(2);
  });

  it("does nothing and reports when every connected mailbox already has a signature", async () => {
    mbFindMany.mockResolvedValue([]);
    const res = await applyBrandedSignatureToAllClientMailboxesAction("c1");
    expect(mbUpdate).not.toHaveBeenCalled();
    expect(res).toEqual({
      ok: true,
      message: "Every connected mailbox already has a signature — nothing to add.",
    });
  });

  it("refuses when the client is missing or soft-deleted", async () => {
    clientFindFirst.mockResolvedValue(null);
    const res = await applyBrandedSignatureToAllClientMailboxesAction("c1");
    expect(res.ok).toBe(false);
    expect(mbFindMany).not.toHaveBeenCalled();
  });
});

describe("setClientSignaturePhoneAction", () => {
  it("saves a trimmed company landline on the client", async () => {
    const res = await setClientSignaturePhoneAction("c1", "  +44 20 7946 0000  ");
    expect(clientUpdate).toHaveBeenCalledTimes(1);
    expect(clientUpdate.mock.calls[0][0]).toMatchObject({
      where: { id: "c1" },
      data: { signaturePhone: "+44 20 7946 0000" },
    });
    expect(res.ok).toBe(true);
  });

  it("clears the landline when given a blank value", async () => {
    const res = await setClientSignaturePhoneAction("c1", "   ");
    expect(clientUpdate.mock.calls[0][0].data).toEqual({ signaturePhone: null });
    expect(res.ok).toBe(true);
  });

  it("refuses a missing / soft-deleted client", async () => {
    clientFindFirst.mockResolvedValue(null);
    const res = await setClientSignaturePhoneAction("c1", "123");
    expect(res.ok).toBe(false);
    expect(clientUpdate).not.toHaveBeenCalled();
  });
});
