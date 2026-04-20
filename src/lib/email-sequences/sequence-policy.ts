import type {
  ClientEmailSequenceStatus,
  ClientEmailTemplateCategory,
  ClientEmailTemplateStatus,
} from "@/generated/prisma/enums";

import { TEMPLATE_CATEGORY_ORDER } from "@/lib/email-templates/template-policy";

/**
 * Pure policy helpers for client email sequences (PR D4b). No DB / no
 * Prisma client imports. All DB-facing behaviour lives in
 * `src/server/email-sequences/*`; keeping this layer pure lets unit
 * tests cover the interesting branches (unapproved template blocks
 * approval, mismatched category rejected, duplicate positions, empty
 * list blocks approval, etc.) without spinning up Prisma.
 *
 * Sequence rules enforced here:
 *   - Sequence belongs to one client; target ContactList must be same
 *     client (verified at the server-helper layer, not here).
 *   - Each step references one ClientEmailTemplate.
 *   - Only APPROVED templates may appear in READY_FOR_REVIEW /
 *     APPROVED sequences.
 *   - INTRODUCTION is required for READY_FOR_REVIEW / APPROVED.
 *   - Step category must match template category.
 *   - delayDays >= 0, INTRODUCTION delayDays must be 0.
 *   - No duplicate categories, no duplicate positions.
 */

export const SEQUENCE_STATUS_LABELS: Record<ClientEmailSequenceStatus, string> =
  {
    DRAFT: "Draft",
    READY_FOR_REVIEW: "Ready for review",
    APPROVED: "Approved",
    ARCHIVED: "Archived",
  };

export const SEQUENCE_STATUS_ORDER: readonly ClientEmailSequenceStatus[] = [
  "DRAFT",
  "READY_FOR_REVIEW",
  "APPROVED",
  "ARCHIVED",
];

/**
 * Display label for each step category — reuses the template category
 * enum so the two ladders stay aligned. The wording here is sequence-
 * focused ("Introduction step" vs "Introduction email").
 */
export const SEQUENCE_STEP_LABELS: Record<ClientEmailTemplateCategory, string> =
  {
    INTRODUCTION: "Introduction step",
    FOLLOW_UP_1: "Follow-up 1",
    FOLLOW_UP_2: "Follow-up 2",
    FOLLOW_UP_3: "Follow-up 3",
    FOLLOW_UP_4: "Follow-up 4",
    FOLLOW_UP_5: "Follow-up 5",
  };

/** Follow-up categories in scheduling order — no INTRODUCTION. */
export const SEQUENCE_FOLLOW_UP_ORDER: readonly ClientEmailTemplateCategory[] =
  TEMPLATE_CATEGORY_ORDER.filter((c) => c !== "INTRODUCTION");

export const SEQUENCE_NAME_MAX = 120;
export const SEQUENCE_DESCRIPTION_MAX = 1_000;
export const SEQUENCE_DELAY_DAYS_MAX = 180;

// ————————————————————————————————————————————————————————————————
// Metadata validation
// ————————————————————————————————————————————————————————————————

export type SequenceMetadataInput = {
  name: string;
  description: string | null | undefined;
  contactListId: string | null | undefined;
};

export type SequenceMetadataIssue = {
  field: "name" | "description" | "contactListId";
  message: string;
};

export type SequenceMetadataValidationResult = {
  ok: boolean;
  issues: SequenceMetadataIssue[];
};

export function validateSequenceInput(
  input: SequenceMetadataInput,
): SequenceMetadataValidationResult {
  const issues: SequenceMetadataIssue[] = [];
  const name = (input.name ?? "").trim();
  const description = (input.description ?? "").trim();
  const contactListId = (input.contactListId ?? "").trim();

  if (!name) {
    issues.push({ field: "name", message: "Sequence name is required." });
  } else if (name.length > SEQUENCE_NAME_MAX) {
    issues.push({
      field: "name",
      message: `Sequence name must be ${SEQUENCE_NAME_MAX} characters or fewer.`,
    });
  }

  if (description.length > SEQUENCE_DESCRIPTION_MAX) {
    issues.push({
      field: "description",
      message: `Description must be ${SEQUENCE_DESCRIPTION_MAX.toLocaleString()} characters or fewer.`,
    });
  }

  if (!contactListId) {
    issues.push({
      field: "contactListId",
      message: "Choose the contact list this sequence targets.",
    });
  }

  return { ok: issues.length === 0, issues };
}

// ————————————————————————————————————————————————————————————————
// Step validation
// ————————————————————————————————————————————————————————————————

