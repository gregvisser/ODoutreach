import type { ReplyClassificationLabel } from "@/lib/ai/reply-classification";

/**
 * The cross-client queue of replies that are still waiting on a human.
 *
 * ## Why this exists
 *
 * Queue row 80 puts reply classification first, and says why: "routing a
 * 'yes, happy to talk' to a human within minutes is worth more than every
 * open-count feature combined." Classification shipped, and the label is
 * rendered as a coloured badge inside ONE per-client Activity panel. So to
 * find the person who said yes, an operator had to open every client
 * workspace in turn and scan — which is the same shape as the weekly Google
 * reconnect chore before `/google-reconnects` existed, and it fails the same
 * way: the job gets half done, and the half nobody reached is a lost deal.
 *
 * Labelling a reply is not routing it. This module is the routing.
 *
 * ## Why it is pure
 *
 * No Prisma, no React. The interesting behaviour is entirely in the rules —
 * which replies count, what order they come in, and when one has waited too
 * long — so they are testable without a database, a key, or a bill. The query
 * that loads the facts lives in `src/server/queries/replies-needing-a-person.ts`.
 */

/**
 * How long a "wants to talk now" reply may sit before the screen calls it
 * overdue. Half a working day.
 *
 * The ambition in the brief is "within minutes", and a threshold of minutes
 * would be the honest transcription of it — but it would also paint every row
 * red permanently, and a screen that is always on fire is one nobody reads.
 * Four hours is the point at which a warm lead has measurably gone cold, and
 * it is a number a person can be held to.
 */
export const NOW_OVERDUE_AFTER_MS = 4 * 3_600_000;

/**
 * The same, for referrals and replies nobody could read. Longer on purpose:
 * these need a person, but none of them is a booking going cold.
 */
export const SOON_OVERDUE_AFTER_MS = 24 * 3_600_000;

/** NOW = book it. SOON = read it today. LATER = diarise it. */
export type TriageBand = "NOW" | "SOON" | "LATER";

/**
 * Everything the routing rules need about one reply.
 *
 * `handledAt`, `repliedAt` and `contactSuppressed` are the three DURABLE
 * traces of somebody having acted. The advisory `ReplyClaim` is deliberately
 * not among them: it is deleted the moment an operator acts and it expires
 * after 30 minutes anyway, so its absence cannot tell "nobody has touched
 * this" apart from "somebody dealt with it an hour ago".
 */
export type ReplyTriageFact = {
  replyId: string;
  clientId: string;
  clientName: string;
  fromEmail: string;
  subject: string | null;
  receivedAt: Date;
  classification: ReplyClassificationLabel | null;
  classificationRationale: string | null;
  /** An operator pressed "mark handled" on the conversation. */
  handledAt: Date | null;
  /** We wrote back. */
  repliedAt: Date | null;
  /** The contact was added to do-not-contact, which is also an answer. */
  contactSuppressed: boolean;
};

export type TriagedReply = ReplyTriageFact & {
  band: TriageBand;
  waitingMs: number;
  /** "5 minutes" | "3 hours" | "2 days" — for the sentence on the screen. */
  waitingLabel: string;
  overdue: boolean;
};

export type NeedsAPersonQueue = {
  /** Most urgent first. */
  entries: TriagedReply[];
  totalWaiting: number;
  /** POSITIVE only. The number Greg actually wants to see. */
  wantToTalkCount: number;
  overdueCount: number;
};

/**
 * Which band a label belongs to, or `null` for "this one is finished".
 *
 * NULL CLASSIFICATION IS SOON, NOT EXCLUDED, and that is the most important
 * line in this file. `InboundReply.classification` is null whenever the
 * feature is off, the call failed, or the model returned something we would
 * not store — and it is null for every reply in production today, because
 * ANTHROPIC_API_KEY is unset in Azure. Dropping null would leave this screen
 * confidently empty while the entire inbox went unrouted. The schema says the
 * same thing at the column: "Null must always route the reply to a person; it
 * never means 'nothing interesting here'."
 *
 * NOT_INTERESTED and UNSUBSCRIBE are the only labels that leave the queue. A
 * rejection needs no action, and an opt-out has already been acted on by
 * `suppressReplyOptOut` at ingest — the machine honoured it before a person
 * could, which is the point of that path.
 */
