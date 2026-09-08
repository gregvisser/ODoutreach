import type { ClientSendingCalendar } from "@/generated/prisma/client";
import { utcDateKeyForInstant } from "@/lib/sending-window";
import { parseSendingCalendar, resolveSendingCalendarDay, type SendingCalendar } from "./sending-calendar";

const UTC_DAY: SendingCalendar = { timeZone: "UTC", weekdays: [0, 1, 2, 3, 4, 5, 6], startMinute: 0, endMinute: 1440 };
export type ClientSendingWindow = {
  key: string;
  startsAt: Date;
  endsAt: Date;
  calendar: SendingCalendar | null;
  /** Outreach pauses here, but replies may use the OLD day's remaining quota. */
  pausedUntil: Date | null;
};

function resolveDay(calendar: SendingCalendar | null, at: Date) {
  const result = resolveSendingCalendarDay(calendar ?? UTC_DAY, at);
  if (!result.ok) throw Error(result.error);
  return result.value;
}

/** Invalid/overlapping history is an error, never permission to use a fresh UTC bucket. */
export function resolveClientSendingWindow(clientId: string, revisions: readonly ClientSendingCalendar[], at: Date): ClientSendingWindow {
  if (!Number.isFinite(+at)) throw Error("Invalid sending instant.");
  const ordered = [...revisions].sort((a, b) => +a.effectiveAt - +b.effectiveAt);
  let previousCalendar: SendingCalendar | null = null;
  let previousEffective = -Infinity;
  const parsed = ordered.map(revision => {
    const result = parseSendingCalendar(revision);
    if (!result.ok || revision.clientId !== clientId || !Number.isFinite(+revision.previousDayEndsAt) ||
        !Number.isFinite(+revision.effectiveAt) || +revision.previousDayEndsAt <= previousEffective ||
        +revision.effectiveAt < +revision.previousDayEndsAt) throw Error("Invalid client sending calendar history.");
    const oldLastDay = resolveDay(previousCalendar, new Date(+revision.previousDayEndsAt - 1));
    const newFirstDay = resolveDay(result.value, revision.effectiveAt);
    if (+oldLastDay.endsAt !== +revision.previousDayEndsAt || +newFirstDay.startsAt !== +revision.effectiveAt) {
      throw Error("Calendar activation must preserve full accounting days.");
    }
    previousCalendar = result.value;
    previousEffective = +revision.effectiveAt;
    return { revision, calendar: result.value };
  });
  const active = parsed.findLast(entry => +entry.revision.effectiveAt <= +at);
  const pending = parsed.find(entry => +entry.revision.effectiveAt > +at);
  const calendar = active?.calendar ?? null;
  const inGap = pending && +at >= +pending.revision.previousDayEndsAt;
  const day = resolveDay(calendar, inGap ? new Date(+pending.revision.previousDayEndsAt - 1) : at);
  // Keep the old key and remaining quota throughout the transition extension.
  // This prevents a timezone edit creating a short additional allowance day.
  const extendsDay = pending && +day.endsAt === +pending.revision.previousDayEndsAt;
  return {
    key: active ? day.startsAt.toISOString() : utcDateKeyForInstant(day.startsAt),
    startsAt: day.startsAt,
    endsAt: extendsDay ? new Date(+pending.revision.effectiveAt) : day.endsAt,
    calendar,
    pausedUntil: inGap ? new Date(+pending.revision.effectiveAt) : null,
  };
}
