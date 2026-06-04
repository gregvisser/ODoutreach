/**
 * Client-wide outreach cooldown — no contact can receive more than one
 * outreach email per client within this window. Applies across ALL
 * sequences for the client, so a contact emailed by Sequence A is
 * automatically skipped by Sequence B until the cooldown clears.
 *
 * Pure helpers — no I/O, no Prisma, no clock. The classifier in
 * `sequence-send-policy.ts` and the planner in `step-sends.ts` pass in
 * `now` / `lastSentAt` explicitly so this stays unit-testable.
 */

/** Days a contact stays in cooldown after their most recent send. */
export const CLIENT_OUTREACH_COOLDOWN_DAYS = 28;

/** When the contact becomes eligible again, given their last send. */
export function dateWhenContactEligibleAgain(
  lastSentAt: Date,
  cooldownDays: number = CLIENT_OUTREACH_COOLDOWN_DAYS,
): Date {
  const eligible = new Date(lastSentAt.getTime());
  eligible.setUTCDate(eligible.getUTCDate() + cooldownDays);
  return eligible;
}

/** True if this contact is still inside the cooldown window. */
export function isContactInCooldown(
  lastSentAt: Date | null | undefined,
  now: Date,
  cooldownDays: number = CLIENT_OUTREACH_COOLDOWN_DAYS,
): boolean {
  if (!lastSentAt) return false;
  const eligible = dateWhenContactEligibleAgain(lastSentAt, cooldownDays);
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
  cooldownDays: number = CLIENT_OUTREACH_COOLDOWN_DAYS,
): string {
  const eligible = dateWhenContactEligibleAgain(lastSentAt, cooldownDays);
  return `Already emailed for this client on ${isoDate(lastSentAt)} — eligible again on ${isoDate(
    eligible,
  )} (${String(cooldownDays)}-day cooldown).`;
}
