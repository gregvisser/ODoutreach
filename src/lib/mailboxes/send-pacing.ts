/**
 * Spread a mailbox's daily allowance across the working day.
 *
 * WITHOUT THIS, nothing stops a mailbox emptying its whole daily allowance into
 * the first cron run of the morning: `process-outbound-queue.yml` runs every
 * five minutes and the only limit is the daily cap. Thirty emails in ninety
 * seconds is not a person.
 *
 * ─── WHAT IS SOURCED, AND WHAT IS JUDGEMENT ────────────────────────────────
 * This distinction is deliberate and load-bearing. The "2% bounce rate" rule
 * this project carried for weeks turned out to have no provider behind it, so
 * nothing here is presented as a standard unless it is one.
 *
 * SOURCED:
 *   • Microsoft enforces a hard limit of 30 messages per MINUTE per mailbox.
 *     https://learn.microsoft.com/en-us/office365/servicedescriptions/
 *     exchange-online-service-description/exchange-online-limits
 *     A day's allowance dumped into one run sits right on that line.
 *   • Send at a CONSISTENT rate rather than in bursts — SendGrid's published
 *     guidance is explicitly not "60 as fast as possible, pause, 60 more".
 *   • Avoid :00, :15, :30 and :45. Those are ISP peak marks and mail queues
 *     behind everyone else's. SendGrid suggests odd offsets instead.
 *   • Google: "Start with a low sending volume ... and slowly increase."
 *     https://support.google.com/a/answer/81126
 *
 * NOT SOURCED — and stated plainly because it is widely repeated as if it were:
 *   The claim that a FIXED cadence is itself a detectable "fingerprint", and
 *   that intervals must therefore be randomised, has no provider or major-ESP
 *   guidance behind it that I could find, and the published advice points the
 *   other way (send consistently). The jitter below is therefore justified as
 *   HUMAN APPEARANCE and peak-avoidance only. It is deliberately MODEST for
 *   that reason — it is not pretending to be a deliverability control.
 *
 * JUDGEMENT, not standard: the working window, the jitter width, and the
 * minimum gap. Chosen values with reasoning, recorded here rather than
 * presented as received wisdom.
 * ───────────────────────────────────────────────────────────────────────────
 *
 * Everything is DETERMINISTIC, seeded from (mailboxId, dateKey). It has to be:
 * the dispatcher runs every five minutes and re-derives the schedule each time,
 * so a schedule that moved between runs would let the pacing gate leak.
 */

/**
 * 07:00 — matches the existing cron window in process-outbound-queue.yml, so
 * pacing never schedules a slot the dispatcher will not be awake for.
 */
export const PACING_WINDOW_START_MINUTE = 7 * 60;
/** 18:00 — the same window's end. A client's outreach does not go out at 03:00. */
export const PACING_WINDOW_END_MINUTE = 18 * 60;

/** ISP peak marks to steer away from (SendGrid). */
const PEAK_MARKS = [0, 15, 30, 45];
/** How close to a peak mark counts as "on" it, in minutes. Judgement. */
const PEAK_RADIUS = 1;
/**
 * Jitter as a fraction of the base spacing. Judgement, deliberately small:
 * enough that a mailbox does not tick like a metronome, not so much that the
 * spread stops being even. At 30/day (~22 min spacing) this is about ±6 min.
 */
const JITTER_FRACTION = 0.28;
/**
 * Never let two sends fall closer than this. Judgement, and the one number with
 * a real ceiling behind it: Microsoft's limit is 30 per minute, so anything
 * measured in minutes is comfortably clear — this exists to stop jitter
 * collapsing two slots together, not to satisfy a provider.
 */
const MIN_GAP_MINUTES = 5;

/** FNV-1a. Small, stable, and dependency-free — the values must not drift. */
function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32 — deterministic PRNG, so tests assert distribution not luck. */
function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Nudge a minute-of-day off an ISP peak mark, always forward, never far. */
function avoidPeak(minute: number): number {
  let m = minute;
  for (let guard = 0; guard < 8; guard += 1) {
    const mark = m % 60;
    const onPeak = PEAK_MARKS.some((p) => Math.abs(mark - p) <= PEAK_RADIUS || mark === 59);
    if (!onPeak) return m;
    m += PEAK_RADIUS + 1;
  }
  return m;
}

