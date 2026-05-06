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
      .mockResolvedValueOnce({ ok: true, ingested: 3, totalSeen: 10 })
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
    });
  });
});
