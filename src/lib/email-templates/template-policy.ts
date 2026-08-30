import type {
  ClientEmailTemplateCategory,
  ClientEmailTemplateStatus,
} from "@/generated/prisma/enums";

import { validateTemplatePlaceholders } from "./placeholders";

/**
 * Pure policy helpers for client email templates (PR D4a). No DB / no
 * Prisma imports — all DB-facing behaviour lives in the server-side
 * action layer (`src/app/(app)/clients/[clientId]/outreach/template-actions.ts`).
 *
 * These helpers enforce:
 *   - structural validation (required fields, length bounds)
 *   - placeholder validation (approval blocked on unknown placeholders)
 *   - status transition rules (DRAFT → READY → APPROVED → ARCHIVED)
 */

/** Display label used by the UI. */
export const TEMPLATE_CATEGORY_LABELS: Record<
  ClientEmailTemplateCategory,
  string
> = {
  INTRODUCTION: "Introduction email",
  FOLLOW_UP_1: "Follow-up 1",
  FOLLOW_UP_2: "Follow-up 2",
  FOLLOW_UP_3: "Follow-up 3",
  FOLLOW_UP_4: "Follow-up 4",
  FOLLOW_UP_5: "Follow-up 5",
};

/** Ordered list for UI dropdown + grouping. */
export const TEMPLATE_CATEGORY_ORDER: readonly ClientEmailTemplateCategory[] = [
  "INTRODUCTION",
  "FOLLOW_UP_1",
  "FOLLOW_UP_2",
  "FOLLOW_UP_3",
  "FOLLOW_UP_4",
  "FOLLOW_UP_5",
];

export const TEMPLATE_STATUS_LABELS: Record<
  ClientEmailTemplateStatus,
  string
> = {
  DRAFT: "Draft",
  READY_FOR_REVIEW: "In review",
  APPROVED: "Saved",
  ARCHIVED: "Archived",
};

export const TEMPLATE_STATUS_ORDER: readonly ClientEmailTemplateStatus[] = [
  "DRAFT",
  "READY_FOR_REVIEW",
  "APPROVED",
  "ARCHIVED",
];

export const TEMPLATE_NAME_MAX = 120;
export const TEMPLATE_SUBJECT_MAX = 200;
export const TEMPLATE_CONTENT_MAX = 20_000;

export type TemplateValidationInput = {
  name: string;
  category: ClientEmailTemplateCategory | string | null | undefined;
  subject: string;
  content: string;
};

export type TemplateValidationIssue = {
  field: "name" | "category" | "subject" | "content" | "placeholders";
  message: string;
};

export type TemplateValidationResult = {
  ok: boolean;
  issues: TemplateValidationIssue[];
  placeholders: {
    knownUsed: string[];
    unknown: string[];
  };
};

function isCategory(
  value: unknown,
): value is ClientEmailTemplateCategory {
  return (
    typeof value === "string" &&
    (TEMPLATE_CATEGORY_ORDER as readonly string[]).includes(value)
  );
}

/**
 * Structural + placeholder validation used by server actions BEFORE
 * writing to the DB. Keeping this pure means the same validator powers
 * unit tests and (in future) a richer client-side preview.
 */
export function validateTemplateInput(
  input: TemplateValidationInput,
): TemplateValidationResult {
  const issues: TemplateValidationIssue[] = [];
  const name = (input.name ?? "").trim();
  const subject = (input.subject ?? "").trim();
  const content = (input.content ?? "").trim();

  if (!name) {
    issues.push({ field: "name", message: "Template name is required." });
  } else if (name.length > TEMPLATE_NAME_MAX) {
    issues.push({
      field: "name",
      message: `Template name must be ${TEMPLATE_NAME_MAX} characters or fewer.`,
    });
  }

  if (!isCategory(input.category)) {
    issues.push({ field: "category", message: "Choose a template category." });
  }

  if (!subject) {
    issues.push({ field: "subject", message: "Email subject is required." });
  } else if (subject.length > TEMPLATE_SUBJECT_MAX) {
    issues.push({
      field: "subject",
      message: `Subject must be ${TEMPLATE_SUBJECT_MAX} characters or fewer.`,
    });
  }

  if (!content) {
    issues.push({ field: "content", message: "Email content is required." });
  } else if (content.length > TEMPLATE_CONTENT_MAX) {
    issues.push({
      field: "content",
      message: `Content must be ${TEMPLATE_CONTENT_MAX.toLocaleString()} characters or fewer.`,
    });
  }

  const placeholders = validateTemplatePlaceholders(subject, content);

  return {
    ok: issues.length === 0,
    issues,
    placeholders,
  };
}