export type PacingInput = {
  mailboxId: string;
  /** UTC date key, e.g. "2026-09-01". Changes the schedule day to day. */
  dateKey: string;
  dailyCap: number;
};

/**
 * The minutes-of-day this mailbox is scheduled to send on, ascending.
 *
 * Base cadence is the window divided by the allowance — even spread, which is
 * the sourced part. Each slot then gets modest seeded jitter and a per-mailbox
 * offset so two mailboxes never march in step, and is nudged off the ISP peak
 * marks. Slots are clamped into the window and separated by MIN_GAP_MINUTES.
 */
export function sendSlotsForDay(input: PacingInput): number[] {
  const cap = Math.floor(input.dailyCap);
  if (!Number.isFinite(cap) || cap <= 0) return [];

  const windowMinutes = PACING_WINDOW_END_MINUTE - PACING_WINDOW_START_MINUTE;
  const rng = makeRng(hashString(`${input.mailboxId}|${input.dateKey}`));

  // Per-mailbox, per-day offset — two mailboxes starting at 07:00 together is
  // exactly the lockstep this is meant to avoid.
  const spacing = windowMinutes / cap;
  const offset = rng() * Math.min(spacing, 20);

  const slots: number[] = [];
  for (let i = 0; i < cap; i += 1) {
    const base = PACING_WINDOW_START_MINUTE + offset + i * spacing;
    const jitter = (rng() * 2 - 1) * spacing * JITTER_FRACTION;
    let m = Math.round(base + jitter);

    // Keep inside the window, keep a real gap, keep off the peak marks.
    const floor = slots.length ? slots[slots.length - 1] + MIN_GAP_MINUTES : PACING_WINDOW_START_MINUTE;
    m = Math.max(floor, Math.min(PACING_WINDOW_END_MINUTE, m));
    m = avoidPeak(m);
    m = Math.max(floor, Math.min(PACING_WINDOW_END_MINUTE, m));
    slots.push(m);
  }
  return slots;
}

/**
 * How many sends this mailbox is allowed to have made by `nowMinuteOfDay`.
 *
 * This is the gate the dispatcher uses: take the smaller of the daily cap and
 * this, subtract what has already gone, and that is what may go now. Before the
 * window opens it is 0; after it closes it is the full allowance, so nothing is
 * ever stranded by pacing alone.
 */
export function sendsPermittedByNow(
  input: PacingInput & { nowMinuteOfDay: number },
): number {
  const slots = sendSlotsForDay(input);
  if (slots.length === 0) return 0;
  if (input.nowMinuteOfDay >= PACING_WINDOW_END_MINUTE) return slots.length;
  let n = 0;
  for (const s of slots) {
    if (s <= input.nowMinuteOfDay) n += 1;
    else break;
  }
  return n;
}

/** UTC date key for an instant, matching the dispatcher's daily window. */
export function pacingDateKey(at: Date): string {
  return at.toISOString().slice(0, 10);
}

/** Minutes since UTC midnight, for `sendsPermittedByNow`. */
export function minuteOfDayUtc(at: Date): number {
  return at.getUTCHours() * 60 + at.getUTCMinutes();
}

/**
 * Pacing is flag-gated by `MAILBOX_SEND_PACING` and DEFAULTS OFF.
 *
 * Default-off is exactly how the NDR bounce detector ended up never running for
 * 36 days, so this one is documented in `.env.example` and called out in the PR
 * rather than left to be discovered later. It is off by default because it
 * changes WHEN real email leaves a live system, and that should be a deliberate
 * act — but it is meant to be turned ON before volume rises. At 5/day it barely
 * bites; at 30/day it is the difference between a person and a machine.
 */
export function isSendPacingEnabled(): boolean {
  return (process.env.MAILBOX_SEND_PACING ?? "").trim().toLowerCase() === "true";
}
