import {
  classifyContactReadiness,
  type ContactIdentifierFields,
} from "@/lib/client-contacts-readiness";

/**
 * Pure policy helpers for sequence enrollment (PR D4c).
 *
 * These functions never touch the database. They exist to classify
 * candidates and compute idempotent enrollment diffs so the server
 * layer and tests can share the same rules.
 *
 * Enrollment selection rule: we enroll contacts that are
 * **email-sendable** (not suppressed AND has an email address).
 * Suppressed / missing-email / missing-identifier contacts are
 * **skipped** with counts — we do not persist EXCLUDED rows in this
 * PR. Re-running enrollment picks up any newly-sendable contacts
 * without duplicating rows, because `(sequenceId, contactId)` is
 * unique.
 */

export type EnrollableContact = ContactIdentifierFields & {
  contactId: string;
};

/** One candidate's bucket after classification. */
export type EnrollmentCandidateClassification =
  | "enrollable"
  | "suppressed"
  | "missing_email"
  | "missing_identifier";

export type EnrollmentCandidate = {
  contactId: string;
  classification: EnrollmentCandidateClassification;
};

export type EnrollmentPreviewCounts = {
  /** Total candidates considered (list members after any upstream scoping). */
  total: number;
  /** Contacts that would be newly inserted if the operator ran the action. */
  enrollable: number;
  /** Contacts that are already enrolled (any status) — counted separately so
   * the UI can show "X already enrolled, Y newly enrollable" honestly. */
  alreadyEnrolled: number;
  suppressed: number;
  missingEmail: number;
  missingIdentifier: number;
};

export type EnrollmentPreview = EnrollmentPreviewCounts & {
  enrollableContactIds: string[];
  skipped: EnrollmentCandidate[];
};

/**
 * Classify a single list member for enrollment.
 */
export function classifyEnrollmentCandidate(
  contact: EnrollableContact,
): EnrollmentCandidate {
  const readiness = classifyContactReadiness(contact);
  if (readiness.isSuppressed) {
    return { contactId: contact.contactId, classification: "suppressed" };
  }
  if (!readiness.hasAnyOutreachIdentifier) {
    return {
      contactId: contact.contactId,
      classification: "missing_identifier",
    };
  }
  if (!readiness.hasEmail) {
    return { contactId: contact.contactId, classification: "missing_email" };
  }
  return { contactId: contact.contactId, classification: "enrollable" };
}

/**
 * Build an idempotent enrollment preview from a list of candidates
 * and the set of contact ids already enrolled in this sequence.
 *
 * Candidates that appear in `alreadyEnrolledContactIds` are excluded
 * from `enrollableContactIds` regardless of their current
 * classification — re-enrollment never duplicates rows and never
 * mutates existing rows.
 */
export function buildEnrollmentPreview(params: {
  candidates: EnrollableContact[];
  alreadyEnrolledContactIds: ReadonlySet<string> | readonly string[];
}): EnrollmentPreview {
  const already =
    params.alreadyEnrolledContactIds instanceof Set
      ? (params.alreadyEnrolledContactIds as ReadonlySet<string>)
      : new Set<string>(
          params.alreadyEnrolledContactIds as readonly string[],
        );

  const enrollableContactIds: string[] = [];
  const skipped: EnrollmentCandidate[] = [];
  let alreadyEnrolledCount = 0;
  let suppressed = 0;
  let missingEmail = 0;
  let missingIdentifier = 0;

  const seen = new Set<string>();
  for (const candidate of params.candidates) {
    if (!candidate.contactId) continue;
    if (seen.has(candidate.contactId)) continue;
    seen.add(candidate.contactId);

    if (already.has(candidate.contactId)) {
      alreadyEnrolledCount += 1;
      continue;
    }
    const classification = classifyEnrollmentCandidate(candidate);
    switch (classification.classification) {
      case "enrollable":
        enrollableContactIds.push(candidate.contactId);
        break;
      case "suppressed":
        suppressed += 1;
        skipped.push(classification);
        break;
      case "missing_email":
        missingEmail += 1;
        skipped.push(classification);
        break;
      case "missing_identifier":
        missingIdentifier += 1;
        skipped.push(classification);
        break;
    }
  }

  return {
    total: seen.size,
    enrollable: enrollableContactIds.length,
    alreadyEnrolled: alreadyEnrolledCount,
    suppressed,
    missingEmail,
    missingIdentifier,
    enrollableContactIds,
    skipped,
  };
}

export type EnrollmentReadinessReason =
  | "sequence_not_approval_ready"
  | "sequence_archived"
  | "no_candidates"
  | "no_email_sendable"
  | "ready";

/**
 * Whether the operator is allowed to click "Create enrollment records"
 * for a sequence. Records-only: enrollment requires the sequence to
 * be READY_FOR_REVIEW or APPROVED (so staff have committed to a list
 * and a template ladder) and the list to have at least one
 * email-sendable candidate that isn't already enrolled.
 */
export function checkEnrollmentReadiness(params: {
  sequenceStatus:
    | "DRAFT"
    | "READY_FOR_REVIEW"
    | "APPROVED"
    | "ARCHIVED";
  preview: EnrollmentPreviewCounts;
}): {
  ok: boolean;
  reason: EnrollmentReadinessReason;
} {
  const { sequenceStatus, preview } = params;
  if (sequenceStatus === "ARCHIVED") {
    return { ok: false, reason: "sequence_archived" };
  }
  if (sequenceStatus === "DRAFT") {
    return { ok: false, reason: "sequence_not_approval_ready" };
  }
  if (preview.total === 0) {
    return { ok: false, reason: "no_candidates" };
  }
  if (preview.enrollable === 0) {
    return { ok: false, reason: "no_email_sendable" };
  }
  return { ok: true, reason: "ready" };
}

export const ENROLLMENT_STATUS_LABELS: Record<
  "PENDING" | "PAUSED" | "COMPLETED" | "EXCLUDED",
  string
> = {
  PENDING: "Pending",
  PAUSED: "Paused",
  COMPLETED: "Completed",
  EXCLUDED: "Excluded",
};
