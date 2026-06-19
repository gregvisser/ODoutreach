import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock Prisma. `$transaction(fn)` just invokes the callback with a `tx`
// object exposing exactly the delegate methods the writer uses, so we can
// assert on the calls without a database.
const {
  findUnique,
  createSupp,
  updateSupp,
  updateManyContacts,
  createAudit,
} = vi.hoisted(() => ({
  findUnique: vi.fn(),
  createSupp: vi.fn(),
  updateSupp: vi.fn(),
  updateManyContacts: vi.fn(),
  createAudit: vi.fn(),
}));

const tx = {
  suppressedEmail: {
    findUnique: (...a: unknown[]) => findUnique(...a),
    create: (...a: unknown[]) => createSupp(...a),
    update: (...a: unknown[]) => updateSupp(...a),
  },
  contact: { updateMany: (...a: unknown[]) => updateManyContacts(...a) },
  auditLog: { create: (...a: unknown[]) => createAudit(...a) },
};

vi.mock("@/lib/db", () => ({
  prisma: {
    $transaction: (fn: (t: typeof tx) => unknown) => fn(tx),
  },
}));

import { suppressRecipientForHardBounce } from "./bounce-suppression";

const AT = new Date("2026-06-14T10:00:00.000Z");

function baseInput(over: Record<string, unknown> = {}) {
  return {
    clientId: "client-1",
    email: "Dead.Inbox@Example.com",
    contactId: "ct-9",
    outboundEmailId: "out-9",
    bounceCategory: "Permanent",
    providerEventType: "email.bounced",
    at: AT,
    ...over,
  };
}

beforeEach(() => {
  findUnique.mockReset();
  createSupp.mockReset();
  updateSupp.mockReset();
  updateManyContacts.mockReset();
  createAudit.mockReset();
  updateManyContacts.mockResolvedValue({ count: 1 });
});

describe("suppressRecipientForHardBounce", () => {
  it("creates a SuppressedEmail (sourceId null), flips contacts, audits — when new", async () => {
    findUnique.mockResolvedValue(null);
    createSupp.mockResolvedValue({ id: "supp-1" });

    const res = await suppressRecipientForHardBounce(baseInput());

    // Suppression row created with normalized (lowercased) email + sourceId null.
    expect(createSupp).toHaveBeenCalledTimes(1);
    expect(createSupp.mock.calls[0][0]).toMatchObject({
      data: {
        clientId: "client-1",
        email: "dead.inbox@example.com",
        sourceId: null,
        syncedAt: AT,
      },
    });
    expect(updateSupp).not.toHaveBeenCalled();

    // Contacts flipped (case-insensitive match on normalized email).
    expect(updateManyContacts).toHaveBeenCalledTimes(1);
    expect(updateManyContacts.mock.calls[0][0]).toMatchObject({
      where: {
        clientId: "client-1",
        email: { equals: "dead.inbox@example.com", mode: "insensitive" },
      },
      data: { isSuppressed: true, lastSuppressionCheckAt: AT },
    });

    // Exactly one audit row, tagged as a hard-bounce suppression.
    expect(createAudit).toHaveBeenCalledTimes(1);
    expect(createAudit.mock.calls[0][0]).toMatchObject({
      data: {
        staffUserId: null,
        clientId: "client-1",
        action: "CREATE",
        entityType: "SuppressedEmail",
        metadata: {
          kind: "hard_bounce_suppressed",
          email: "dead.inbox@example.com",
          contactId: "ct-9",
          outboundEmailId: "out-9",
          bounceCategory: "Permanent",
          providerEventType: "email.bounced",
        },
      },
    });

    expect(res).toEqual({
      suppressed: true,
      newlyCreated: true,
      normalizedEmail: "dead.inbox@example.com",
      contactsFlagged: 1,
    });
  });

  it("tags the audit as a complaint when reason is 'complaint' (L2)", async () => {
    findUnique.mockResolvedValue(null);
    createSupp.mockResolvedValue({ id: "supp-c" });

    const res = await suppressRecipientForHardBounce(
      baseInput({ reason: "complaint", providerEventType: "email.complained" }),
    );

    expect(createSupp).toHaveBeenCalledTimes(1);
    expect(createAudit).toHaveBeenCalledTimes(1);
    expect(createAudit.mock.calls[0][0]).toMatchObject({
      data: {
        metadata: {
          kind: "complaint_suppressed",
          email: "dead.inbox@example.com",
          providerEventType: "email.complained",
        },
      },
    });
    expect(res.suppressed).toBe(true);
  });

  it("is idempotent — existing row is refreshed, not duplicated, and not re-audited", async () => {
    findUnique.mockResolvedValue({ id: "supp-existing" });

    const res = await suppressRecipientForHardBounce(baseInput());

    expect(createSupp).not.toHaveBeenCalled();
    // syncedAt refreshed only.
    expect(updateSupp).toHaveBeenCalledTimes(1);
    expect(updateSupp.mock.calls[0][0]).toMatchObject({
      where: { id: "supp-existing" },
      data: { syncedAt: AT },
    });
    // Contact flag still ensured (idempotent), but NO new audit row.
    expect(updateManyContacts).toHaveBeenCalledTimes(1);
    expect(createAudit).not.toHaveBeenCalled();

    expect(res.newlyCreated).toBe(false);
    expect(res.suppressed).toBe(true);
  });

  it("no-ops on an empty email without touching the database", async () => {
    const res = await suppressRecipientForHardBounce(baseInput({ email: "   " }));

    expect(findUnique).not.toHaveBeenCalled();
    expect(createSupp).not.toHaveBeenCalled();
    expect(updateManyContacts).not.toHaveBeenCalled();
    expect(createAudit).not.toHaveBeenCalled();
    expect(res).toEqual({
      suppressed: false,
      newlyCreated: false,
      normalizedEmail: "",
      contactsFlagged: 0,
    });
  });

  it("no-ops when clientId is missing", async () => {
    const res = await suppressRecipientForHardBounce(
      baseInput({ clientId: "" }),
    );
    expect(findUnique).not.toHaveBeenCalled();
    expect(res.suppressed).toBe(false);
  });
});
