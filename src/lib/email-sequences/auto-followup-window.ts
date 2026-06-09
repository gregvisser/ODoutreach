/**
 * Freshness window for AUTOMATIC follow-up sending.
 *
 * A follow-up becomes eligible once its delay elapses. Without an upper
 * bound, enabling automation (or recovering after a pause/outage) would
 * instantly auto-send EVERY overdue follow-up at once — a "backlog blast"
 * (this is what produced the surprise burst during the mailbox incident).
 *
 * So the automatic sender additionally requires the follow-up to have
 * become due *recently* (within this window). Anything more overdue is
 * left READY and waits for a human "Send now" — it is never silently
 * dropped; it simply isn't auto-fired. The manual launch path applies NO
 * upper bound (an operator who clicks send means it).
 *
 * Pure — no I/O, no clock. Callers inject `nowMs`.
 */

export const DEFAULT_AUTO_FOLLOWUP_FRESHNESS_DAYS = 3;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Resolve the freshness window (days) from an env value, with a default. */
export function resolveAutoFollowUpFreshnessDays(raw?: string | null): number {
  const n = Number.parseInt((raw ?? "").trim(), 10);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_AUTO_FOLLOWUP_FRESHNESS_DAYS;
}

/** Convert a freshness window in days to milliseconds. */
export function freshnessDaysToMs(days: number): number {
  return Math.max(0, days) * DAY_MS;
}

/**
 * True when a follow-up is too far past its due time to be AUTO-sent.
 * `eligibleAt = prevSentAt + delay`. Not-yet-due rows are NOT "stale"
 * (the dispatcher's own delay guard handles those); only rows that are
 * due AND more than `maxOverdueMs` past due are considered stale.
 */
export function isFollowUpTooStaleForAutoSend(args: {
  prevSentAtMs: number;
  delayMs: number;
  nowMs: number;
  maxOverdueMs: number;
}): boolean {
  const eligibleAtMs = args.prevSentAtMs + Math.max(0, args.delayMs);
  if (args.nowMs < eligibleAtMs) return false; // not due yet
  return args.nowMs > eligibleAtMs + Math.max(0, args.maxOverdueMs);
}
