/**
 * Reply claiming — pure logic.
 *
 * Greg's ask: "When someone opens a reply, it's marked as theirs, and the
 * second person sees 'Sarah is handling this, opened 2 minutes ago.'"
 *
 * It is ADVISORY, NOT A LOCK. Nothing here prevents a second operator from
 * replying, suppressing or marking handled. A hard lock creates a worse
 * problem than it solves — somebody opens a reply, goes to lunch, and a
 * waiting prospect goes unanswered. We tell the second person and let them
 * decide.
 *
 * This module is deliberately free of Prisma and React so the rules that
 * matter (who is shown, and for how long) are testable on their own.
 */

/**
 * A claim stops being shown after 30 minutes. Somebody who wandered off
 * should not haunt the record all day.
 */
export const REPLY_CLAIM_STALE_AFTER_MS = 30 * 60_000;

/**
 * Which conversation a claim is attached to.
 *
 * A prospect's reply is reachable by two routes — the inbound message detail
 * page and the linked-reply page. Both resolve to the SAME subject whenever
 * the mailbox sync correlated them, so a claim made on one route is visible
 * on the other. Webhook-ingested replies have no correlated mailbox message,
 * and fall back to their own id.
 */
export type ReplyClaimSubjectType = "INBOUND_MESSAGE" | "INBOUND_REPLY";

export type ReplyClaimSubject = {
  subjectType: ReplyClaimSubjectType;
  subjectId: string;
};

export type ReplyClaimRow = {
  staffUserId: string;
  displayName: string | null;
  email: string;
  claimedAt: Date;
};

export type VisibleReplyClaim = {
  staffUserId: string;
  /** Display name, falling back to the email address. */
  name: string;
  claimedAt: Date;
  /** "just now" | "1 minute ago" | "26 minutes ago" */
  agoLabel: string;
  /** Other live claimants beyond the one being named. Usually 0. */
  othersCount: number;
};

export function resolveReplyClaimSubject(args: {
  replyId: string;
  inboundMailboxMessageId: string | null;
}): ReplyClaimSubject {
  const correlated = args.inboundMailboxMessageId;
  if (correlated) {
    return { subjectType: "INBOUND_MESSAGE", subjectId: correlated };
  }
  return { subjectType: "INBOUND_REPLY", subjectId: args.replyId };
}

/**
 * Whole minutes, phrased for a person. A claim written moments ago reads
 * "just now" rather than "0 minutes ago". A clock that has skewed forward
 * (claim timestamped after `now`) also reads "just now" — never a negative.
 */
export function formatClaimAge(claimedAt: Date, now: Date): string {
  const elapsedMs = now.getTime() - claimedAt.getTime();
  const minutes = Math.floor(elapsedMs / 60_000);
  if (minutes <= 0) return "just now";
  if (minutes === 1) return "1 minute ago";
  return `${String(minutes)} minutes ago`;
}

export function isReplyClaimStale(claimedAt: Date, now: Date): boolean {
  return now.getTime() - claimedAt.getTime() >= REPLY_CLAIM_STALE_AFTER_MS;
}

/**
 * The single claim to show the current viewer, or `null` for "say nothing".
 *
 * Rules, in order:
 *   1. Never show viewers their own claim — nobody needs telling they opened
 *      the thing they are looking at.
 *   2. Drop anything older than 30 minutes.
 *   3. Name the most recent of what survives; count the rest.
 */
export function selectVisibleClaim(args: {
  claims: ReplyClaimRow[];
  viewerStaffUserId: string;
  now: Date;
}): VisibleReplyClaim | null {
  const live = args.claims.filter(
    (c) =>
      c.staffUserId !== args.viewerStaffUserId &&
      !isReplyClaimStale(c.claimedAt, args.now),
  );
  if (live.length === 0) return null;

  let newest = live[0];
  if (!newest) return null;
  for (const candidate of live) {
    if (candidate.claimedAt.getTime() > newest.claimedAt.getTime()) {
      newest = candidate;
    }
  }

  return {
    staffUserId: newest.staffUserId,
    name: newest.displayName ?? newest.email,
    claimedAt: newest.claimedAt,
    agoLabel: formatClaimAge(newest.claimedAt, args.now),
    othersCount: live.length - 1,
  };
}
