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
 * Never let two BATCHES fall closer than this. Judgement, and the one number
 * with a real ceiling behind it: Microsoft's limit is 30 per minute, so a batch
 * of four in a single minute is comfortably clear — this exists to stop jitter
 * collapsing two batches together, not to satisfy a provider.
 */
const MIN_GAP_MINUTES = 5;

/**
 * Four at a time. This is the number the client was promised, and it is
 * JUDGEMENT, not a standard — no provider publishes a batch size, and anyone
 * who tells you 4 is the safe number is repeating folklore.
 *
 * The argument for a batch at all is human appearance: a person clears a
 * handful of emails and then does something else for an hour. They do not emit
 * one message every twenty-two minutes all day, which is what an even drip
 * looks like from the outside. The gap BETWEEN batches still does the spreading
 * work the sourced guidance actually asks for.
 */
export const DEFAULT_SEND_BATCH_SIZE = 4;

/**
 * Ceiling on the per-client batch size. A batch is a burst by design, and this
 * setting is operator-editable, so it needs a hard stop that is not a typo away
 * from a mailbox's whole daily allowance leaving in one minute. 25 sits under
 * Microsoft's 30-per-minute hard limit with room to spare.
 */
export const MAX_SEND_BATCH_SIZE = 25;

/**
 * Turn whatever is on `Client.sendBatchSize` into a number that is safe to send
 * real email with.
 *
 * Null is the common case, not an error: every client predating the column has
 * one, and it means "use the house default". Everything else is clamped rather
 * than trusted — this value decides how much mail leaves at once, so a bad row
 * must land somewhere sane instead of opening the taps.
 */
export function resolveSendBatchSize(
  configured: number | null | undefined,
): number {
  if (configured === null || configured === undefined) {
    return DEFAULT_SEND_BATCH_SIZE;
  }
  if (Number.isNaN(configured)) return DEFAULT_SEND_BATCH_SIZE;
  if (configured > MAX_SEND_BATCH_SIZE) return MAX_SEND_BATCH_SIZE;
  const n = Math.floor(configured);
  if (n < 1) return 1;
  return n;
}

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
  /**
   * How many sends leave together, from `Client.sendBatchSize`. Null/undefined
   * means the client has not set one — see `resolveSendBatchSize`.
   */
  batchSize?: number | null;
};

/**
 * The minutes-of-day this mailbox is scheduled to send on, ascending. One entry
 * per send, so a batch of four appears as the same minute four times.
 *
 * The day is divided into BATCHES, not individual sends: base cadence is the
 * window divided by the batch COUNT — even spread, which is the sourced part.
 * Each batch anchor then gets modest seeded jitter and a per-mailbox offset so
 * two mailboxes never march in step, and is nudged off the ISP peak marks.
 * Anchors are clamped into the window and separated by MIN_GAP_MINUTES; the
 * whole batch then fires on its anchor minute.
 *
 * A batch size of 1 degenerates to the original one-at-a-time drip exactly,
 * including the random draw order, so that setting is not a new code path.
 */
export function sendSlotsForDay(input: PacingInput): number[] {
  const cap = Math.floor(input.dailyCap);
  if (!Number.isFinite(cap) || cap <= 0) return [];

  const batchSize = resolveSendBatchSize(input.batchSize);
  const batchCount = Math.ceil(cap / batchSize);

  const windowMinutes = PACING_WINDOW_END_MINUTE - PACING_WINDOW_START_MINUTE;
  const rng = makeRng(hashString(`${input.mailboxId}|${input.dateKey}`));

  // Per-mailbox, per-day offset — two mailboxes starting at 07:00 together is
  // exactly the lockstep this is meant to avoid.
  const spacing = windowMinutes / batchCount;
  const offset = rng() * Math.min(spacing, 20);

  const slots: number[] = [];
  let previousAnchor: number | null = null;
  for (let i = 0; i < batchCount; i += 1) {
    const base = PACING_WINDOW_START_MINUTE + offset + i * spacing;
    const jitter = (rng() * 2 - 1) * spacing * JITTER_FRACTION;
    let m = Math.round(base + jitter);

    // Keep inside the window, keep a real gap, keep off the peak marks.
    const floor =
      previousAnchor === null
        ? PACING_WINDOW_START_MINUTE
        : previousAnchor + MIN_GAP_MINUTES;
    m = Math.max(floor, Math.min(PACING_WINDOW_END_MINUTE, m));
    m = avoidPeak(m);
    m = Math.max(floor, Math.min(PACING_WINDOW_END_MINUTE, m));
    previousAnchor = m;

    // The last batch of the day carries the remainder — never a full batch of
    // invented sends. `slots.length` can only reach `cap`.
    const thisBatch = Math.min(batchSize, cap - slots.length);
    for (let k = 0; k < thisBatch; k += 1) slots.push(m);
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
 * Pacing DEFAULTS ON. `MAILBOX_SEND_PACING` is now an off-switch, not an
 * on-switch.
 *
 * It shipped default-off in PR #192, was never set in production, and therefore
 * never ran — the same shape as the NDR bounce detector that sat unused for 36
 * days, and the sixth instance this project has recorded of something built,
 * wired, reported as done, and never fired. A flag nobody sets is not a feature.
 *
 * Default-on is the safe direction to fail: pacing only ever WITHHOLDS part of a
 * cap until later in the day and never raises one, and it releases the full
 * allowance once the window shuts at 18:00 UTC — the outbound cron runs until
 * 18:55, so nothing is stranded overnight by pacing alone.
 *
 * Set `MAILBOX_SEND_PACING=false` to turn it off. Anything else, including
 * unset, means on.
 */
const PACING_OFF_VALUES = new Set(["false", "off", "0", "no"]);

export function isSendPacingEnabled(): boolean {
  const raw = (process.env.MAILBOX_SEND_PACING ?? "").trim().toLowerCase();
  return !PACING_OFF_VALUES.has(raw);
}

/**
 * How many of a mailbox's daily allowance may have gone by now — THE gate both
 * send paths use.
 *
 * This lived as a copy-pasted twelve-line block in `send-introduction.ts` and
 * `controlled-pilot-send.ts`, which is why nothing could assert that either one
 * actually called it. It is one function now so the wiring is testable.
 *
 * It never RAISES a cap. The most it can do is hold some of it back.
 */
export function pacedAllowanceForMailbox(input: {
  mailboxId: string;
  /** The mailbox's effective cap for the day, warm-up ramp already applied. */
  dailyCap: number;
  /** `Client.sendBatchSize` — null when the client has not set one. */
  batchSize: number | null | undefined;
  at: Date;
}): number {
  if (!isSendPacingEnabled()) return input.dailyCap;
  return Math.min(
    input.dailyCap,
    sendsPermittedByNow({
      mailboxId: input.mailboxId,
      dateKey: pacingDateKey(input.at),
      dailyCap: input.dailyCap,
      batchSize: input.batchSize,
      nowMinuteOfDay: minuteOfDayUtc(input.at),
    }),
  );
}
