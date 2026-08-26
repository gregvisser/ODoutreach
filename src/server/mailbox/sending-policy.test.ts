import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ClientMailboxIdentity, Prisma } from "@/generated/prisma/client";

/** sending-policy loads prisma; mock the module so the suite can run in CI without DATABASE_URL. */
vi.mock("@/lib/db", () => ({ prisma: {} }));

import {
  countBookedSendSlotsInUtcWindow,
  eligibleWorkspaceMailboxPool,
  mailboxIneligibleForGovernedSendExecution,
  mailboxIneligibleReasonFromStaticState,
  resolveGovernedSendingMailboxFromRows,
  resolveSendingGovernance,
  tryReserveSendSlotInTransaction,
} from "./sending-policy";

function asTx(over: Record<string, unknown>) {
  return over as unknown as Prisma.TransactionClient;
}

function baseMailbox(
  partial: Partial<ClientMailboxIdentity> = {},
): ClientMailboxIdentity {
  return {
    id: "m1",
    clientId: "c1",
    provider: "MICROSOFT",
    email: "a@b.co",
    emailNormalized: "a@b.co",
    displayName: null,
    connectionStatus: "CONNECTED",
    isActive: true,
    isPrimary: true,
    canSend: true,
    canReceive: true,
    dailySendCap: 30,
    isSendingEnabled: true,
    emailsSentToday: 0,
    dailyWindowResetAt: null,
    lastSyncAt: null,
    lastError: null,
    oauthState: null,
    oauthStateExpiresAt: null,
    providerLinkedUserId: "x",
    connectedAt: new Date(),
    workspaceRemovedAt: null,
    workspaceRemovedById: null,
    workspaceRemovedNote: null,
    createdByStaffUserId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...partial,
  } as ClientMailboxIdentity;
}

describe("mailboxIneligibleReasonFromStaticState", () => {
  const t0 = new Date("2026-01-10T12:00:00.000Z");
  it("returns inactive when mailbox inactive", () => {
    const m = baseMailbox({ isActive: false });
    expect(
      mailboxIneligibleReasonFromStaticState(m, t0, null, 30, 0),
    ).toBe("inactive_mailbox");
  });
  it("returns disconnect when not connected", () => {
    const m = baseMailbox({ connectionStatus: "DISCONNECTED" });
    expect(
      mailboxIneligibleReasonFromStaticState(m, t0, null, 30, 0),
    ).toBe("mailbox_not_connected");
  });
  it("returns sending_disabled when isSendingEnabled false", () => {
    const m = baseMailbox({ isSendingEnabled: false });
    expect(
      mailboxIneligibleReasonFromStaticState(m, t0, null, 30, 0),
    ).toBe("sending_disabled");
  });
  it("returns mailbox_removed_from_workspace when soft-removed", () => {
    const m = baseMailbox({ workspaceRemovedAt: new Date() });
    expect(
      mailboxIneligibleReasonFromStaticState(m, t0, null, 30, 0),
    ).toBe("mailbox_removed_from_workspace");
  });
  it("allows when under cap with ledger to be used later", () => {
    const m = baseMailbox({ emailsSentToday: 5 });
    expect(
      mailboxIneligibleReasonFromStaticState(m, t0, null, 30, 5),
    ).toBeNull();
  });
});

describe("mailboxIneligibleForGovernedSendExecution", () => {
  it("returns null for a fully eligible mailbox", () => {
    const m = baseMailbox();
    expect(mailboxIneligibleForGovernedSendExecution(m)).toBeNull();
  });
  it("returns mailbox_removed_from_workspace when soft-removed", () => {
    const m = baseMailbox({ workspaceRemovedAt: new Date() });
    expect(mailboxIneligibleForGovernedSendExecution(m)).toBe(
      "mailbox_removed_from_workspace",
    );
  });
  it("returns mailbox_not_connected when disconnected", () => {
    const m = baseMailbox({ connectionStatus: "DISCONNECTED" });
    expect(mailboxIneligibleForGovernedSendExecution(m)).toBe("mailbox_not_connected");
  });
  it("ignores daily cap — worker holds a reservation", () => {
    const m = baseMailbox({ emailsSentToday: 30 });
    expect(mailboxIneligibleForGovernedSendExecution(m)).toBeNull();
  });
});

