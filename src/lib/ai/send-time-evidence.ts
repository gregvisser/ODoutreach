/**
 * AI-chosen send times — the evidence, computed WITHOUT a model.
 *
 * The queue asks for "AI-chosen send times". This file is the half that decides
 * whether there is anything for a model to choose FROM, and it exists because
 * the dangerous failure of a "best time to send" feature is not a wrong answer.
 * It is a confident answer built on nothing.
 *
 * Three things are settled here, deterministically and offline, before any money
 * is spent:
 *
 * 1. WHAT HOUR THE PROSPECT ACTUALLY SAW.
 *    `sentAt` is stored in UTC. The prospects are in the UK. For seven months of
 *    the year those differ by an hour, so bucketing by `getUTCHours()` would put
 *    every summer send in the wrong slot and produce a recommendation that is
 *    confidently sixty minutes wrong. Every timestamp is read in Europe/London.
 *
 * 2. WHETHER THE SAMPLE MEANS ANYTHING.
 *    `assessSendTimeEvidence` FAILS CLOSED. Below the thresholds it returns
 *    `sufficient: false`, the caller makes no model call, and the client is
 *    charged nothing. A thin slot — three sends, one reply, "33%" — is dropped
 *    before the model can see it, because a model shown 33% will recommend it
 *    over an honest 12% built on a hundred sends. The filtering is here rather
 *    than in the prompt because a prompt is advice and a filter is structure.
 *
 * 3. WHETHER THE APPLICATION COULD EVEN OBEY THE ANSWER.
 *    Nothing in this database decides when mail leaves. The only thing that does
 *    is a GitHub Actions cron in `.github/workflows/process-outbound-queue.yml`,
 *    which fires on UTC hours. So a recommendation of "07:00" is reachable in
 *    winter and impossible in summer, and one of "Saturday" is never reachable
 *    at all. `windowReachability` says which, so the panel can print it instead
 *    of letting an operator assume the system has started doing what it was told.
 *
 * NOTHING HERE SCHEDULES ANYTHING. There is no path from this file to the send
 * pipeline, and that is the point: see `send-time-advice.ts` for the guardrail
 * on the model's side of the same rule.
 */

/**
 * How far back a client's own history is read.
 *
 * Bounded because outreach copy and targeting change: a reply pattern from two
 * years and three campaigns ago is a different product's data wearing this
 * client's name. Exported rather than applied here so this module stays free of
 * a clock — a pure function that reads `Date.now()` cannot be tested at a fixed
 * point, and the tests are the reason to trust the thresholds.
 */
export const LOOKBACK_DAYS = 180;

/**
 * Sends a single weekday-and-hour slot needs before it is shown at all.
 *
 * This is the noise filter, and it is the most load-bearing number in the file.
 * See point 2 of the header.
 */
export const MIN_SLOT_SENDS = 25;

/** Distinct slots needed before "which time is better" is a question with an answer. */
export const MIN_QUALIFYING_SLOTS = 3;

/** Total sends, across qualifying slots, before any comparison is offered. */
export const MIN_TOTAL_SENDS = 200;

/**
 * Total replies needed. Separate from sends on purpose: a client can send
 * thousands of emails and get four replies, and four replies cannot tell one
 * hour of the week from another however many sends sit under them.
 */
export const MIN_TOTAL_REPLIES = 20;

/**
 * The UTC hours in which the automatic sender runs, from the cron expression in
 * `.github/workflows/process-outbound-queue.yml` (`*​/5 7-18 * * 1-5`).
 *
 * Duplicated here because a workflow file cannot be imported at runtime — but
 * NOT trusted to stay in step by hand: `send-time-evidence.test.ts` reads the
 * real workflow and asserts these two numbers still match it, so editing the
 * cron turns a test red rather than quietly making this module lie.
 */
export const AUTOMATIC_SENDER_UTC_HOURS = { first: 7, last: 18 } as const;

/** Weekday numbering matches `Date#getDay()`: 0 = Sunday … 6 = Saturday. */
const WEEKDAY_LABELS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

/** Short weekday names as `Intl` emits them, mapped back to `getDay()` numbers. */
const WEEKDAY_BY_SHORT_NAME: Readonly<Record<string, number>> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

export function weekdayLabel(weekday: number): string {
  return WEEKDAY_LABELS[weekday] ?? "";
}

/** One send, and whether it earned a reply. The only input this analysis needs. */
export interface SendOutcome {
  readonly sentAt: Date;
  readonly replied: boolean;
}

/** One weekday-and-hour slot, in UK local time, with what it achieved. */
export interface SlotStat {
  readonly weekday: number;
  readonly hour: number;
  readonly sent: number;
  readonly replied: number;
  /** Rounded to a whole percent: the screen shows "12%", not "12.4137%". */
  readonly replyRatePercent: number;
}

export type EvidenceVerdict =
  | {
      readonly sufficient: true;
      readonly slots: readonly SlotStat[];
      readonly totalSent: number;
      readonly totalReplied: number;
    }
  | { readonly sufficient: false; readonly reason: string };

/**
 * Built once. `Intl.DateTimeFormat` is expensive to construct and this runs over
 * every send in a six-month history.
 *
 * `hourCycle: "h23"` rather than `hour12: false` on purpose: the latter renders
 * midnight as "24" under some ICU versions, which would silently create a
 * twenty-fifth hour slot that no reachability rule matches.
 */