export function triageBandFor(
  classification: ReplyClassificationLabel | null,
): TriageBand | null {
  if (classification === null) return "SOON";
  switch (classification) {
    case "POSITIVE":
      return "NOW";
    case "REFERRAL":
    case "UNCLEAR":
      return "SOON";
    case "INTERESTED_LATER":
      return "LATER";
    case "NOT_INTERESTED":
    case "UNSUBSCRIBE":
      return null;
  }
}

/** True when this reply is still owed a human response. */
export function needsAPerson(fact: ReplyTriageFact): boolean {
  if (fact.handledAt !== null) return false;
  if (fact.repliedAt !== null) return false;
  if (fact.contactSuppressed) return false;
  return triageBandFor(fact.classification) !== null;
}

const BAND_ORDER: Record<TriageBand, number> = { NOW: 0, SOON: 1, LATER: 2 };

function overdueAfterMs(band: TriageBand): number | null {
  if (band === "NOW") return NOW_OVERDUE_AFTER_MS;
  if (band === "SOON") return SOON_OVERDUE_AFTER_MS;
  // A reply that asked to be contacted in Q1 cannot be late. Marking it
  // overdue would be a false alarm every single day until somebody clears it.
  return null;
}

/**
 * Whole units, largest that fits, phrased for a person reading a list.
 * A clock that has skewed backwards reads "just now" rather than a negative.
 */
function formatWaiting(waitingMs: number): string {
  if (waitingMs < 60_000) return "just now";
  const minutes = Math.floor(waitingMs / 60_000);
  if (minutes < 60) return `${String(minutes)} ${minutes === 1 ? "minute" : "minutes"}`;
  const hours = Math.floor(waitingMs / 3_600_000);
  if (hours < 24) return `${String(hours)} ${hours === 1 ? "hour" : "hours"}`;
  const days = Math.floor(waitingMs / 86_400_000);
  return `${String(days)} ${days === 1 ? "day" : "days"}`;
}

/**
 * Fold the loaded facts into the screen's list and its three counts.
 *
 * Ordering is band first, then LONGEST WAITING first inside the band. That is
 * deliberately the opposite of the per-client Activity panel's newest-first:
 * this is a work queue, not a feed, and the oldest unanswered warm lead is
 * precisely the one about to be lost.
 */
export function buildNeedsAPersonQueue(args: {
  facts: readonly ReplyTriageFact[];
  now: Date;
}): NeedsAPersonQueue {
  const nowMs = args.now.getTime();

  const entries: TriagedReply[] = [];
  for (const fact of args.facts) {
    if (!needsAPerson(fact)) continue;
    const band = triageBandFor(fact.classification);
    if (band === null) continue;

    const waitingMs = Math.max(0, nowMs - fact.receivedAt.getTime());
    const threshold = overdueAfterMs(band);

    entries.push({
      ...fact,
      band,
      waitingMs,
      waitingLabel: formatWaiting(waitingMs),
      overdue: threshold !== null && waitingMs > threshold,
    });
  }

  entries.sort((a, b) => {
    const byBand = BAND_ORDER[a.band] - BAND_ORDER[b.band];
    if (byBand !== 0) return byBand;
    // Longest waiting first.
    return b.waitingMs - a.waitingMs;
  });

  return {
    entries,
    totalWaiting: entries.length,
    wantToTalkCount: entries.filter((e) => e.classification === "POSITIVE").length,
    overdueCount: entries.filter((e) => e.overdue).length,
  };
}