describe("resolveSendingGovernance", () => {
  it("is legacy with no mailboxes", () => {
    expect(
      resolveSendingGovernance(false, { primaryConnected: null, anyConnected: null })
        .mode,
    ).toBe("legacy");
  });
  it("is ineligible with mailboxes but none connected", () => {
    const r = resolveSendingGovernance(true, {
      primaryConnected: null,
      anyConnected: null,
    });
    expect(r.mode).toBe("ineligible");
    if (r.mode === "ineligible") expect(r.reason).toBe("no_connected_sending_mailbox");
  });
  it("governs with a connected primary", () => {
    const m = baseMailbox();
    const r = resolveSendingGovernance(true, {
      primaryConnected: m,
      anyConnected: m,
    });
    expect(r.mode).toBe("governed");
  });
});

describe("tryReserveSendSlotInTransaction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("denies when ledger is at cap (mocked tx)", async () => {
    const m = baseMailbox();
    const tx = asTx({
      mailboxSendReservation: {
        findFirst: vi.fn().mockResolvedValue(null),
        count: vi.fn().mockResolvedValue(30),
        create: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn(),
      },
    });

    const r = await tryReserveSendSlotInTransaction(tx, {
      clientId: "c1",
      mailbox: m,
      idempotencyKey: "k1",
      at: new Date("2026-06-01T12:00:00.000Z"),
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errorCode).toBe("MAILBOX_DAILY_CAP");
    }
  });

  it("creates a reservation when under cap (mocked tx)", async () => {
    const m = baseMailbox();
    const create = vi.fn().mockResolvedValue({ id: "r1" });
    const tx = asTx({
      mailboxSendReservation: {
        findFirst: vi.fn().mockResolvedValue(null),
        count: vi.fn().mockResolvedValue(5),
        create,
        update: vi.fn(),
        updateMany: vi.fn(),
      },
    });

    const r = await tryReserveSendSlotInTransaction(tx, {
      clientId: "c1",
      mailbox: m,
      idempotencyKey: "k2",
      at: new Date("2026-06-01T12:00:00.000Z"),
    });
    expect(r.ok).toBe(true);
    expect("duplicate" in r && r.duplicate).toBe(false);
    if (r.ok) expect(create).toHaveBeenCalled();
  });
});

describe("eligibleWorkspaceMailboxPool (shared workspace mailbox access rule)", () => {
  it("includes every healthy connected mailbox regardless of which staff member connected it", () => {
    const rows = [
      baseMailbox({
        id: "m-alice",
        email: "alice@client.example",
        createdByStaffUserId: "staff-alice",
      }),
      baseMailbox({
        id: "m-bob",
        email: "bob@client.example",
        createdByStaffUserId: "staff-bob",
        isPrimary: false,
      }),
      baseMailbox({
        id: "m-carol",
        email: "carol@client.example",
        createdByStaffUserId: null,
        isPrimary: false,
      }),
    ];
    const pool = eligibleWorkspaceMailboxPool(rows);
    expect(pool.map((m) => m.id).sort()).toEqual([
      "m-alice",
      "m-bob",
      "m-carol",
    ]);
  });

  it("excludes a disconnected mailbox even when it is still flagged primary", () => {
    const pool = eligibleWorkspaceMailboxPool([
      baseMailbox({
        id: "broken-primary",
        isPrimary: true,
        connectionStatus: "CONNECTION_ERROR",
      }),
      baseMailbox({
        id: "ok-send",
        email: "ok@b.co",
        emailNormalized: "ok@b.co",
        isPrimary: false,
      }),
    ]);
    expect(pool.map((m) => m.id)).toEqual(["ok-send"]);
  });

  it("excludes a mailbox that is not connected", () => {
    const pool = eligibleWorkspaceMailboxPool([
      baseMailbox({ id: "ok" }),
      baseMailbox({ id: "bad", connectionStatus: "DISCONNECTED" }),
    ]);
    expect(pool.map((m) => m.id)).toEqual(["ok"]);
  });

  it("excludes a mailbox with sending disabled", () => {
    const pool = eligibleWorkspaceMailboxPool([
      baseMailbox({ id: "ok" }),
      baseMailbox({ id: "bad", isSendingEnabled: false }),
    ]);
    expect(pool.map((m) => m.id)).toEqual(["ok"]);
  });

  it("excludes an inactive mailbox", () => {
    const pool = eligibleWorkspaceMailboxPool([
      baseMailbox({ id: "ok" }),
      baseMailbox({ id: "bad", isActive: false }),
    ]);
    expect(pool.map((m) => m.id)).toEqual(["ok"]);
  });

  it("excludes a mailbox removed from the workspace (soft archive)", () => {
    const pool = eligibleWorkspaceMailboxPool([
      baseMailbox({ id: "ok" }),
      baseMailbox({ id: "bad", workspaceRemovedAt: new Date() }),
    ]);
    expect(pool.map((m) => m.id)).toEqual(["ok"]);
  });

  it("excludes a mailbox where canSend is false", () => {
    const pool = eligibleWorkspaceMailboxPool([
      baseMailbox({ id: "ok" }),
      baseMailbox({ id: "bad", canSend: false }),
    ]);
    expect(pool.map((m) => m.id)).toEqual(["ok"]);
  });

  it("does not filter by mailbox emailNormalized — any operator-email coupling would be a regression", () => {
    const pool = eligibleWorkspaceMailboxPool([
      baseMailbox({
        id: "unrelated",
        email: "ops-shared@client.example",
        emailNormalized: "ops-shared@client.example",
      }),
    ]);
    expect(pool).toHaveLength(1);
    expect(pool[0]?.emailNormalized).toBe("ops-shared@client.example");
  });

  it("returns an empty pool when no mailbox is healthy", () => {
    const pool = eligibleWorkspaceMailboxPool([
      baseMailbox({ id: "a", connectionStatus: "DISCONNECTED" }),
      baseMailbox({ id: "b", isSendingEnabled: false }),
    ]);
    expect(pool).toEqual([]);
  });
});

