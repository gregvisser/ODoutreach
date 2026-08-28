import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { listActiveInternalSeedEmails } from "@/server/internal-seed/seed-allowlist";

/**
 * "An email we can prove this client sent" — declared once, for every screen.
 *
 * ## Why this module exists
 *
 * On 2026-08-27 a client's Overview page read "Activity — not started" while
 * that same client's Activity tab read "Emails sent 1". One fact, two answers,
 * two screens of one product, in front of a paying customer.
 *
 * Neither number was corrupt. They were answers to different questions:
 *
 *   * The Activity tab counted every OutboundEmail row whose send is PROVEN —
 *     a provider-confirmed status plus a `sentAt` or a `providerMessageId`.
 *   * The Overview counted only rows carrying one of three PROOF/PILOT metadata
 *     sentinels (`governedTestSend`, `internalProof`, `controlledPilot`), via
 *     `getRecentGovernedSendsForClient`.
 *
 * A real sequence introduction carries `metadata.kind = "sequenceIntroSend"`.
 * It matches the first question and fails the second. So the Overview was blind
 * to precisely the sends this product exists to make, and the day real outreach
 * started was the day the Overview began to contradict the rest of the app.
 *
 * The fix is not to make the two predicates agree. Two predicates that agree
 * today drift tomorrow. The fix is that there is only one predicate, here, and
 * both screens call it. `proven-send.test.ts` fails if they ever stop.
 *
 * This is the same shape as `record-bounce.ts`, added the day before for the
 * bounce-rate defect: two paths that must report one fact end in one function.
 *
 * `getRecentGovernedSendsForClient` is deliberately left alone. A ledger of
 * governed proof and pilot sends is a genuinely different thing, honestly
 * labelled; its only error was being read as if it meant "any activity".
 */

/**
 * Statuses in which a provider has confirmed the message left the building.
 * BOUNCED belongs here: a bounce is proof of a send, not the absence of one.
 */
export const PROVEN_SEND_STATUSES = [
  "SENT",
  "DELIVERED",
  "REPLIED",
  "BOUNCED",
] as const;

/** Inclusive-from / exclusive-to UTC bound, applied to `sentAt`. */
export type ProvenSendWindow = { gte: Date; lt: Date };

export type ProvenSentWhereInput = {
  /** One client id, or a Prisma scope such as `{ in: [...] }`. */
  clientId: Prisma.OutboundEmailWhereInput["clientId"];
  /**
   * Internal seed/allowlist addresses to exclude from reputation-sensitive
   * counts. `[]` when the feature flag is off, which is the default.
   */
  seedEmails: string[];
  /**
   * When set, only sends inside the window count. A `sentAt` inside the window
   * is itself the send proof, so the all-time OR-clause is not needed.
   */
  window?: ProvenSendWindow;
};

/**
 * The one predicate. Pure — takes no database and reads no environment, so it
 * can be compared field-for-field in a test.
 */
export function buildProvenSentWhere(
  input: ProvenSentWhereInput,
): Prisma.OutboundEmailWhereInput {
  const seedExclusion =
    input.seedEmails.length > 0 ? { toEmail: { notIn: input.seedEmails } } : {};
  const w = input.window
    ? { gte: input.window.gte, lt: input.window.lt }
    : undefined;
  return {
    clientId: input.clientId,
    ...seedExclusion,
    status: { in: [...PROVEN_SEND_STATUSES] },
    ...(w
      ? { sentAt: w }
      : {
          OR: [{ sentAt: { not: null } }, { providerMessageId: { not: null } }],
        }),
  };
}

/**
 * When this client last provably sent an email — whatever channel sent it and
 * whatever kind of send it was. `null` means it has genuinely never sent one.
 *
 * This is the Overview's activity signal. One indexed row.
 */
export async function getLatestProvenSendAt(
  clientId: string,
): Promise<Date | null> {
  const seedEmails = await listActiveInternalSeedEmails();
  const row = await prisma.outboundEmail.findFirst({
    where: buildProvenSentWhere({ clientId, seedEmails }),
    orderBy: { sentAt: "desc" },
    select: { sentAt: true, createdAt: true },
  });
  if (!row) return null;
  // A row can be proven by `providerMessageId` alone and carry no `sentAt`
  // (older Graph rows do). Falling back to `createdAt` keeps such a client out
  // of "not started" — which is the whole point of this module.
  return row.sentAt ?? row.createdAt;
}
