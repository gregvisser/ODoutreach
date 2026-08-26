import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  prismaMock,
  syncMailboxInboxForMailboxMock,
  getMicrosoftTokenMock,
  getGoogleTokenMock,
  auditMock,
  reconcilePrimaryMock,
} = vi.hoisted(() => ({
  prismaMock: {
    clientMailboxIdentity: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    $transaction: vi.fn(),
  },
  syncMailboxInboxForMailboxMock: vi.fn(),
  getMicrosoftTokenMock: vi.fn(),
  getGoogleTokenMock: vi.fn(),
  auditMock: vi.fn(),
  reconcilePrimaryMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: prismaMock,
}));

vi.mock("@/server/mailbox/microsoft-mailbox-access", () => ({
  getMicrosoftGraphAccessTokenForMailbox: (...a: unknown[]) => getMicrosoftTokenMock(...a),
}));

vi.mock("@/server/mailbox/google-mailbox-access", () => ({
  getGoogleGmailAccessTokenForMailbox: (...a: unknown[]) => getGoogleTokenMock(...a),
}));

vi.mock("@/server/mailbox/mailbox-connection-audit", () => ({
  auditMailboxConnectionChange: (...a: unknown[]) => auditMock(...a),
}));

vi.mock("@/server/mailbox/mailbox-primary-consistency", () => ({
  reconcilePrimaryMailboxForClient: (...a: unknown[]) => reconcilePrimaryMock(...a),
}));

import {
  syncActiveClientMailboxInboxes,
  syncGoogleInboxForMailbox,
  syncMicrosoftInboxForMailbox,
} from "./mailbox-inbox-sync";

describe("syncActiveClientMailboxInboxes", () => {
  beforeEach(() => {
    prismaMock.clientMailboxIdentity.findMany.mockReset();
    syncMailboxInboxForMailboxMock.mockReset();
  });

  it("syncs only the bounded eligible mailbox list with null staff user", async () => {
    prismaMock.clientMailboxIdentity.findMany.mockResolvedValue([
      { id: "m1", clientId: "c1" },
      { id: "m2", clientId: "c1" },
    ]);
    syncMailboxInboxForMailboxMock
      .mockResolvedValueOnce({ ok: true, ingested: 3, totalSeen: 10, repliesLinked: 1 })
      .mockResolvedValueOnce({ ok: false, error: "Reconnect required" });

    const result = await syncActiveClientMailboxInboxes({
      maxMailboxes: 2,
      perMailboxTop: 25,
      syncOne: syncMailboxInboxForMailboxMock,
    });

    expect(prismaMock.clientMailboxIdentity.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 2,
        where: expect.objectContaining({
          connectionStatus: "CONNECTED",
          workspaceRemovedAt: null,
          client: { status: "ACTIVE" },
        }),
      }),
    );
    expect(syncMailboxInboxForMailboxMock).toHaveBeenCalledWith({
      clientId: "c1",
      mailboxIdentityId: "m1",
      staffUserId: null,
      top: 25,
    });
    expect(result).toMatchObject({
      processed: 2,
      succeeded: 1,
      failed: 1,
      ingested: 3,
      totalSeen: 10,
      repliesLinked: 1,
    });
  });
});

