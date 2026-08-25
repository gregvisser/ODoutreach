import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock, syncMailboxInboxForMailboxMock } = vi.hoisted(() => ({
  prismaMock: {
    clientMailboxIdentity: { findMany: vi.fn() },
  },
  syncMailboxInboxForMailboxMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: prismaMock,
}));

import { syncActiveClientMailboxInboxes } from "./mailbox-inbox-sync";

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

