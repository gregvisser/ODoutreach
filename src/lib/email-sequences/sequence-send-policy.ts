/**
 * Pure send-planning policy (PR D4e.1 — records only).
 *
 * Takes the already-loaded sequence/step/template + enrollment +
 * contact projections and classifies each enrollment into a
 * `ClientEmailSequenceStepSendStatus`. The planner at
 * `src/server/email-sequences/step-sends.ts` consumes this helper;
 * the dispatcher that actually sends email lands in D4e.2.
 *
 * No I/O, no Prisma, no clock.
 */

import type {
  ClientEmailSequenceEnrollmentStatus,
  ClientEmailSequenceStepSendStatus,
  ClientEmailTemplateStatus,
} from "@/generated/prisma/enums";

import {
  composeSequenceEmail,
  type SequenceCompositionContact,
  type SequenceCompositionResult,
  type SequenceCompositionSender,
} from "./sequence-email-composition";

/** Stable idempotency key for a (sequence, enrollment, step) triple. */
export function buildSequenceStepSendIdempotencyKey(args: {
  sequenceId: string;
  enrollmentId: string;
  stepId: string;
}): string {
  return `seq:${args.sequenceId}:enr:${args.enrollmentId}:step:${args.stepId}`;
}

export type SequenceStepSendClassificationReason =
  | "ready"
  | "blocked_wrong_client"
  | "blocked_wrong_sequence"
  | "blocked_step_not_in_sequence"
  | "blocked_template_mismatch"
  | "blocked_template_not_approved"
  | "blocked_missing_email"
  | "blocked_suppressed"
  | "blocked_unknown_placeholder"
  | "blocked_missing_unsubscribe_link"
  | "blocked_missing_required_field"
  | "skipped_enrollment_excluded"
  | "skipped_enrollment_completed";

export type SequenceStepSendClassification = {
  status: ClientEmailSequenceStepSendStatus;
  reason: SequenceStepSendClassificationReason;
  /** Short operator-facing detail (persisted to `blockedReason`). */
  reasonDetail: string | null;
  /** Rendered composition (always set — even when ok/sendReady are false). */
  composition: SequenceCompositionResult;
};

export type SequenceStepSendCandidate = {
  clientId: string;
  sequence: { id: string; clientId: string };
  step: {
    id: string;
    sequenceId: string;
    templateId: string;
  };
  template: {
    id: string;
    clientId: string;
    status: ClientEmailTemplateStatus;
    subject: string;
    content: string;
  };
  enrollment: {
    id: string;
    clientId: string;
    sequenceId: string;
    contactId: string;
    status: ClientEmailSequenceEnrollmentStatus;
  };
  contact: SequenceCompositionContact & {
    id: string;
    clientId: string;
    /** PR F2 cache flag — populated on every contact row. */
    isSuppressed: boolean;
  };
  sender: SequenceCompositionSender;
};

function block(
  reason: SequenceStepSendClassificationReason,
  detail: string,
  composition: SequenceCompositionResult,
  status: ClientEmailSequenceStepSendStatus = "BLOCKED",
): SequenceStepSendClassification {
  return { status, reason, reasonDetail: detail, composition };
}

/**
 * Classify a single (enrollment × step) candidate. Order matters:
 * tenant/structural guards come before composition so we return
 * actionable reasons even when the composition helper would have
 * failed anyway.
 */
