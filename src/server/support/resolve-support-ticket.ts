import "server-only";

import { prisma } from "@/lib/db";
import { isResolutionNoteReady } from "@/lib/support/support-labels";
import { buildSupportResolutionBody } from "./support-ticket-notifications";

export async function resolveSupportTicketWithNotification(input: {
  ticketId: string;
  resolutionNote: string;
}): Promise<{ notificationId: string; resolutionVersion: number }> {
  const resolutionNote = input.resolutionNote.trim();
  if (!isResolutionNoteReady(resolutionNote)) throw new Error("resolution-note-too-short");
  const resolvedAt = new Date();
  return prisma.$transaction(async (tx) => {
    const ticket = await tx.supportTicket.findUnique({
      where: { id: input.ticketId },
      select: { id: true, status: true, title: true, reporterEmail: true, resolutionVersion: true },
    });
    if (!ticket) throw new Error("ticket-not-found");
    if (ticket.status === "RESOLVED") throw new Error("already-resolved");
    const notification = await tx.supportTicketNotification.create({
      data: {
        ticketId: ticket.id,
        resolutionVersion: ticket.resolutionVersion,
        recipientEmail: ticket.reporterEmail,
        subject: `Your ODoutreach support ticket: ${ticket.title}`,
        body: buildSupportResolutionBody({ title: ticket.title, resolutionNote, resolvedAt }),
      },
      select: { id: true },
    });
    const updated = await tx.supportTicket.updateMany({
      where: { id: ticket.id, status: ticket.status, resolutionVersion: ticket.resolutionVersion },
      data: { status: "RESOLVED", resolvedAt, resolutionNote },
    });
    if (updated.count !== 1) throw new Error("ticket-changed-before-resolution");
    return { notificationId: notification.id, resolutionVersion: ticket.resolutionVersion };
  });
}
