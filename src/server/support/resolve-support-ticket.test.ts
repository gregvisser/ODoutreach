import { describe, expect, it, vi } from "vitest";

const { transaction, ticketFindUnique, notificationCreate, ticketUpdateMany } = vi.hoisted(() => ({
  transaction: vi.fn(),
  ticketFindUnique: vi.fn(),
  notificationCreate: vi.fn(),
  ticketUpdateMany: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    $transaction: transaction,
  },
}));

import { resolveSupportTicketWithNotification } from "./resolve-support-ticket";

describe("resolveSupportTicketWithNotification", () => {
  it("creates the notification and resolution in one transaction", async () => {
    const tx = {
      supportTicket: { findUnique: ticketFindUnique, updateMany: ticketUpdateMany },
      supportTicketNotification: { create: notificationCreate },
    };
    transaction.mockImplementation(async (callback: (value: typeof tx) => Promise<unknown>) => callback(tx));
    ticketFindUnique.mockResolvedValue({
      id: "t1",
      status: "OPEN",
      title: "Unable to send sequence",
      reporterEmail: "reporter@example.com",
      resolutionVersion: 2,
    });
    notificationCreate.mockResolvedValue({ id: "n1" });
    ticketUpdateMany.mockResolvedValue({ count: 1 });

    await expect(resolveSupportTicketWithNotification({ ticketId: "t1", resolutionNote: "Added the unsubscribe footer." })).resolves.toEqual({
      notificationId: "n1",
      resolutionVersion: 2,
    });
    expect(notificationCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ ticketId: "t1", resolutionVersion: 2, recipientEmail: "reporter@example.com" }),
    }));
    expect(ticketUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "t1", status: "OPEN", resolutionVersion: 2 },
      data: expect.objectContaining({ status: "RESOLVED", resolutionNote: "Added the unsubscribe footer." }),
    }));
  });

  it("rejects a stale close when the ticket changed after it was read", async () => {
    const tx = {
      supportTicket: { findUnique: ticketFindUnique, updateMany: ticketUpdateMany },
      supportTicketNotification: { create: notificationCreate },
    };
    transaction.mockImplementation(async (callback: (value: typeof tx) => Promise<unknown>) => callback(tx));
    ticketFindUnique.mockResolvedValue({ id: "t1", status: "OPEN", title: "Ticket", reporterEmail: "r@example.com", resolutionVersion: 1 });
    notificationCreate.mockResolvedValue({ id: "n1" });
    ticketUpdateMany.mockResolvedValue({ count: 0 });
    await expect(resolveSupportTicketWithNotification({ ticketId: "t1", resolutionNote: "A sufficiently detailed fix." })).rejects.toThrow("ticket-changed-before-resolution");
  });
});
