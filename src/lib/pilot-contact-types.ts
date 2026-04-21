import {
  classifyContactReadiness,
  readinessStatusLabel,
  type ContactIdentifierFields,
} from "@/lib/client-contacts-readiness";

export type PilotContactSummary = {
  totalContacts: number;
  suppressedCount: number;
  eligibleCount: number;
  eligibleEmailsSample: string[];
  /**
   * PR F2: not-suppressed contacts with a non-email identifier but no
   * email address. They are explicitly NOT pilot-sendable.
   */
  missingEmailCount: number;
  /**
   * PR F2: not-suppressed contacts with no email, LinkedIn, mobile, or
   * office phone. They are explicitly NOT pilot-sendable.
   */
  missingIdentifierCount: number;
};

/** Input row accepted by `summarizePilotContacts`. Identifier fields are
 * optional for backwards-compat with callers that only selected
 * `(email, isSuppressed)` prior to PR F2. */
export type PilotContactInput = {
  email: string | null;
  isSuppressed: boolean;
  linkedIn?: string | null;
  mobilePhone?: string | null;
  officePhone?: string | null;
};

/**
 * Pure reducer that derives a `PilotContactSummary` from a list of
 * contact rows.
 *
 * PR F1 made `email` nullable. PR F2 extends the summary so the pilot
 * panel can show an explicit "N missing email" / "N missing identifier"
 * breakdown instead of collapsing both into a generic "not eligible"
 * bucket.
 *
 * A contact is pilot-eligible iff it is not suppressed AND has a
 * non-empty email — a no-email contact is valid but can never appear
 * in the pilot-send recipient sample.
 */
export function summarizePilotContacts(
  contacts: ReadonlyArray<PilotContactInput>,
  sampleSize = 10,
): PilotContactSummary {
  const totalContacts = contacts.length;
  let suppressedCount = 0;
  let missingEmailCount = 0;
  let missingIdentifierCount = 0;
  const eligibleEmails: string[] = [];

  for (const c of contacts) {
    // Classify via the canonical readiness helper so the pilot summary
    // agrees bucket-for-bucket with `summarizeContactReadiness`. Callers
    // that only select (email, isSuppressed) will have undefined
    // identifier fields which the helper treats as "none present".
    const fields: ContactIdentifierFields = {
      email: c.email,
      linkedIn: c.linkedIn,
      mobilePhone: c.mobilePhone,
      officePhone: c.officePhone,
      isSuppressed: c.isSuppressed,
    };
    const label = readinessStatusLabel(classifyContactReadiness(fields));

    switch (label) {
      case "suppressed":
        suppressedCount += 1;
        break;
      case "valid_no_email":
        missingEmailCount += 1;
        break;
      case "missing_identifier":
        missingIdentifierCount += 1;
        break;
      case "email_sendable":
        if (typeof c.email === "string" && c.email.length > 0) {
          eligibleEmails.push(c.email);
        }
        break;
    }
  }

  return {
    totalContacts,
    suppressedCount,
    eligibleCount: eligibleEmails.length,
    eligibleEmailsSample: eligibleEmails.slice(0, sampleSize),
    missingEmailCount,
    missingIdentifierCount,
  };
}