/**
 * Can a template in `from` state move to `to` state?
 *
 * Allowed transitions (PR D4a):
 *   DRAFT              → READY_FOR_REVIEW, ARCHIVED
 *   READY_FOR_REVIEW   → APPROVED, DRAFT (back for edits), ARCHIVED
 *   APPROVED           → ARCHIVED, DRAFT (pull back for edits)
 *   ARCHIVED           → DRAFT (restore)
 *
 * Intentionally NOT supported yet (defer to PR D4b): direct
 * ARCHIVED → APPROVED, ARCHIVED → READY_FOR_REVIEW.
 */
export function canTransitionStatus(
  from: ClientEmailTemplateStatus,
  to: ClientEmailTemplateStatus,
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

export type ApprovalDecision =
  | { ok: true }
  | { ok: false; reason: "invalid_input" | "unknown_placeholders"; details: TemplateValidationResult };

/**
 * Combined gate for "may this template move to APPROVED?". Approval
 * requires all structural fields AND zero unknown placeholders so an
 * approved template never references anything the renderer cannot fill.
 */
export function canApproveTemplate(
  input: TemplateValidationInput,
): ApprovalDecision {
  const validation = validateTemplateInput(input);
  if (!validation.ok) {
    return { ok: false, reason: "invalid_input", details: validation };
  }
  if (validation.placeholders.unknown.length > 0) {
    return { ok: false, reason: "unknown_placeholders", details: validation };
  }
  return { ok: true };
}

/**
 * Row 130 — a template can be picked into a sequence in every status
 * except ARCHIVED (the rule `canApproveSequence` in sequence-policy.ts
 * already enforces). Exported so the Templates screen can show, per
 * status, whether it is usable at a glance without duplicating the rule
 * or risking the two going out of sync.
 */
export function isTemplateStatusUsableInSequence(
  status: ClientEmailTemplateStatus,
): boolean {
  return status !== "ARCHIVED";
}

/**
 * Row 130 — the delete boundary, read from the data model
 * (`prisma/schema.prisma`): `ClientEmailSequenceStep.template` and
 * `ClientEmailSequenceStepSend.template` both declare `onDelete:
 * Restrict`, so the database itself refuses to delete a
 * `ClientEmailTemplate` row that either still references. A template
 * that has never been placed in a sequence step, and has no send
 * history, can be genuinely removed; one that has either must be
 * refused with a plain-English reason rather than a disabled button.
 */
export type TemplateDeleteEligibility =
  | { canDelete: true; reason: null }
  | { canDelete: false; reason: string };

export function describeTemplateDeleteEligibility(counts: {
  sequenceSteps: number;
  sequenceStepSends: number;
}): TemplateDeleteEligibility {
  if (counts.sequenceStepSends > 0) {
    return {
      canDelete: false,
      reason:
        counts.sequenceStepSends === 1
          ? "This template has been used to send a real email — deleting it would break that send's record, so it can only be archived."
          : `This template has been used to send ${String(counts.sequenceStepSends)} real emails — deleting it would break those sends' records, so it can only be archived.`,
    };
  }
  if (counts.sequenceSteps > 0) {
    return {
      canDelete: false,
      reason:
        counts.sequenceSteps === 1
          ? "This template is used in a sequence step — deleting it would break that sequence, so it can only be archived."
          : `This template is used in ${String(counts.sequenceSteps)} sequence steps — deleting it would break those sequences, so it can only be archived.`,
    };
  }
  return { canDelete: true, reason: null };
}
