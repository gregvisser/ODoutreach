import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Prisma } from "@/generated/prisma/client";

import { reconcilePrimaryMailboxForClient } from "./mailbox-primary-consistency";

const findFirst = vi.fn();
const updateMany = vi.fn();
const update = vi.fn();

/** Minimal transaction-client stand-in — only the mailbox delegate is used. */
function makeTx(): Prisma.TransactionClient {
  return {
    clientMailboxIdentity: { findFirst, updateMany, update },
  } as unknown as Prisma.TransactionClient;
}

const CLIENT_ID = "client-1";

beforeEach(() => {
  findFirst.mockReset();
  updateMany.mockReset();
  update.mockReset();
});

describe("reconcilePrimaryMailboxForClient", () => {
  it("does nothing when the primary mailbox is still connected", () => {
    // No invalid primary found → no writes at all.
    findFirst.mockResolvedValueOnce(null);

    return reconcilePrimaryMailboxForClient(makeTx(), CLIENT_ID).then(() => {
      expect(updateMany).not.toHaveBeenCalled();
      expect(update).not.toHaveBeenCalled();
    });
  });

  it("looks for a primary mailbox that is not connected and not workspace-removed", async () => {
    findFirst.mockResolvedValueOnce(null);

    await reconcilePrimaryMailboxForClient(makeTx(), CLIENT_ID);

    expect(findFirst).toHaveBeenCalledWith({
      where: {
        clientId: CLIENT_ID,
        isPrimary: true,
        workspaceRemovedAt: null,
        connectionStatus: { not: "CONNECTED" },
      },
    });
  });

  it("clears primary from every mailbox when the primary is no longer connected", async () => {
    findFirst
      .mockResolvedValueOnce({ id: "mbx-broken" })
      .mockResolvedValueOnce(null);

    await reconcilePrimaryMailboxForClient(makeTx(), CLIENT_ID);

    expect(updateMany).toHaveBeenCalledWith({
      where: { clientId: CLIENT_ID, isPrimary: true },
      data: { isPrimary: false },
    });
  });

  it("promotes the first eligible connected sender", async () => {
    findFirst
      .mockResolvedValueOnce({ id: "mbx-broken" })
      .mockResolvedValueOnce({ id: "mbx-next" });

    await reconcilePrimaryMailboxForClient(makeTx(), CLIENT_ID);

    expect(update).toHaveBeenCalledWith({
      where: { id: "mbx-next" },
      data: { isPrimary: true },
    });
  });

  it("only considers a fully sendable mailbox for promotion, ordered by email", async () => {
    findFirst
      .mockResolvedValueOnce({ id: "mbx-broken" })
      .mockResolvedValueOnce({ id: "mbx-next" });

    await reconcilePrimaryMailboxForClient(makeTx(), CLIENT_ID);

    expect(findFirst).toHaveBeenNthCalledWith(2, {
      where: {
        clientId: CLIENT_ID,
        workspaceRemovedAt: null,
        isActive: true,
        connectionStatus: "CONNECTED",
        canSend: true,
        isSendingEnabled: true,
      },
      orderBy: { emailNormalized: "asc" },
    });
  });

  it("leaves the workspace with no primary when nothing is eligible", async () => {
    // Clearing must still happen — a disconnected mailbox must never stay primary,
    // even if there is no replacement to promote.
    findFirst
      .mockResolvedValueOnce({ id: "mbx-broken" })
      .mockResolvedValueOnce(null);

    await reconcilePrimaryMailboxForClient(makeTx(), CLIENT_ID);

    expect(updateMany).toHaveBeenCalledTimes(1);
    expect(update).not.toHaveBeenCalled();
  });

  it("clears before promoting, so two mailboxes are never primary at once", async () => {
    const order: string[] = [];
    updateMany.mockImplementation(async () => {
      order.push("clear");
      return { count: 1 };
    });
    update.mockImplementation(async () => {
      order.push("promote");
      return { id: "mbx-next" };
    });
    findFirst
      .mockResolvedValueOnce({ id: "mbx-broken" })
      .mockResolvedValueOnce({ id: "mbx-next" });

    await reconcilePrimaryMailboxForClient(makeTx(), CLIENT_ID);

    expect(order).toEqual(["clear", "promote"]);
  });

  it("scopes every write to the given workspace", async () => {
    findFirst
      .mockResolvedValueOnce({ id: "mbx-broken" })
      .mockResolvedValueOnce({ id: "mbx-next" });

    await reconcilePrimaryMailboxForClient(makeTx(), "client-99");

    for (const call of findFirst.mock.calls) {
      expect((call[0] as { where: { clientId: string } }).where.clientId).toBe(
        "client-99",
      );
    }
    expect(
      (updateMany.mock.calls[0][0] as { where: { clientId: string } }).where.clientId,
    ).toBe("client-99");
  });
});