describe("a failed mailbox says WHICH mailbox and WHY", () => {
  /**
   * Found live on 2026-08-25, not by reading the code.
   *
   * The alert correctly reported "reply sync failed for 8 of 35 mailboxes" and
   * could say NOTHING about which eight or why — because this batch counted
   * `failed += 1` and threw the per-mailbox `error` string away. The reason
   * existed at every single failure and was discarded one line later.
   *
   * "8 of 35 failed" sends someone hunting through 35 mailboxes. "jo@x.co.uk:
   * Reconnect required" is a job. An alert that cannot say why is a pager.
   */
  beforeEach(() => {
    prismaMock.clientMailboxIdentity.findMany.mockReset();
    syncMailboxInboxForMailboxMock.mockReset();
  });

  it("carries the address and the reason for each failure", async () => {
    prismaMock.clientMailboxIdentity.findMany.mockResolvedValue([
      { id: "m1", clientId: "c1", email: "jo@example.co.uk" },
      { id: "m2", clientId: "c1", email: "sam@example.com" },
      { id: "m3", clientId: "c2", email: "pat@example.com" },
    ]);
    syncMailboxInboxForMailboxMock
      .mockResolvedValueOnce({ ok: false, error: "Reconnect required" })
      .mockResolvedValueOnce({ ok: true, ingested: 1, totalSeen: 2, repliesLinked: 0 })
      .mockResolvedValueOnce({ ok: false, error: "Graph 401: token expired" });

    const result = await syncActiveClientMailboxInboxes({
      maxMailboxes: 3,
      syncOne: syncMailboxInboxForMailboxMock,
    });

    expect(result.failed).toBe(2);
    expect(result.errors).toEqual([
      "jo@example.co.uk: Reconnect required",
      "pat@example.com: Graph 401: token expired",
    ]);
  });

  it("selects the address, or it could never name the mailbox", async () => {
    prismaMock.clientMailboxIdentity.findMany.mockResolvedValue([]);
    await syncActiveClientMailboxInboxes({ syncOne: syncMailboxInboxForMailboxMock });
    expect(prismaMock.clientMailboxIdentity.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({ email: true }),
      }),
    );
  });

  it("is empty, not absent, when every mailbox succeeds", async () => {
    // A clean run must not produce a key that reads as "unknown".
    prismaMock.clientMailboxIdentity.findMany.mockResolvedValue([
      { id: "m1", clientId: "c1", email: "jo@example.co.uk" },
    ]);
    syncMailboxInboxForMailboxMock.mockResolvedValue({
      ok: true,
      ingested: 0,
      totalSeen: 0,
      repliesLinked: 0,
    });

    const result = await syncActiveClientMailboxInboxes({ syncOne: syncMailboxInboxForMailboxMock });
    expect(result.errors).toEqual([]);
  });

  it("does not let one pathological run flood the alert email", async () => {
    prismaMock.clientMailboxIdentity.findMany.mockResolvedValue(
      Array.from({ length: 60 }, (_, i) => ({
        id: `m${i}`,
        clientId: "c1",
        email: `user${i}@example.com`,
      })),
    );
    syncMailboxInboxForMailboxMock.mockResolvedValue({ ok: false, error: "down" });

    const result = await syncActiveClientMailboxInboxes({
      maxMailboxes: 60,
      syncOne: syncMailboxInboxForMailboxMock,
    });

    // The COUNT stays true even though the list is trimmed — the number is the
    // thing being alerted on, and truncating it would under-report a failure.
    expect(result.failed).toBe(60);
    expect(result.errors.length).toBeLessThanOrEqual(20);
  });
});


/**
 * The most dangerous thing in EIGHT-DEAD-MAILBOXES.md.
 *
 * Live on 2026-08-25, eight of thirty-five production mailboxes had dead
 * credentials and every one of them still read "Connected" on screen. Staff
 * look at that word and believe it; every other problem hides behind it.
 *
 * Reply sync is the ONLY thing that touches these tokens between campaigns —
 * nobody has sent since 3 July — so it is the only place that can find out a
 * mailbox is dead. It knew, and wrote the reason to `lastError` while leaving
 * `connectionStatus` on CONNECTED.
 */
