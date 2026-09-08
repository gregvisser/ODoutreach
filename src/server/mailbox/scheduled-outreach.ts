import "server-only";
import { prisma } from "@/lib/db";
import { resolveClientSendingWindow } from "@/lib/mailboxes/sending-calendar-history";
import { resolveSendingCalendarDay } from "@/lib/mailboxes/sending-calendar";
import { listReplySyncMailboxIds } from "./mailbox-inbox-sync";

/** Match the existing weekday 07:00–18:59 UTC workflow for unset clients. */
export function isLegacyScheduledWindow(at: Date): boolean {
  return at.getUTCDay() >= 1 && at.getUTCDay() <= 5 && at.getUTCHours() >= 7 && at.getUTCHours() < 19;
}

/** Recomputed for every batch, so a snapshot cannot authorize a later closed day. */
export async function loadScheduledOutreachPlan(at = new Date()) {
  if (!Number.isFinite(+at)) throw Error("Invalid scheduled instant");
  const clients = await prisma.client.findMany({
    where: { deletedAt: null, status: { notIn: ["PAUSED", "ARCHIVED"] } },
    select: { id: true, sendingCalendars: { orderBy: { effectiveAt: "asc" } } },
    orderBy: { id: "asc" }, take: 1001,
  });
  if (clients.length > 1000) throw Error("Scheduled client plan exceeds its supported limit");
  const clientIds: string[] = [];
  for (const client of clients) {
    const window = resolveClientSendingWindow(client.id, client.sendingCalendars, at);
    if (window.pausedUntil) continue;
    if (!window.calendar) {
      if (isLegacyScheduledWindow(at)) clientIds.push(client.id);
      continue;
    }
    const day = resolveSendingCalendarDay(window.calendar, at);
    if (!day.ok) throw Error(day.error);
    if (day.value.windows.some(interval => +interval.startsAt <= +at && +at < +interval.endsAt)) clientIds.push(client.id);
  }
  return { clientIds, mailboxIds: await listReplySyncMailboxIds(clientIds) };
}
