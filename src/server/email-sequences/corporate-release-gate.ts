/**
 * The corporate four-at-a-time release gate, applied to a real mailbox pool.
 *
 * This is the thin database half of `@/lib/outreach/manual-send-window`. The
 * decision itself is pure and lives there; this module only fetches what that
 * decision needs — for each mailbox in the pool, how many sends it has already
 * made today and when the most recent one was.
 *
 * ## The one judgement call, recorded
 *
 * The owner described staff working a list by hand from one mailbox: "they can
 * only see the next 4 once they have manually sent the first 4". This app does
 * not work that way — a launch distributes a batch across a POOL of mailboxes.
 * The two models had to be reconciled, and the reconciliation is:
 *
 *   **the gate applies PER MAILBOX.**
 *
 * Each mailbox may take at most 4 recipients, and a mailbox that has just
 * completed a group of 4 is held for 45 minutes while the others carry on. For
 * a client with ONE sending mailbox — which is the case the owner was
 * describing — the behaviour is exactly what he asked for. For a client with
 * several, each mailbox independently behaves that way, which is what "the
 * clock is per mailbox, per account" says.
 *
 * The alternative reading (4 across the whole account) was rejected because it
 * would make a second mailbox pointless, and because the spec names the mailbox
 * as the unit of the clock.
 *
 * ## It can only ever reduce
 *
 * The caller combines this with `Math.min` against the allowance it already
 * computed. There is no value this module can return that lets a mailbox send
 * MORE than the daily cap, the warm-up ramp or the pacing gate already allow.
 * That is what made this safe to ship ahead of the rest of phase 2.
 */

import type { ClientAccountGrade } from "@/lib/clients/client-account-grade";
import { isCorporateGrade } from "@/lib/clients/client-account-grade";
import {
  MANUAL_SEND_GROUP_SIZE,
  decideManualSendWindow,
  type ManualSendRecord,
} from "@/lib/outreach/manual-send-window";
import { prisma } from "@/lib/db";

/**
 * How many more this mailbox may take right now, per mailbox id.
 *
 * A mailbox missing from the map is ungated (the client is not corporate). A
 * mailbox mapped to 0 is inside its 45-minute wait.
 */
export type CorporateReleaseAllowance = Map<string, number>;

/**
 * Work out each mailbox's release allowance for a corporate client.
 *
 * Returns an EMPTY map for any client that is not graded CORPORATE, so the
 * caller's `Math.min` is a no-op and behaviour is bit-for-bit what it was
 * before this gate existed. That is deliberate: an ungraded client must not
 * change the day it ships.
 */
export async function loadCorporateReleaseAllowance(input: {
  clientId: string;
  grade: ClientAccountGrade | null | undefined;
  mailboxIds: readonly string[];
  now: Date;
  /** Rows sent at or after this moment count towards the current group. */
  windowStart: Date;
}): Promise<CorporateReleaseAllowance> {
  const allowance: CorporateReleaseAllowance = new Map();
  if (!isCorporateGrade(input.grade) || input.mailboxIds.length === 0) {
    return allowance;
  }

  // Only rows that represent a real outbound attempt from one of THIS client's
  // mailboxes count. Scoping by clientId as well as mailbox id keeps the clock
  // per-account even in the (unsupported) case of a shared mailbox row.
  const rows = await prisma.outboundEmail.findMany({
    where: {
      clientId: input.clientId,
      mailboxIdentityId: { in: [...input.mailboxIds] },
      createdAt: { gte: input.windowStart },
    },
    select: { mailboxIdentityId: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });

  const historyByMailbox = new Map<string, ManualSendRecord[]>();
  for (const id of input.mailboxIds) {
    historyByMailbox.set(id, []);
  }
  for (const row of rows) {
    if (!row.mailboxIdentityId) continue;
    historyByMailbox.get(row.mailboxIdentityId)?.push({ sentAt: row.createdAt });
  }

  for (const id of input.mailboxIds) {
    const history = historyByMailbox.get(id) ?? [];
    // The queue handed to the decision is a placeholder of GROUP_SIZE units:
    // we only want the COUNT it would expose, and the gate never exposes more
    // than a group. The real recipients are placed by the caller.
    const decision = decideManualSendWindow({
      grade: "CORPORATE",
      queue: Array.from({ length: MANUAL_SEND_GROUP_SIZE }, (_, i) => i),
      mailboxSendHistory: history,
      now: input.now,
    });
    allowance.set(id, decision.exposed.length);
  }

  return allowance;
}
