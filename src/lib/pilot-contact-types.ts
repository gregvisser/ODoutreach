export type PilotContactSummary = {
  totalContacts: number;
  suppressedCount: number;
  eligibleCount: number;
  eligibleEmailsSample: string[];
};

/**
 * Pure reducer that derives a `PilotContactSummary` from a list of
 * `(email, isSuppressed)` rows.
 *
 * PR F1: `email` may be `null` because `Contact.email` is now nullable.
 * A contact is "eligible" for the controlled-pilot sample iff it is not
 * suppressed AND has a non-empty email — a no-email contact is valid
 * but can never appear in the pilot-send recipient sample.
 *
 * Keeping this pure lets us test the eligibility rule without Prisma.
 */
export function summarizePilotContacts(
  contacts: ReadonlyArray<{ email: string | null; isSuppressed: boolean }>,
  sampleSize = 10,
): PilotContactSummary {
  const totalContacts = contacts.length;
  let suppressedCount = 0;
  const eligibleEmails: string[] = [];
  for (const c of contacts) {
    if (c.isSuppressed) {
      suppressedCount += 1;
      continue;
    }
    if (typeof c.email === "string" && c.email.length > 0) {
      eligibleEmails.push(c.email);
    }
  }
  return {
    totalContacts,
    suppressedCount,
    eligibleCount: eligibleEmails.length,
    eligibleEmailsSample: eligibleEmails.slice(0, sampleSize),
  };
}
