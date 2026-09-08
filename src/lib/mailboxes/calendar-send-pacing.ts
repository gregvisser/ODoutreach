import { MAX_MAILBOX_DAILY_SEND_CAP } from "@/lib/mailbox-identities";
import { PACING_WINDOW_END_MINUTE, PACING_WINDOW_START_MINUTE, sendSlotsForDay } from "./send-pacing";
import { resolveSendingCalendarDay } from "./sending-calendar";

type Input = { mailboxId: string; at: Date; dailyCap: number; batchSize?: number | null };
type Result = { ok: true; slots: Date[] } | { ok: false; error: string };
const MINUTE_MS = 60_000;
const MIN_BATCH_GAP_MS = 5 * MINUTE_MS;

/**
 * Reuse the existing deterministic batch pattern inside actual open minutes.
 * Never squeeze extra batches together to fill a short window: an allowance
 * is a ceiling, not a requirement to send all of it. No production caller uses
 * this until calendar accounting and dispatch eligibility are integrated.
 */
export function calendarSendSlotsForDay(calendar: unknown, input: Input): Result {
  const resolved = resolveSendingCalendarDay(calendar, input.at);
  if (!resolved.ok) return resolved;
  if (!Number.isFinite(input.dailyCap) || input.dailyCap <= 0) return { ok: true, slots: [] };
  const day = resolved.value;
  const cap = Math.min(MAX_MAILBOX_DAILY_SEND_CAP, Math.floor(input.dailyCap));
  const pattern = sendSlotsForDay({ ...input, dailyCap: cap, dateKey: `${day.timeZone}|${day.localDate}` });
  const available: number[] = [];
  for (const window of day.windows) {
    for (let minute = +window.startsAt; minute < +window.endsAt; minute += MINUTE_MS) available.push(minute);
  }
  if (!available.length) return { ok: true, slots: [] };
  const span = PACING_WINDOW_END_MINUTE - PACING_WINDOW_START_MINUTE + 1;
  const slots: Date[] = [];
  let priorPattern: number | undefined;
  let priorAnchor: number | undefined;
  for (const anchor of pattern) {
    if (anchor !== priorPattern) {
      const desired = available[Math.floor((anchor - PACING_WINDOW_START_MINUTE) / span * available.length)];
      const earliest = Math.max(desired, priorAnchor === undefined ? -Infinity : priorAnchor + MIN_BATCH_GAP_MS);
      const selected = available.find(minute => minute >= earliest);
      if (selected === undefined) break;
      priorAnchor = selected;
      priorPattern = anchor;
    }
    slots.push(new Date(priorAnchor!));
  }
  return { ok: true, slots };
}

/** The calendar always closes at the configured end, even if slots went unused. */
export function calendarSendsPermittedByNow(calendar: unknown, input: Input):
  { ok: true; permitted: number; isOpen: boolean } | { ok: false; error: string } {
  const day = resolveSendingCalendarDay(calendar, input.at);
  if (!day.ok) return day;
  const isOpen = day.value.windows.some(window => +window.startsAt <= +input.at && +input.at < +window.endsAt);
  if (!isOpen) return { ok: true, permitted: 0, isOpen: false };
  const schedule = calendarSendSlotsForDay(calendar, input);
  if (!schedule.ok) return schedule;
  return { ok: true, permitted: schedule.slots.filter(slot => +slot <= +input.at).length, isOpen: true };
}
