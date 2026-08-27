import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * E-06, the prevention half: the same mailbox address must not be attachable
 * to a second workspace.
 *
 * There are exactly two ways an address enters a workspace, and both are
 * covered here. A third was checked and ruled out rather than assumed: the
 * OAuth callbacks cannot introduce a new address, because
 * `mailboxEmailsAlign` refuses a connection whose account does not equal the
 * row's `emailNormalized`, and `updateClientMailboxIdentity` has no email
 * field in its schema at all.
 *
 * These tests assert the refusal happens BEFORE the write, not that an error
 * is returned afterwards — a gate that lets the row be created and then
 * complains is not a gate.
 */

const { prismaMock, requireStaffMock, requireMutatorMock, reconcilePrimaryMock } = vi.hoisted(
  () => ({
    prismaMock: {
      clientMailboxIdentity: { findFirst: vi.fn(), findMany: vi.fn() },
      auditLog: { create: vi.fn() },
      $transaction: vi.fn(),
    },
    requireStaffMock: vi.fn(),
    requireMutatorMock: vi.fn(),
    reconcilePrimaryMock: vi.fn(),
  }),
);

vi.mock("@/lib/db", () => ({ prisma: prismaMock }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/server/auth/staff", () => ({
  requireOpensDoorsStaff: (...a: unknown[]) => requireStaffMock(...a),
}));
vi.mock("@/server/mailbox-identities/mutator-access", () => ({
  requireClientMailboxMutator: (...a: unknown[]) => requireMutatorMock(...a),
}));
vi.mock("@/server/mailbox/mailbox-primary-consistency", () => ({
  reconcilePrimaryMailboxForClient: (...a: unknown[]) => reconcilePrimaryMock(...a),
}));

import {
  createClientMailboxIdentity,
  restoreClientMailboxToWorkspace,
} from "./mailbox-identities-actions";

const SHARED = "lucy@acme-industrial.example";

/** A live row for the same address on a DIFFERENT workspace. */
const CONFLICT = {
  id: "mb-northwind",
  clientId: "client-northwind",
  client: { name: "Northwind Fabrication" },
};

const createInput = {
  clientId: "client-second",
  provider: "MICROSOFT" as const,
  email: SHARED,
  displayName: null,
  canSend: true,
  canReceive: true,
  isSendingEnabled: true,
  isActive: true,
  isPrimary: false,
  lastError: null,
  dailySendCap: 30,
};

describe("adding a mailbox that already belongs to another workspace", () => {
  beforeEach(() => {
    prismaMock.clientMailboxIdentity.findFirst.mockReset();
    prismaMock.clientMailboxIdentity.findMany.mockReset();
    prismaMock.$transaction.mockReset();
    requireStaffMock.mockReset();
    requireMutatorMock.mockReset();

    requireStaffMock.mockResolvedValue({ id: "staff-1", isSuperAdmin: false });
    requireMutatorMock.mockResolvedValue(undefined);
    // No clash within this workspace — the only check that existed before.
    prismaMock.clientMailboxIdentity.findFirst.mockResolvedValue(null);
  });

  it("is refused, and nothing is written", async () => {
    prismaMock.clientMailboxIdentity.findMany.mockResolvedValue([CONFLICT]);

    const result = await createClientMailboxIdentity(createInput);

    expect(result.ok).toBe(false);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("names the other workspace and says what to do", async () => {
    prismaMock.clientMailboxIdentity.findMany.mockResolvedValue([CONFLICT]);

    const result = await createClientMailboxIdentity(createInput);

    if (result.ok) throw new Error("expected a refusal");
    // "Already in use" with no name sends someone hunting through seventeen
    // workspaces. The message has to be actionable on its own.
    expect(result.error).toContain("Northwind Fabrication");
    expect(result.error).toContain(SHARED);
  });

  it("only looks at LIVE rows on other, non-deleted workspaces", async () => {
    prismaMock.clientMailboxIdentity.findMany.mockResolvedValue([]);
    prismaMock.$transaction.mockResolvedValue(undefined);

    await createClientMailboxIdentity(createInput);

    expect(prismaMock.clientMailboxIdentity.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          emailNormalized: SHARED,
          clientId: { not: "client-second" },
          // A mailbox removed from its workspace no longer syncs, so it must
          // not block a genuine re-add elsewhere.
          workspaceRemovedAt: null,
          client: { deletedAt: null },
        }),
      }),
    );
  });

  it("still allows an address that is on no other workspace", async () => {
    prismaMock.clientMailboxIdentity.findMany.mockResolvedValue([]);
    prismaMock.$transaction.mockResolvedValue(undefined);

    const result = await createClientMailboxIdentity(createInput);

    expect(result.ok).toBe(true);
    expect(prismaMock.$transaction).toHaveBeenCalled();
  });
});

describe("restoring a removed mailbox whose address was taken meanwhile", () => {
  beforeEach(() => {
    prismaMock.$transaction.mockReset();
    prismaMock.clientMailboxIdentity.findMany.mockReset();
    requireStaffMock.mockReset();
    requireMutatorMock.mockReset();

    requireStaffMock.mockResolvedValue({ id: "staff-1", isSuperAdmin: false });
    requireMutatorMock.mockResolvedValue(undefined);
  });

  /** Runs the action's transaction callback against a tx double. */
  function arrangeTransaction(conflicts: Array<typeof CONFLICT>) {
    const update = vi.fn().mockResolvedValue({});
    const tx = {
      clientMailboxIdentity: {
        findFirst: vi.fn().mockResolvedValue({
          id: "mb-restoring",
          clientId: "client-second",
          emailNormalized: SHARED,
          // Removed from the workspace, so it is eligible for restore.
          workspaceRemovedAt: new Date("2026-07-01T00:00:00Z"),
          isActive: false,
          provider: "MICROSOFT",
        }),
        findMany: vi.fn().mockResolvedValue(conflicts),
        count: vi.fn().mockResolvedValue(0),
        update,
      },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
    };
    prismaMock.$transaction.mockImplementation(
      async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
    );
    return { tx, update };
  }

  it("is refused rather than silently recreating the duplicate", async () => {
    const { update } = arrangeTransaction([CONFLICT]);

    const result = await restoreClientMailboxToWorkspace({
      clientId: "client-second",
      mailboxId: "mb-restoring",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("Northwind Fabrication");
    // The row must stay removed.
    expect(update).not.toHaveBeenCalled();
  });

  it("restores normally when the address is free", async () => {
    const { update } = arrangeTransaction([]);

    const result = await restoreClientMailboxToWorkspace({
      clientId: "client-second",
      mailboxId: "mb-restoring",
    });

    expect(result.ok).toBe(true);
    expect(update).toHaveBeenCalled();
  });
});
