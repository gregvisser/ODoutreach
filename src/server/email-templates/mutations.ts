import "server-only";

import type {
  ClientEmailTemplate,
  Prisma,
} from "@/generated/prisma/client";
import type {
  ClientEmailTemplateCategory,
  ClientEmailTemplateStatus,
} from "@/generated/prisma/enums";
import { prisma } from "@/lib/db";
import {
  canApproveTemplate,
  canTransitionStatus,
  validateTemplateInput,
  type TemplateValidationResult,
} from "@/lib/email-templates/template-policy";

/**
 * Server-side mutations for `ClientEmailTemplate` (PR D4a).
 *
 * These helpers NEVER call `requireOpensDoorsStaff` / `requireClientAccess`
 * themselves — the caller (a server action in the app folder) must do
 * that first and pass the verified `clientId` + `staffUserId`. This
 * separation means Node-only pure logic stays easy to unit-test.
 *
 * No send-time behaviour is introduced here. No templates are delivered
 * to any mailbox; the only writes are metadata + approval fields.
 */

export type MutationError = {
  code:
    | "INVALID_INPUT"
    | "UNKNOWN_PLACEHOLDERS"
    | "NOT_FOUND"
    | "WRONG_CLIENT"
    | "INVALID_STATUS_TRANSITION"
    | "APPROVAL_BLOCKED";
  message: string;
  validation?: TemplateValidationResult;
  currentStatus?: ClientEmailTemplateStatus;
  attemptedStatus?: ClientEmailTemplateStatus;
};

export class TemplateMutationError extends Error {
  readonly detail: MutationError;
  constructor(detail: MutationError) {
    super(detail.message);
    this.name = "TemplateMutationError";
    this.detail = detail;
  }
}

function ensureClientMatch(
  row: Pick<ClientEmailTemplate, "clientId">,
  clientId: string,
): void {
  if (row.clientId !== clientId) {
    throw new TemplateMutationError({
      code: "WRONG_CLIENT",
      message: "Template belongs to a different client workspace.",
    });
  }
}

function toValidationError(
  validation: TemplateValidationResult,
): TemplateMutationError {
  const first = validation.issues[0];
  return new TemplateMutationError({
    code: "INVALID_INPUT",
    message: first?.message ?? "Template input is invalid.",
    validation,
  });
}

export type CreateTemplateInput = {
  clientId: string;
  staffUserId: string;
  name: string;
  category: ClientEmailTemplateCategory | string;
  subject: string;
  content: string;
};

export async function createEmailTemplate(
  input: CreateTemplateInput,
): Promise<ClientEmailTemplate> {
  const validation = validateTemplateInput({
    name: input.name,
    category: input.category,
    subject: input.subject,
    content: input.content,
  });
  if (!validation.ok) {
    throw toValidationError(validation);
  }
  return prisma.clientEmailTemplate.create({
    data: {
      clientId: input.clientId,
      name: input.name.trim(),
      category: input.category as ClientEmailTemplateCategory,
      subject: input.subject.trim(),
      content: input.content.trim(),
      createdByStaffUserId: input.staffUserId,
      // Always start in DRAFT so the review/approval ledger stays clean.
      status: "DRAFT",
    },
  });
}

export type UpdateTemplateInput = {
  templateId: string;
  clientId: string;
  name: string;
  category: ClientEmailTemplateCategory | string;
  subject: string;
  content: string;
};

/**
 * Update editable fields. Edits are only allowed when the template is
 * in DRAFT or READY_FOR_REVIEW; APPROVED / ARCHIVED require pulling the
 * template back to DRAFT first (separate status transition).
 */
export async function updateEmailTemplate(
  input: UpdateTemplateInput,
): Promise<ClientEmailTemplate> {
  const existing = await prisma.clientEmailTemplate.findUnique({
    where: { id: input.templateId },
    select: { id: true, clientId: true, status: true },
  });
  if (!existing) {
    throw new TemplateMutationError({
      code: "NOT_FOUND",
      message: "Template not found.",
    });
  }
  ensureClientMatch(existing, input.clientId);

  if (existing.status !== "DRAFT" && existing.status !== "READY_FOR_REVIEW") {
    throw new TemplateMutationError({
      code: "INVALID_STATUS_TRANSITION",
      message:
        "Only draft or ready-for-review templates can be edited — move the template back to draft first.",
      currentStatus: existing.status,
    });
  }

  const validation = validateTemplateInput({
    name: input.name,
    category: input.category,
    subject: input.subject,
    content: input.content,
  });
  if (!validation.ok) {
    throw toValidationError(validation);
  }

  return prisma.clientEmailTemplate.update({
    where: { id: input.templateId },
    data: {
      name: input.name.trim(),
      category: input.category as ClientEmailTemplateCategory,
      subject: input.subject.trim(),
      content: input.content.trim(),
    },
  });
}