describe("countBookedSendSlotsInUtcWindow", () => {
  it("returns reservation count (mocked tx)", async () => {
    const tx = asTx({
      mailboxSendReservation: {
        count: vi.fn().mockResolvedValue(7),
      },
    });
    const c = await countBookedSendSlotsInUtcWindow(tx, "m1", "2026-06-01");
    expect(c).toBe(7);
  });
});

/**
 * The pick, separated from the fetch (queue item 3) so `loadClientWorkspaceBundle`
 * can resolve governance from the mailbox rows it ALREADY holds instead of
 * re-reading them. These assert the pick is unchanged by that split — this
 * function decides which mailbox a workspace is shown as sending from.
 */
describe("resolveGovernedSendingMailboxFromRows", () => {
  it("is legacy mode when the workspace has no mailbox rows at all", () => {
    expect(resolveGovernedSendingMailboxFromRows([])).toEqual({ mode: "legacy" });
  });

  it("prefers the primary connected mailbox over an earlier non-primary one", () => {
    const other = baseMailbox({ id: "m-other", isPrimary: false, email: "other@b.co" });
    const primary = baseMailbox({ id: "m-primary", isPrimary: true, email: "primary@b.co" });
    const r = resolveGovernedSendingMailboxFromRows([other, primary]);
    expect(r.mode).toBe("governed");
    expect(r.mode === "governed" && r.mailbox.id).toBe("m-primary");
  });

  it("falls back to any sendable mailbox when the primary cannot send", () => {
    const deadPrimary = baseMailbox({ id: "m-dead", isPrimary: true, canSend: false });
    const usable = baseMailbox({ id: "m-usable", isPrimary: false });
    const r = resolveGovernedSendingMailboxFromRows([deadPrimary, usable]);
    expect(r.mode).toBe("governed");
    expect(r.mode === "governed" && r.mailbox.id).toBe("m-usable");
  });

  it("is ineligible — NOT legacy — when mailboxes exist but none can send", () => {
    // The distinction that makes the `rows` argument required to be the
    // COMPLETE, unfiltered set: a pre-filtered empty list would read as
    // "this workspace has no mailboxes" and fall through to legacy mode.
    const r = resolveGovernedSendingMailboxFromRows([
      baseMailbox({ connectionStatus: "DISCONNECTED" }),
    ]);
    expect(r.mode).toBe("ineligible");
    expect(r.mode === "ineligible" && r.reason).toBe("no_connected_sending_mailbox");
  });
});