/** A step proposed by the operator, paired with the template it picks. */
export type SequenceStepInput = {
  category: ClientEmailTemplateCategory;
  position: number;
  delayDays: number;
  template: {
    id: string;
    category: ClientEmailTemplateCategory;
    status: ClientEmailTemplateStatus;
    clientId?: string | null;
  };
};

export type SequenceStepsValidationInput = {
  steps: SequenceStepInput[];
  /**
   * Target status the caller wants to validate against. DRAFT accepts
   * unapproved templates so operators can iterate; READY/APPROVED
   * require approved templates + introduction.
   */
  targetStatus: ClientEmailSequenceStatus;
  /** Sequence's clientId — used to confirm template ownership. */
  sequenceClientId?: string | null;
};

export type SequenceStepIssue = {
  stepIndex: number | null;
  code:
    | "DUPLICATE_CATEGORY"
    | "DUPLICATE_POSITION"
    | "CATEGORY_MISMATCH"
    | "TEMPLATE_NOT_APPROVED"
    | "TEMPLATE_WRONG_CLIENT"
    | "NEGATIVE_DELAY"
    | "INTRODUCTION_DELAY"
    | "DELAY_TOO_LARGE"
    | "MISSING_INTRODUCTION"
    | "NO_STEPS";
  message: string;
};

export type SequenceStepsValidationResult = {
  ok: boolean;
  issues: SequenceStepIssue[];
};

export function validateSequenceSteps(
  input: SequenceStepsValidationInput,
): SequenceStepsValidationResult {
  const issues: SequenceStepIssue[] = [];
  const wantsApprovalStrength =
    input.targetStatus === "READY_FOR_REVIEW" ||
    input.targetStatus === "APPROVED";

  const seenCategories = new Map<ClientEmailTemplateCategory, number>();
  const seenPositions = new Map<number, number>();
  let hasIntroduction = false;

  input.steps.forEach((step, index) => {
    if (seenCategories.has(step.category)) {
      issues.push({
        stepIndex: index,
        code: "DUPLICATE_CATEGORY",
        message: `Only one ${SEQUENCE_STEP_LABELS[step.category]} is allowed per sequence.`,
      });
    } else {
      seenCategories.set(step.category, index);
    }

    if (seenPositions.has(step.position)) {
      issues.push({
        stepIndex: index,
        code: "DUPLICATE_POSITION",
        message: `Two steps cannot share position ${String(step.position)}.`,
      });
    } else {
      seenPositions.set(step.position, index);
    }

    if (step.template.category !== step.category) {
      issues.push({
        stepIndex: index,
        code: "CATEGORY_MISMATCH",
        message: `Template category (${step.template.category}) must match step category (${step.category}).`,
      });
    }

    if (
      input.sequenceClientId &&
      step.template.clientId &&
      step.template.clientId !== input.sequenceClientId
    ) {
      issues.push({
        stepIndex: index,
        code: "TEMPLATE_WRONG_CLIENT",
        message: "Step template must belong to the same client as the sequence.",
      });
    }

    if (step.delayDays < 0) {
      issues.push({
        stepIndex: index,
        code: "NEGATIVE_DELAY",
        message: "Delay days cannot be negative.",
      });
    } else if (step.delayDays > SEQUENCE_DELAY_DAYS_MAX) {
      issues.push({
        stepIndex: index,
        code: "DELAY_TOO_LARGE",
        message: `Delay must be ${SEQUENCE_DELAY_DAYS_MAX} days or fewer.`,
      });
    }

    if (step.category === "INTRODUCTION") {
      hasIntroduction = true;
      if (step.delayDays !== 0) {
        issues.push({
          stepIndex: index,
          code: "INTRODUCTION_DELAY",
          message: "Introduction step must have a 0-day delay.",
        });
      }
    }

    if (wantsApprovalStrength && step.template.status !== "APPROVED") {
      issues.push({
        stepIndex: index,
        code: "TEMPLATE_NOT_APPROVED",
        message: `Step uses a template that is ${step.template.status} — only APPROVED templates can power ready/approved sequences.`,
      });
    }
  });

  if (wantsApprovalStrength) {
    if (input.steps.length === 0) {
      issues.push({
        stepIndex: null,
        code: "NO_STEPS",
        message: "A sequence needs at least an introduction step to be ready.",
      });
    } else if (!hasIntroduction) {
      issues.push({
        stepIndex: null,
        code: "MISSING_INTRODUCTION",
        message:
          "Sequences need an approved introduction step before they can be marked ready or approved.",
      });
    }
  }

  return { ok: issues.length === 0, issues };
}

// ————————————————————————————————————————————————————————————————
// Readiness summary
// ————————————————————————————————————————————————————————————————