export function classifySequenceStepSendCandidate(
  input: SequenceStepSendCandidate,
): SequenceStepSendClassification {
  const emptyComposition: SequenceCompositionResult = {
    ok: false,
    sendReady: false,
    subject: input.template.subject,
    body: input.template.content,
    usedPlaceholders: [],
    unknownPlaceholders: [],
    missingFields: [],
    warnings: [],
  };

  // 0. Tenant isolation — hard guards that never fail under the
  //    planner's happy path because the server query loads everything
  //    scoped by clientId, but we keep them as a second layer so a
  //    bug in the loader cannot fan out cross-client rows.
  if (input.sequence.clientId !== input.clientId) {
    return block(
      "blocked_wrong_client",
      "Sequence belongs to a different client.",
      emptyComposition,
    );
  }
  if (input.enrollment.clientId !== input.clientId) {
    return block(
      "blocked_wrong_client",
      "Enrollment belongs to a different client.",
      emptyComposition,
    );
  }
  if (input.contact.clientId !== input.clientId) {
    return block(
      "blocked_wrong_client",
      "Contact belongs to a different client.",
      emptyComposition,
    );
  }
  if (input.template.clientId !== input.clientId) {
    return block(
      "blocked_wrong_client",
      "Template belongs to a different client.",
      emptyComposition,
    );
  }
  if (input.enrollment.sequenceId !== input.sequence.id) {
    return block(
      "blocked_wrong_sequence",
      "Enrollment is not part of this sequence.",
      emptyComposition,
    );
  }
  if (input.step.sequenceId !== input.sequence.id) {
    return block(
      "blocked_step_not_in_sequence",
      "Step is not part of this sequence.",
      emptyComposition,
    );
  }
  if (input.step.templateId !== input.template.id) {
    return block(
      "blocked_template_mismatch",
      "Step's template does not match the resolved template row.",
      emptyComposition,
    );
  }
  if (input.enrollment.contactId !== input.contact.id) {
    return block(
      "blocked_wrong_client",
      "Enrollment's contact does not match the resolved contact.",
      emptyComposition,
    );
  }

  // 1. Enrollment lifecycle — operator intent to hold/exclude.
  //    PAUSED is NOT skipped here: an operator-triggered plan run
  //    should still produce a row so the reason is visible, but D4e.2
  //    will not flip PAUSED → SENT.
  if (input.enrollment.status === "EXCLUDED") {
    return {
      status: "SKIPPED",
      reason: "skipped_enrollment_excluded",
      reasonDetail: "Enrollment is EXCLUDED — step skipped.",
      composition: emptyComposition,
    };
  }
  if (input.enrollment.status === "COMPLETED") {
    return {
      status: "SKIPPED",
      reason: "skipped_enrollment_completed",
      reasonDetail: "Enrollment already COMPLETED.",
      composition: emptyComposition,
    };
  }

  // 2. Template approval — D4e.2 must never send a DRAFT /
  //    READY_FOR_REVIEW template.
  if (input.template.status !== "APPROVED") {
    return block(
      "blocked_template_not_approved",
      `Template is ${input.template.status}, not APPROVED.`,
      emptyComposition,
    );
  }

  // 3. Recipient sanity — cheap guards before composition.
  const email =
    typeof input.contact.email === "string" ? input.contact.email.trim() : "";
  if (email.length === 0) {
    return block(
      "blocked_missing_email",
      "Contact has no email — not email-sendable.",
      emptyComposition,
    );
  }
  if (input.contact.isSuppressed) {
    return {
      status: "SUPPRESSED",
      reason: "blocked_suppressed",
      reasonDetail: "Contact's email is currently suppressed.",
      composition: emptyComposition,
    };
  }

  // 4. Render + classify via the pure composition helper.
  const composition = composeSequenceEmail({
    subject: input.template.subject,
    content: input.template.content,
    contact: input.contact,
    sender: input.sender,
  });

  if (!composition.ok) {
    return {
      status: "BLOCKED",
      reason: "blocked_unknown_placeholder",
      reasonDetail: `Template references unknown placeholder(s): ${composition.unknownPlaceholders
        .map((k) => `{{${k}}}`)
        .join(", ")}`,
      composition,
    };
  }

  if (!composition.sendReady) {
    const missing = composition.missingFields;
    if (missing.includes("unsubscribe_link")) {
      return {
        status: "BLOCKED",
        reason: "blocked_missing_unsubscribe_link",
        reasonDetail:
          "Sender profile is missing an unsubscribe link — required for send.",
        composition,
      };
    }
    if (missing.includes("email")) {
      // Belt-and-braces — already handled above, but keeps the reason
      // deterministic if the composition helper returns missing email
      // even though we gated on it.
      return {
        status: "BLOCKED",
        reason: "blocked_missing_email",
        reasonDetail: "Contact has no email — not email-sendable.",
        composition,
      };
    }
    return {
      status: "BLOCKED",
      reason: "blocked_missing_required_field",
      reasonDetail: `Missing required sender field(s): ${missing
        .map((k) => `{{${k}}}`)
        .join(", ")}`,
      composition,
    };
  }

  return {
    status: "READY",
    reason: "ready",
    reasonDetail: null,
    composition,
  };
}

/** Shape the planner and UI use when aggregating classifications. */
export type SequenceStepSendClassificationCounts = {
  planned: number;
  ready: number;
  blocked: number;
  suppressed: number;
  skipped: number;
  sent: number;
  failed: number;
};

export function zeroStepSendCounts(): SequenceStepSendClassificationCounts {
  return {
    planned: 0,
    ready: 0,
    blocked: 0,
    suppressed: 0,
    skipped: 0,
    sent: 0,
    failed: 0,
  };
}

export function incrementStepSendCount(
  counts: SequenceStepSendClassificationCounts,
  status: ClientEmailSequenceStepSendStatus,
): SequenceStepSendClassificationCounts {
  switch (status) {
    case "PLANNED":
      return { ...counts, planned: counts.planned + 1 };
    case "READY":
      return { ...counts, ready: counts.ready + 1 };
    case "BLOCKED":
      return { ...counts, blocked: counts.blocked + 1 };
    case "SUPPRESSED":
      return { ...counts, suppressed: counts.suppressed + 1 };
    case "SKIPPED":
      return { ...counts, skipped: counts.skipped + 1 };
    case "SENT":
      return { ...counts, sent: counts.sent + 1 };
    case "FAILED":
      return { ...counts, failed: counts.failed + 1 };
    default: {
      const _x: never = status;
      return _x;
    }
  }
}
