/**
 * Client-scoped contact readiness view-model.
 *
 * Implements the validity rules captured in PR #21
 * (docs/ops/CLIENT_WORKSPACE_MODULE_AUDIT.md §0.1):
 *
 *   - A contact is **valid** when it is not suppressed AND has at least one
 *     outreach identifier (email, LinkedIn, mobile phone, office/landline).
 *   - A contact is **email-sendable** when it is valid AND has an email.
 *
 * The current `Contact` Prisma model only stores `email` and `isSuppressed`
 * as first-class identifier fields. LinkedIn / mobile / office phone columns
 * arrive in PR C (import contract). This helper accepts them as optional so
 * PR C can start populating them without reshaping the call sites.
 */

export type ContactIdentifierFields = {
  email?: string | null;
  linkedIn?: string | null;
  mobilePhone?: string | null;
  officePhone?: string | null;
  isSuppressed: boolean;
};

export type ContactReadiness = {
  hasEmail: boolean;
  hasLinkedIn: boolean;
  hasMobilePhone: boolean;
  hasOfficePhone: boolean;
  hasAnyOutreachIdentifier: boolean;
  isSuppressed: boolean;
  isValid: boolean;
  isEmailSendable: boolean;
};

export type ContactReadinessSummary = {
  total: number;
  valid: number;
  emailSendable: number;
  suppressed: number;
  /** Not suppressed but no email address present. */
  missingEmail: number;
  /** Not suppressed and no email / LinkedIn / mobile / office identifier. */
  missingOutreachIdentifier: number;
};

export type ContactReadinessStatusLabel =
  | "email_sendable"
  | "valid_no_email"
  | "suppressed"
  | "missing_identifier";

function hasNonEmpty(value: string | null | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

export function classifyContactReadiness(
  input: ContactIdentifierFields,
): ContactReadiness {
  const hasEmail = hasNonEmpty(input.email);
  const hasLinkedIn = hasNonEmpty(input.linkedIn);
  const hasMobilePhone = hasNonEmpty(input.mobilePhone);
  const hasOfficePhone = hasNonEmpty(input.officePhone);
  const hasAnyOutreachIdentifier =
    hasEmail || hasLinkedIn || hasMobilePhone || hasOfficePhone;
  const isSuppressed = input.isSuppressed;
  const isValid = !isSuppressed && hasAnyOutreachIdentifier;
  const isEmailSendable = isValid && hasEmail;
  return {
    hasEmail,
    hasLinkedIn,
    hasMobilePhone,
    hasOfficePhone,
    hasAnyOutreachIdentifier,
    isSuppressed,
    isValid,
    isEmailSendable,
  };
}

export function readinessStatusLabel(
  readiness: ContactReadiness,
): ContactReadinessStatusLabel {
  if (readiness.isSuppressed) return "suppressed";
  if (readiness.isEmailSendable) return "email_sendable";
  if (readiness.isValid) return "valid_no_email";
  return "missing_identifier";
}

export function summarizeContactReadiness(
  contacts: ContactIdentifierFields[],
): ContactReadinessSummary {
  let valid = 0;
  let emailSendable = 0;
  let suppressed = 0;
  let missingEmail = 0;
  let missingOutreachIdentifier = 0;

  for (const contact of contacts) {
    const readiness = classifyContactReadiness(contact);
    if (readiness.isValid) valid += 1;
    if (readiness.isEmailSendable) emailSendable += 1;
    if (readiness.isSuppressed) {
      suppressed += 1;
      continue;
    }
    if (!readiness.hasEmail) missingEmail += 1;
    if (!readiness.hasAnyOutreachIdentifier) missingOutreachIdentifier += 1;
  }

  return {
    total: contacts.length,
    valid,
    emailSendable,
    suppressed,
    missingEmail,
    missingOutreachIdentifier,
  };
}
