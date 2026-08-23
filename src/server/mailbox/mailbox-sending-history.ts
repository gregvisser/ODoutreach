import "server-only";

import { prisma } from "@/lib/db";

/**
 * How many distinct days has this mailbox actually SENT on?
 *
 * This is the warm-up ramp's anchor. It replaced mailbox age, which measured
 * the wrong thing: a mailbox connected months ago during onboarding and never
 * used looked fully warmed and received its whole daily allowance on its very
 * first send. Google conditions the rule on a history of sending, not on how
 * old an account is — see the note in `src/lib/mailboxes/mailbox-warmup.ts`.
 *
 * Counted as DISTINCT UTC DATES rather than total sends, so the ramp keeps the
 * shape it always had: five days at 5/day, then five at 10/day, and so on.
 * Counting total sends instead would let one busy day skip a whole step, which
 * is the opposite of warming up.
 *
 * Reads `OutboundEmail.sentAt` — a row only carries `sentAt` once the provider
 * actually accepted it, so queued-but-never-sent rows correctly count for
 * nothing. Backed by the existing `@@index([mailboxIdentityId, sentAt])`.
 */
export async function countMailboxSendingDays(
  mailboxIdentityId: string,
): Promise<number> {
  const rows = await prisma.$queryRaw<{ days: bigint }[]>`
    SELECT COUNT(DISTINCT DATE("sentAt" AT TIME ZONE 'UTC')) AS days
    FROM "OutboundEmail"
    WHERE "mailboxIdentityId" = ${mailboxIdentityId}
      AND "sentAt" IS NOT NULL
  `;
  const days = rows[0]?.days;
  return typeof days === "bigint" ? Number(days) : Number(days ?? 0);
}

/**
 * Sending-day counts for a whole mailbox pool, as a Map keyed by mailbox id.
 *
 * Resolved ONCE per dispatch batch, before the send transaction opens, so the
 * ramp costs one query per mailbox per batch rather than one per recipient —
 * and so no query runs inside the transaction that holds the reservation lock.
 *
 * A mailbox missing from the map has never sent. Callers must treat an absent
 * entry as 0, never as "unknown, so allow" — that would reinstate exactly the
 * defect this replaced.
 */
export async function countSendingDaysForPool(
  mailboxIds: readonly string[],
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (mailboxIds.length === 0) return out;

  const rows = await prisma.$queryRaw<
    { mailboxIdentityId: string; days: bigint }[]
  >`
    SELECT "mailboxIdentityId",
           COUNT(DISTINCT DATE("sentAt" AT TIME ZONE 'UTC')) AS days
    FROM "OutboundEmail"
    WHERE "mailboxIdentityId" = ANY(${[...mailboxIds]}::text[])
      AND "sentAt" IS NOT NULL
    GROUP BY "mailboxIdentityId"
  `;

  for (const r of rows) {
    out.set(
      r.mailboxIdentityId,
      typeof r.days === "bigint" ? Number(r.days) : Number(r.days ?? 0),
    );
  }
  // Absent = never sent. Make that explicit rather than leaving it to callers.
  for (const id of mailboxIds) if (!out.has(id)) out.set(id, 0);
  return out;
}
