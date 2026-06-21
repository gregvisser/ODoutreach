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
  mbFindMany,
  mbUpdate,
  auditCreate,
} = vi.hoisted(() => ({
  requireStaff: vi.fn(),
  requireMutator: vi.fn(),
  clientFindFirst: vi.fn(),
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
    client: { findFirst: (...a: unknown[]) => clientFindFirst(...a) },
    clientMailboxIdentity: {
      findMany: (...a: unknown[]) => mbFindMany(...a),
      update: (...a: unknown[]) => mbUpdate(...a),
    },
    auditLog: { create: (...a: unknown[]) => auditCreate(...a) },
  },
}));

import { applyBrandedSignatureToAllClientMailboxesAction } from "./mailbox-signature-actions";

beforeEach(() => {
  requireStaff.mockReset();
  requireMutator.mockReset();
  clientFindFirst.mockReset();
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
  });
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
      { id: "mb1", email: "adam@idverde.co.uk", displayName: "Adam", senderDisplayName: null },
      { id: "mb2", email: "dan@idverde.co.uk", displayName: null, senderDisplayName: "Dan H" },
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
    // Second mailbox falls back to its senderDisplayName.
    expect(mbUpdate.mock.calls[1][0].data.senderDisplayName).toBe("Dan H");

    expect(auditCreate).toHaveBeenCalledTimes(2);
    expect(res.ok).toBe(true);
    expect(res.ok && res.message).toContain("2 mailboxes");
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