const UK_SLOT_FORMAT = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/London",
  weekday: "short",
  hour: "2-digit",
  hourCycle: "h23",
});

/**
 * The weekday and hour a UK reader saw this email.
 *
 * Handles the BST/GMT boundary because `Intl` does, rather than because anybody
 * wrote down when the clocks change.
 */
export function ukLocalSlot(date: Date): { weekday: number; hour: number } {
  const parts = UK_SLOT_FORMAT.formatToParts(date);
  const weekdayPart = parts.find((p) => p.type === "weekday")?.value ?? "";
  const hourPart = parts.find((p) => p.type === "hour")?.value ?? "";
  return {
    weekday: WEEKDAY_BY_SHORT_NAME[weekdayPart] ?? 0,
    hour: Number.parseInt(hourPart, 10) || 0,
  };
}

/**
 * Turn a client's send history into a table worth showing a model — or refuse.
 *
 * The order of the three refusals is deliberate: each names the thing that is
 * actually missing, so the panel can tell an operator "keep sending" rather than
 * the useless "not enough data".
 */
export function assessSendTimeEvidence(
  outcomes: readonly SendOutcome[],
): EvidenceVerdict {
  const buckets = new Map<string, { weekday: number; hour: number; sent: number; replied: number }>();

  for (const outcome of outcomes) {
    const { weekday, hour } = ukLocalSlot(outcome.sentAt);
    const key = `${String(weekday)}:${String(hour)}`;
    const bucket = buckets.get(key) ?? { weekday, hour, sent: 0, replied: 0 };
    bucket.sent += 1;
    if (outcome.replied) bucket.replied += 1;
    buckets.set(key, bucket);
  }

  // Thin slots are dropped BEFORE the totals are taken, so the headline numbers
  // add up to the table printed under them. A total that counted rows the
  // operator cannot see is a reconciliation question nobody can answer.
  const slots: SlotStat[] = [...buckets.values()]
    .filter((b) => b.sent >= MIN_SLOT_SENDS)
    .map((b) => ({
      weekday: b.weekday,
      hour: b.hour,
      sent: b.sent,
      replied: b.replied,
      replyRatePercent: Math.round((b.replied / b.sent) * 100),
    }))
    .sort(
      (a, b) =>
        b.replyRatePercent - a.replyRatePercent ||
        b.sent - a.sent ||
        a.weekday - b.weekday ||
        a.hour - b.hour,
    );

  const totalSent = slots.reduce((sum, s) => sum + s.sent, 0);
  const totalReplied = slots.reduce((sum, s) => sum + s.replied, 0);

  if (totalSent < MIN_TOTAL_SENDS) {
    return {
      sufficient: false,
      reason: `Not enough sends yet — ${String(totalSent)} of the ${String(MIN_TOTAL_SENDS)} needed before send times can be compared.`,
    };
  }
  if (totalReplied < MIN_TOTAL_REPLIES) {
    return {
      sufficient: false,
      reason: `Not enough replies yet — ${String(totalReplied)} of the ${String(MIN_TOTAL_REPLIES)} needed before one time can be told apart from another.`,
    };
  }
  if (slots.length < MIN_QUALIFYING_SLOTS) {
    return {
      sufficient: false,
      reason: `This client has only sent at ${String(slots.length)} distinct times of day, so there is nothing to compare. Vary the sending times first.`,
    };
  }

  return { sufficient: true, slots, totalSent, totalReplied };
}

/**
 * Whether the automatic sender can send during a recommended window.
 *
 * "always" and "never" mean across the year; the two seasonal answers exist
 * because the cron fires on UTC hours while the recommendation is in UK local
 * time, so the reachable band SHIFTS by an hour when the clocks change.
 *
 * The window is read as `startHour` up to but not including `endHour`, and a
 * season counts as reachable if the sender runs during ANY hour of it — the
 * panel prints the sender's real hours alongside, so an operator can see a
 * partly-covered window for themselves rather than being told "never" about a
 * window that is mostly fine.
 */
export type WindowReachability = "always" | "summer_only" | "winter_only" | "never";

export function windowReachability(
  weekday: number,
  startHour: number,
  endHour: number,
): WindowReachability {
  // The cron's day field is `1-5`. UTC and UK dates only diverge around
  // midnight, and the sender never runs then, so the UTC weekday and the UK
  // weekday are the same day for every hour it could possibly fire in.
  if (weekday < 1 || weekday > 5) return "never";

  const start = Math.max(0, Math.min(23, Math.trunc(startHour)));
  // A zero-length or inverted window is read as the single hour it starts in,
  // rather than as an empty set that would report "never" for a real time.
  const end = Math.max(start + 1, Math.min(24, Math.trunc(endHour)));

  const winterFirst = AUTOMATIC_SENDER_UTC_HOURS.first;
  const winterLast = AUTOMATIC_SENDER_UTC_HOURS.last;
  // British Summer Time is UTC+1, so the same UTC firing lands an hour later on
  // a UK clock.
  const summerFirst = winterFirst + 1;
  const summerLast = winterLast + 1;

  const overlaps = (first: number, last: number): boolean =>
    start <= last && end - 1 >= first;

  const inWinter = overlaps(winterFirst, winterLast);
  const inSummer = overlaps(summerFirst, summerLast);

  if (inWinter && inSummer) return "always";
  if (inSummer) return "summer_only";
  if (inWinter) return "winter_only";
  return "never";
}