export type SequenceReadinessInput = {
  contactList: {
    id: string | null;
    memberCount: number;
    emailSendableCount: number;
  } | null;
  steps: SequenceStepInput[];
};

export type SequenceReadinessSummary = {
  hasContactList: boolean;
  contactListMemberCount: number;
  emailSendableCount: number;
  approvedIntroduction: boolean;
  approvedFollowUpCount: number;
  /** Template rows that are NOT APPROVED (DRAFT/READY/ARCHIVED). */
  unapprovedStepCount: number;
  /** Rows whose category does not match their template category. */
  mismatchedStepCount: number;
  /** True when the sequence could transition to APPROVED right now. */
  canBeApproved: boolean;
};

export function summarizeSequenceReadiness(
  input: SequenceReadinessInput,
): SequenceReadinessSummary {
  const hasContactList = !!input.contactList?.id;
  const contactListMemberCount = input.contactList?.memberCount ?? 0;
  const emailSendableCount = input.contactList?.emailSendableCount ?? 0;

  let approvedIntroduction = false;
  let approvedFollowUpCount = 0;
  let unapprovedStepCount = 0;
  let mismatchedStepCount = 0;

  for (const step of input.steps) {
    if (step.template.category !== step.category) mismatchedStepCount += 1;
    if (step.template.status !== "APPROVED") unapprovedStepCount += 1;
    if (
      step.category === "INTRODUCTION" &&
      step.template.status === "APPROVED" &&
      step.template.category === "INTRODUCTION"
    ) {
      approvedIntroduction = true;
    }
    if (
      step.category !== "INTRODUCTION" &&
      step.template.status === "APPROVED" &&
      step.template.category === step.category
    ) {
      approvedFollowUpCount += 1;
    }
  }

  const canBeApproved =
    hasContactList &&
    emailSendableCount > 0 &&
    approvedIntroduction &&
    unapprovedStepCount === 0 &&
    mismatchedStepCount === 0;

  return {
    hasContactList,
    contactListMemberCount,
    emailSendableCount,
    approvedIntroduction,
    approvedFollowUpCount,
    unapprovedStepCount,
    mismatchedStepCount,
    canBeApproved,
  };
}

// ————————————————————————————————————————————————————————————————
// Status transitions
// ————————————————————————————————————————————————————————————————

/**
 * Allowed transitions (PR D4b — mirrors template policy):
 *   DRAFT              → READY_FOR_REVIEW, ARCHIVED
 *   READY_FOR_REVIEW   → APPROVED, DRAFT (back for edits), ARCHIVED
 *   APPROVED           → ARCHIVED, DRAFT (pull back for edits)
 *   ARCHIVED           → DRAFT (restore)
 */
export function canTransitionSequenceStatus(
  from: ClientEmailSequenceStatus,
  to: ClientEmailSequenceStatus,
): boolean {
  if (from === to) return false;
  switch (from) {
    case "DRAFT":
      return to === "READY_FOR_REVIEW" || to === "ARCHIVED";
    case "READY_FOR_REVIEW":
      return to === "APPROVED" || to === "DRAFT" || to === "ARCHIVED";
    case "APPROVED":
      return to === "ARCHIVED" || to === "DRAFT";
    case "ARCHIVED":
      return to === "DRAFT";
    default:
      return false;
  }
}

export type SequenceApprovalDecision =
  | { ok: true }
  | {
      ok: false;
      reason:
        | "no_contact_list"
        | "empty_list"
        | "missing_introduction"
        | "unapproved_step"
        | "category_mismatch"
        | "no_steps";
      readiness: SequenceReadinessSummary;
    };

/**
 * Combined "can this sequence move to APPROVED / READY_FOR_REVIEW
 * right now?" gate. Used by server helpers before persisting the
 * status change.
 */
export function canApproveSequence(
  input: SequenceReadinessInput,
): SequenceApprovalDecision {
  const readiness = summarizeSequenceReadiness(input);
  if (!readiness.hasContactList) {
    return { ok: false, reason: "no_contact_list", readiness };
  }
  if (input.steps.length === 0) {
    return { ok: false, reason: "no_steps", readiness };
  }
  if (readiness.mismatchedStepCount > 0) {
    return { ok: false, reason: "category_mismatch", readiness };
  }
  if (!readiness.approvedIntroduction) {
    return { ok: false, reason: "missing_introduction", readiness };
  }
  if (readiness.unapprovedStepCount > 0) {
    return { ok: false, reason: "unapproved_step", readiness };
  }
  if (readiness.emailSendableCount === 0) {
    return { ok: false, reason: "empty_list", readiness };
  }
  return { ok: true };
}
