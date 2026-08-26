/**
 * Narrowing "which clients may a machine act for" down to a Prisma filter.
 *
 * ## The hole this closes
 *
 * The dispatch gate in `executeOutboundSend` lets a row through when it carries
 * a `staffUserId`, on the reasoning that a person launched it. That reasoning is
 * sound for a launch — and WRONG for automated follow-ups.
 *
 * `advance-due-followups.ts` runs on the five-minute cron with a SYSTEM ACTOR:
 * it looks up the first ADMIN staff user and attributes the automated send to
 * them, so the tenant-access check and the audit log have someone to name. The
 * rows it creates therefore carry a staffUserId and are indistinguishable, at
 * dispatch, from something a person clicked.
 *
 * An agent that triggered the follow-up advancer would have generated real
 * outreach for every active client, and the send gate would have waved it
 * through. Catching that at dispatch is not possible without changing the
 * schema; stopping the rows being BORN is, and it is the better fix anyway.
 *
 * ## Why an empty list is the fail-closed answer
 *
 * `slug: { in: [] }` matches no rows. An active relay with a misconfigured
 * allowlist therefore generates follow-ups for nobody, which is the same answer
 * the send gate gives, reached the same way.
 */
import type { AutonomousRelayState } from "./autonomous-actor-guard";

/** A `Client` where-fragment. Empty object means "no additional restriction". */
export type AutonomousClientFilter = { slug?: { in: string[] } };

/**
 * Restrict a client query to those a machine may act for.
 *
 * Spread into an existing `where`. Returns `{}` when no relay is running, so
 * ordinary operation is untouched and the query plan is unchanged.
 */
export function autonomousClientWhereFilter(
  relay: AutonomousRelayState,
): AutonomousClientFilter {
  if (!relay.active) return {};
  // Normalised identically to the send gate. Two different notions of "is this
  // the allowlisted client" would be its own defect.
  const slugs = relay.allowlist.map((s) => s.trim().toLowerCase()).filter((s) => s.length > 0);
  return { slug: { in: slugs } };
}