type StatusMutationInput = {
  templateId: string;
  clientId: string;
  staffUserId: string;
};

async function loadTemplateForMutation(
  templateId: string,
  clientId: string,
): Promise<ClientEmailTemplate> {
  const row = await prisma.clientEmailTemplate.findUnique({
    where: { id: templateId },
  });
  if (!row) {
    throw new TemplateMutationError({
      code: "NOT_FOUND",
      message: "Template not found.",
    });
  }
  ensureClientMatch(row, clientId);
  return row;
}

function ensureTransition(
  current: ClientEmailTemplateStatus,
  next: ClientEmailTemplateStatus,
): void {
  if (!canTransitionStatus(current, next)) {
    throw new TemplateMutationError({
      code: "INVALID_STATUS_TRANSITION",
      message: `Cannot move template from ${current} to ${next}.`,
      currentStatus: current,
      attemptedStatus: next,
    });
  }
}

/** DRAFT → READY_FOR_REVIEW. Structural validation must pass. */
export async function markTemplateReadyForReview(
  input: StatusMutationInput,
): Promise<ClientEmailTemplate> {
  const current = await loadTemplateForMutation(input.templateId, input.clientId);
  ensureTransition(current.status, "READY_FOR_REVIEW");
  const validation = validateTemplateInput({
    name: current.name,
    category: current.category,
    subject: current.subject,
    content: current.content,
  });
  if (!validation.ok) {
    throw toValidationError(validation);
  }
  return prisma.clientEmailTemplate.update({
    where: { id: current.id },
    data: { status: "READY_FOR_REVIEW" },
  });
}

/** READY_FOR_REVIEW → APPROVED. Blocks on unknown placeholders. */
export async function approveTemplate(
  input: StatusMutationInput,
): Promise<ClientEmailTemplate> {
  const current = await loadTemplateForMutation(input.templateId, input.clientId);
  ensureTransition(current.status, "APPROVED");

  const decision = canApproveTemplate({
    name: current.name,
    category: current.category,
    subject: current.subject,
    content: current.content,
  });
  if (!decision.ok) {
    const code =
      decision.reason === "unknown_placeholders"
        ? "UNKNOWN_PLACEHOLDERS"
        : "INVALID_INPUT";
    const unknown = decision.details.placeholders.unknown;
    throw new TemplateMutationError({
      code,
      message:
        code === "UNKNOWN_PLACEHOLDERS"
          ? `Unknown placeholders prevent approval: ${unknown.map((k) => `{{${k}}}`).join(", ")}.`
          : (decision.details.issues[0]?.message ??
            "Template is not valid for approval."),
      validation: decision.details,
    });
  }

  return prisma.clientEmailTemplate.update({
    where: { id: current.id },
    data: {
      status: "APPROVED",
      approvedByStaffUserId: input.staffUserId,
      approvedAt: new Date(),
    },
  });
}

/** Any state → ARCHIVED. */
export async function archiveTemplate(
  input: StatusMutationInput,
): Promise<ClientEmailTemplate> {
  const current = await loadTemplateForMutation(input.templateId, input.clientId);
  ensureTransition(current.status, "ARCHIVED");

  const data: Prisma.ClientEmailTemplateUpdateInput = {
    status: "ARCHIVED",
    archivedAt: new Date(),
  };
  // Clearing approval fields when archiving from APPROVED keeps the
  // approval ledger meaningful: a later re-draft → re-approve cycle will
  // record a fresh approver / timestamp.
  if (current.status === "APPROVED") {
    data.approvedBy = { disconnect: true };
    data.approvedAt = null;
  }

  return prisma.clientEmailTemplate.update({
    where: { id: current.id },
    data,
  });
}

/**
 * APPROVED/READY/ARCHIVED → DRAFT (pull back for edits). Also clears
 * approval metadata when coming back from APPROVED.
 */
export async function returnTemplateToDraft(
  input: StatusMutationInput,
): Promise<ClientEmailTemplate> {
  const current = await loadTemplateForMutation(input.templateId, input.clientId);
  ensureTransition(current.status, "DRAFT");

  const data: Prisma.ClientEmailTemplateUpdateInput = {
    status: "DRAFT",
  };
  if (current.status === "APPROVED") {
    data.approvedBy = { disconnect: true };
    data.approvedAt = null;
  }
  if (current.status === "ARCHIVED") {
    data.archivedAt = null;
  }

  return prisma.clientEmailTemplate.update({
    where: { id: current.id },
    data,
  });
}