describe("a mailbox whose credentials are dead must stop reading CONNECTED", () => {
  const microsoftMailbox = {
    id: "mb-1",
    clientId: "c1",
    provider: "MICROSOFT" as const,
    connectionStatus: "CONNECTED" as const,
    email: "jo@chevronsecurity.co.uk",
    emailNormalized: "jo@chevronsecurity.co.uk",
    workspaceRemovedAt: null,
  };
  const googleMailbox = {
    ...microsoftMailbox,
    id: "mb-2",
    provider: "GOOGLE" as const,
    email: "cam@trainhugger.com",
    emailNormalized: "cam@trainhugger.com",
  };

  beforeEach(() => {
    prismaMock.clientMailboxIdentity.findFirst.mockReset();
    prismaMock.clientMailboxIdentity.update.mockReset().mockResolvedValue({});
    prismaMock.$transaction.mockReset().mockImplementation(
      async (fn: (tx: typeof prismaMock) => Promise<unknown>) => fn(prismaMock),
    );
    getMicrosoftTokenMock.mockReset();
    getGoogleTokenMock.mockReset();
    auditMock.mockReset().mockResolvedValue(undefined);
    reconcilePrimaryMock.mockReset().mockResolvedValue(undefined);
  });

  /** Every `update` call's `data` payload, flattened. */
  function updatePayloads(): Record<string, unknown>[] {
    return prismaMock.clientMailboxIdentity.update.mock.calls.map(
      (call: unknown[]) => (call[0] as { data: Record<string, unknown> }).data,
    );
  }

  it("flips an expired Google sign-in to CONNECTION_ERROR", async () => {
    prismaMock.clientMailboxIdentity.findFirst.mockResolvedValue(googleMailbox);
    getGoogleTokenMock.mockRejectedValue(
      new Error("Google token refresh failed: invalid_grant"),
    );

    const result = await syncGoogleInboxForMailbox({
      clientId: "c1",
      mailboxIdentityId: "mb-2",
      staffUserId: null,
    });

    expect(result.ok).toBe(false);
    const statuses = updatePayloads().map((d) => d.connectionStatus);
    expect(statuses).toContain("CONNECTION_ERROR");
  });

  it("flips a DELETED Microsoft account to DISCONNECTED, not CONNECTION_ERROR", async () => {
    // A deleted account is not a reconnect job. Leaving it in an error state
    // that invites "try again" is how two Chevron mailboxes generated a failure
    // every fifteen minutes for weeks with no possible resolution.
    prismaMock.clientMailboxIdentity.findFirst.mockResolvedValue(microsoftMailbox);
    getMicrosoftTokenMock.mockRejectedValue(
      new Error(
        "Microsoft token refresh failed: invalid_grant - AADSTS500341: The user account has been deleted from the directory.",
      ),
    );

    const result = await syncMicrosoftInboxForMailbox({
      clientId: "c1",
      mailboxIdentityId: "mb-1",
      staffUserId: null,
    });

    expect(result.ok).toBe(false);
    const statuses = updatePayloads().map((d) => d.connectionStatus);
    expect(statuses).toContain("DISCONNECTED");
    expect(statuses).not.toContain("CONNECTION_ERROR");
  });

  it("writes a reason a non-coder can act on, not just the provider's error code", async () => {
    prismaMock.clientMailboxIdentity.findFirst.mockResolvedValue(microsoftMailbox);
    getMicrosoftTokenMock.mockRejectedValue(
      new Error("invalid_grant - AADSTS500341: account deleted"),
    );

    await syncMicrosoftInboxForMailbox({
      clientId: "c1",
      mailboxIdentityId: "mb-1",
      staffUserId: null,
    });

    const errors = updatePayloads()
      .map((d) => d.lastError)
      .filter((v): v is string => typeof v === "string");
    expect(errors.some((e) => e.includes("cannot be reconnected"))).toBe(true);
  });

  it("does NOT knock a healthy mailbox out over a transient provider outage", async () => {
    // A Graph 503 is not a credential failure. Flipping every mailbox on a bad
    // afternoon would turn one outage into thirty-five manual reconnects.
    prismaMock.clientMailboxIdentity.findFirst.mockResolvedValue(microsoftMailbox);
    getMicrosoftTokenMock.mockRejectedValue(new Error("HTTP 503 Service Unavailable"));

    await syncMicrosoftInboxForMailbox({
      clientId: "c1",
      mailboxIdentityId: "mb-1",
      staffUserId: null,
    });

    for (const payload of updatePayloads()) {
      expect(payload.connectionStatus).toBeUndefined();
    }
  });

  it("re-points the client's primary mailbox when the dead one was primary", async () => {
    // Primary must be a CONNECTED mailbox. Flipping status without reconciling
    // would leave the workspace pointing at a mailbox that cannot send.
    prismaMock.clientMailboxIdentity.findFirst.mockResolvedValue(googleMailbox);
    getGoogleTokenMock.mockRejectedValue(new Error("invalid_grant"));

    await syncGoogleInboxForMailbox({
      clientId: "c1",
      mailboxIdentityId: "mb-2",
      staffUserId: null,
    });

    expect(reconcilePrimaryMock).toHaveBeenCalledWith(expect.anything(), "c1");
  });

  it("stops retrying the dead mailbox, because the batch only picks up CONNECTED", async () => {
    // The stop-retrying-forever fix is the flip itself: this batch selects on
    // CONNECTED, so a mailbox knocked out of it is not tried again until a
    // human reconnects it. Asserted here so the two halves cannot drift apart.
    prismaMock.clientMailboxIdentity.findMany.mockReset().mockResolvedValue([]);
    await syncActiveClientMailboxInboxes({ syncOne: syncMailboxInboxForMailboxMock });
    expect(prismaMock.clientMailboxIdentity.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ connectionStatus: "CONNECTED" }),
      }),
    );
  });
});
