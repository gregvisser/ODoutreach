/**
 * Workspace-wide outreach cooldown — no email address can receive more
 * than one outreach email across the entire OpensDoors workspace within
 * this window. Applies across ALL clients and ALL sequences, so a
 * contact emailed by Client A is automatically skipped by Client B
 * until the cooldown clears. Matched by email address (case-insensitive)
 * rather than contactId, because the same person can be a separate
 * Contact row under each client.
 *
 * Pure helpers — no I/O, no Prisma, no clock. The classifier in
 * `sequence-send-policy.ts` and the planner in `step-sends.ts` pass in
 * `now` / `lastSentAt` explicitly so this stays unit-testable.
 */

/** Days an email stays in cooldown after its most recent send. */
export const OUTREACH_COOLDOWN_DAYS = 21;

/** When the contact becomes eligible again, given their last send. */
export function dateWhenEmailEligibleAgain(
  lastSentAt: Date,
  cooldownDays: number = OUTREACH_COOLDOWN_DAYS,
): Date {
  const eligible = new Date(lastSentAt.getTime());
  eligible.setUTCDate(eligible.getUTCDate() + cooldownDays);
  return eligible;
}

/** True if this email is still inside the cooldown window. */
export function isEmailInCooldown(
  lastSentAt: Date | null | undefined,
  now: Date,
  cooldownDays: number = OUTREACH_COOLDOWN_DAYS,
): boolean {
  if (!lastSentAt) return false;
  const eligible = dateWhenEmailEligibleAgain(lastSentAt, cooldownDays);
  return eligible.getTime() > now.getTime();
}

/** Format a YYYY-MM-DD UTC date string from a Date. */
function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Short staff-facing reason persisted to `blockedReason`. Includes the
 * dates so the operator can see when the contact becomes eligible.
 */
export function formatCooldownReason(
  lastSentAt: Date,
  cooldownDays: number = OUTREACH_COOLDOWN_DAYS,
): string {
  const eligible = dateWhenEmailEligibleAgain(lastSentAt, cooldownDays);
  return `Recently contacted on ${isoDate(lastSentAt)} — eligible again on ${isoDate(
    eligible,
  )} (${String(cooldownDays)}-day cooldown).`;
}
