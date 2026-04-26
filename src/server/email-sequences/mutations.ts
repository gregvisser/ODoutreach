import "server-only";

import type {
  ClientEmailSequence,
  Prisma,
} from "@/generated/prisma/client";
import type {
  ClientEmailSequenceStatus,
  ClientEmailTemplateCategory,
} from "@/generated/prisma/enums";
import { summarizeContactReadiness } from "@/lib/client-contacts-readiness";
import {
  canApproveSequence,
  canTransitionSequenceStatus,
  validateSequenceInput,
  validateSequenceSteps,
  type SequenceMetadataValidationResult,
  type SequenceStepsValidationResult,
} from "@/lib/email-sequences/sequence-policy";
import { prisma } from "@/lib/db";

/**
 * Server-side mutations for `ClientEmailSequence` (PR D4b).
 *
 * Callers (server actions) must re-verify staff auth + client access +
 * mutator permission before invoking these helpers — this layer trusts
 * the `clientId` / `staffUserId` passed in. All cross-table invariants
 * (sequence↔list clientId, step↔template clientId, step category ===
 * template category, only approved templates in ready/approved
 * sequences) are enforced here before writing. No send / schedule
 * behaviour is introduced.
 */

export type SequenceMutationErrorCode =
  | "INVALID_INPUT"
  | "INVALID_STEPS"
  | "NOT_FOUND"
  | "WRONG_CLIENT"
  | "WRONG_LIST_CLIENT"
  | "INVALID_STATUS_TRANSITION"
  | "APPROVAL_BLOCKED"
  | "TEMPLATE_LOOKUP_FAILED";

export type SequenceMutationError = {
  code: SequenceMutationErrorCode;
  message: string;
  validation?: SequenceMetadataValidationResult;
  stepValidation?: SequenceStepsValidationResult;
  currentStatus?: ClientEmailSequenceStatus;
  attemptedStatus?: ClientEmailSequenceStatus;
};

export class SequenceMutationFailure extends Error {
  readonly detail: SequenceMutationError;
  constructor(detail: SequenceMutationError) {
    super(detail.message);
    this.name = "SequenceMutationFailure";
    this.detail = detail;
  }
}

function ensureClientMatch(
  row: Pick<ClientEmailSequence, "clientId">,
  clientId: string,
): void {
  if (row.clientId !== clientId) {
    throw new SequenceMutationFailure({
      code: "WRONG_CLIENT",
      message: "Sequence belongs to a different client workspace.",
    });
  }
}

function ensureTransition(
  current: ClientEmailSequenceStatus,
  next: ClientEmailSequenceStatus,
): void {
  if (!canTransitionSequenceStatus(current, next)) {
    throw new SequenceMutationFailure({
      code: "INVALID_STATUS_TRANSITION",
      message: `Cannot move sequence from ${current} to ${next}.`,
      currentStatus: current,
      attemptedStatus: next,
    });
  }
}

async function assertContactListBelongsToClient(
  clientId: string,
  contactListId: string,
): Promise<void> {
  const list = await prisma.contactList.findUnique({
    where: { id: contactListId },
    select: { id: true, clientId: true },
  });
  if (!list) {
    throw new SequenceMutationFailure({
      code: "NOT_FOUND",
      message: "Contact list not found.",
    });
  }
  if (list.clientId !== clientId) {
    throw new SequenceMutationFailure({
      code: "WRONG_LIST_CLIENT",
      message: "Contact list must belong to the same client as the sequence.",
    });
  }
}

async function loadContactListReadiness(
  contactListId: string,
): Promise<{ memberCount: number; emailSendableCount: number }> {
  const members = await prisma.contactListMember.findMany({
    where: { contactListId },
    select: {
      contact: {
        select: {
          email: true,
          linkedIn: true,
          mobilePhone: true,
          officePhone: true,
          isSuppressed: true,
        },
      },
    },
  });
  const summary = summarizeContactReadiness(members.map((m) => m.contact));
  return { memberCount: summary.total, emailSendableCount: summary.emailSendable };
}

// ————————————————————————————————————————————————————————————————
// Create / update metadata
// ————————————————————————————————————————————————————————————————

export type CreateSequenceInput = {
  clientId: string;
  staffUserId: string;
  name: string;
  description: string | null;
  contactListId: string;
  launchPreferredMailboxId: string | null;
};

export async function createSequence(
  input: CreateSequenceInput,
): Promise<ClientEmailSequence> {
  const validation = validateSequenceInput({
    name: input.name,
    description: input.description,
    contactListId: input.contactListId,
  });
  if (!validation.ok) {
    throw new SequenceMutationFailure({
      code: "INVALID_INPUT",
      message: validation.issues[0]?.message ?? "Sequence input is invalid.",
      validation,
    });
  }
  await assertContactListBelongsToClient(input.clientId, input.contactListId);

  const mb = (input.launchPreferredMailboxId ?? "").trim();
  if (mb) {
    const mailbox = await prisma.clientMailboxIdentity.findFirst({
      where: { id: mb, clientId: input.clientId },
      select: { id: true },
    });
    if (!mailbox) {
      throw new SequenceMutationFailure({
        code: "NOT_FOUND",
        message: "Selected sending mailbox was not found for this client.",
      });
    }
  }

  return prisma.clientEmailSequence.create({
    data: {
      clientId: input.clientId,
      contactListId: input.contactListId,
      name: input.name.trim(),
      description: input.description?.trim() ? input.description.trim() : null,
      status: "DRAFT",
      createdByStaffUserId: input.staffUserId,
      launchPreferredMailboxId: mb || null,
    },
  });
}

export type UpdateSequenceMetadataInput = {
  sequenceId: string;
  clientId: string;
  name: string;
  description: string | null;
  contactListId: string;
  /** Null/empty = auto-pick from the eligible mailbox pool at send time. */
  launchPreferredMailboxId: string | null;
};

export async function updateSequenceMetadata(
  input: UpdateSequenceMetadataInput,
): Promise<ClientEmailSequence> {
  const existing = await prisma.clientEmailSequence.findUnique({
    where: { id: input.sequenceId },
    select: { id: true, clientId: true, status: true },
  });
  if (!existing) {
    throw new SequenceMutationFailure({
      code: "NOT_FOUND",
      message: "Sequence not found.",
    });
  }
  ensureClientMatch(existing, input.clientId);

  if (existing.status !== "DRAFT" && existing.status !== "READY_FOR_REVIEW") {
    throw new SequenceMutationFailure({
      code: "INVALID_STATUS_TRANSITION",
      message:
        "Only draft or ready-for-review sequences can be edited — move the sequence back to draft first.",
      currentStatus: existing.status,
    });
  }

  const validation = validateSequenceInput({
    name: input.name,
    description: input.description,
    contactListId: input.contactListId,
  });
  if (!validation.ok) {
    throw new SequenceMutationFailure({
      code: "INVALID_INPUT",
      message: validation.issues[0]?.message ?? "Sequence input is invalid.",
      validation,
    });
  }
  await assertContactListBelongsToClient(input.clientId, input.contactListId);

  const mb = (input.launchPreferredMailboxId ?? "").trim();
  if (mb) {
    const mailbox = await prisma.clientMailboxIdentity.findFirst({
      where: { id: mb, clientId: input.clientId },
      select: { id: true },
    });
    if (!mailbox) {
      throw new SequenceMutationFailure({
        code: "NOT_FOUND",
        message: "Selected sending mailbox was not found for this client.",
      });
    }
  }

  return prisma.clientEmailSequence.update({
    where: { id: input.sequenceId },
    data: {
      name: input.name.trim(),
      description: input.description?.trim() ? input.description.trim() : null,
      contactListId: input.contactListId,
      launchPreferredMailboxId: mb || null,
    },
  });
}

// ————————————————————————————————————————————————————————————————
// Set steps (replace-all inside a transaction)
// ————————————————————————————————————————————————————————————————

export type SetSequenceStepsInput = {
  sequenceId: string;
  clientId: string;
  /**
   * Ordered from position 1 upward. Only the slots the operator filled
   * — missing categories mean "no step for that category".
   */
  steps: Array<{
    category: ClientEmailTemplateCategory;
    templateId: string;
    delayDays: number;
    delayHours: number;
  }>;
  /**
   * Target status the caller wants to validate against. Passing
   * `"DRAFT"` accepts unapproved templates so operators can iterate.
   */
  targetStatus: ClientEmailSequenceStatus;
};

/**
 * Replace the full step list for a sequence. Runs:
 *   1. Template lookup + ownership check (all templates must belong to
 *      the same client).
 *   2. Pure policy validation (`validateSequenceSteps`).
 *   3. Inside a transaction: delete old steps, insert new ones with
 *      dense position numbers starting at 1 in category order.
 */
export async function setSequenceSteps(
  input: SetSequenceStepsInput,
): Promise<void> {
  const existing = await prisma.clientEmailSequence.findUnique({
    where: { id: input.sequenceId },
    select: { id: true, clientId: true, status: true },
  });
  if (!existing) {
    throw new SequenceMutationFailure({
      code: "NOT_FOUND",
      message: "Sequence not found.",
    });
  }
  ensureClientMatch(existing, input.clientId);

  if (existing.status !== "DRAFT" && existing.status !== "READY_FOR_REVIEW") {
    throw new SequenceMutationFailure({
      code: "INVALID_STATUS_TRANSITION",
      message:
        "Only draft or ready-for-review sequences can have steps changed — return the sequence to draft first.",
      currentStatus: existing.status,
    });
  }

  const templateIds = Array.from(new Set(input.steps.map((s) => s.templateId)));
  const templates =
    templateIds.length > 0
      ? await prisma.clientEmailTemplate.findMany({
          where: { id: { in: templateIds } },
          select: { id: true, clientId: true, category: true, status: true },
        })
      : [];
  const templatesById = new Map(templates.map((t) => [t.id, t]));
  const missing = templateIds.filter((id) => !templatesById.has(id));
  if (missing.length > 0) {
    throw new SequenceMutationFailure({
      code: "TEMPLATE_LOOKUP_FAILED",
      message: "One or more selected templates could not be found.",
    });
  }

  const rankedSteps = [...input.steps]
    .map((s) => ({ ...s }))
    .sort((a, b) => {
      const order: Record<ClientEmailTemplateCategory, number> = {
        INTRODUCTION: 0,
        FOLLOW_UP_1: 1,
        FOLLOW_UP_2: 2,
        FOLLOW_UP_3: 3,
        FOLLOW_UP_4: 4,
        FOLLOW_UP_5: 5,
      };
      return order[a.category] - order[b.category];
    });

  const stepsForValidation = rankedSteps.map((s, index) => {
    const t = templatesById.get(s.templateId)!;
    return {
      category: s.category,
      position: index + 1,
      delayDays: s.delayDays,
      delayHours: s.delayHours,
      template: {
        id: t.id,
        category: t.category,
        status: t.status,
        clientId: t.clientId,
      },
    };
  });

  const stepValidation = validateSequenceSteps({
    steps: stepsForValidation,
    targetStatus: input.targetStatus,
    sequenceClientId: input.clientId,
  });
  if (!stepValidation.ok) {
    throw new SequenceMutationFailure({
      code: "INVALID_STEPS",
      message:
        stepValidation.issues[0]?.message ??
        "Sequence steps are not valid for the requested status.",
      stepValidation,
    });
  }

  await prisma.$transaction(async (tx) => {
    await tx.clientEmailSequenceStep.deleteMany({
      where: { sequenceId: input.sequenceId },
    });
    if (stepsForValidation.length > 0) {
      await tx.clientEmailSequenceStep.createMany({
        data: stepsForValidation.map((s) => ({
          sequenceId: input.sequenceId,
          templateId: s.template.id,
          category: s.category,
          position: s.position,
          delayDays: s.delayDays,
          delayHours: s.delayHours,
        })),
      });
    }
    await tx.clientEmailSequence.update({
      where: { id: input.sequenceId },
      data: { updatedAt: new Date() },
    });
  });
}

// ————————————————————————————————————————————————————————————————
// Status transitions
// ————————————————————————————————————————————————————————————————

type StatusMutationInput = {
  sequenceId: string;
  clientId: string;
  staffUserId: string;
};

async function loadSequenceForMutation(
  sequenceId: string,
  clientId: string,
) {
  const row = await prisma.clientEmailSequence.findUnique({
    where: { id: sequenceId },
    include: {
      steps: {
        select: {
          id: true,
          category: true,
          position: true,
          delayDays: true,
          delayHours: true,
          templateId: true,
          template: {
            select: { id: true, category: true, status: true, clientId: true },
          },
        },
      },
    },
  });
  if (!row) {
    throw new SequenceMutationFailure({
      code: "NOT_FOUND",
      message: "Sequence not found.",
    });
  }
  ensureClientMatch(row, clientId);
  return row;
}

export async function markSequenceReadyForReview(
  input: StatusMutationInput,
): Promise<ClientEmailSequence> {
  const current = await loadSequenceForMutation(input.sequenceId, input.clientId);
  ensureTransition(current.status, "READY_FOR_REVIEW");

  const listReadiness = await loadContactListReadiness(current.contactListId);

  const decision = canApproveSequence({
    contactList: {
      id: current.contactListId,
      memberCount: listReadiness.memberCount,
      emailSendableCount: listReadiness.emailSendableCount,
    },
    steps: current.steps.map((s) => ({
      category: s.category,
      position: s.position,
      delayDays: s.delayDays,
      delayHours: s.delayHours,
      template: {
        id: s.template.id,
        category: s.template.category,
        status: s.template.status,
        clientId: s.template.clientId,
      },
    })),
  });
  if (!decision.ok) {
    throw new SequenceMutationFailure({
      code: "APPROVAL_BLOCKED",
      message: approvalBlockedMessage(decision.reason),
    });
  }

  return prisma.clientEmailSequence.update({
    where: { id: current.id },
    data: { status: "READY_FOR_REVIEW" },
  });
}

export async function approveSequence(
  input: StatusMutationInput,
): Promise<ClientEmailSequence> {
  const current = await loadSequenceForMutation(input.sequenceId, input.clientId);
  ensureTransition(current.status, "APPROVED");

  const listReadiness = await loadContactListReadiness(current.contactListId);
  const decision = canApproveSequence({
    contactList: {
      id: current.contactListId,
      memberCount: listReadiness.memberCount,
      emailSendableCount: listReadiness.emailSendableCount,
    },
    steps: current.steps.map((s) => ({
      category: s.category,
      position: s.position,
      delayDays: s.delayDays,
      delayHours: s.delayHours,
      template: {
        id: s.template.id,
        category: s.template.category,
        status: s.template.status,
        clientId: s.template.clientId,
      },
    })),
  });
  if (!decision.ok) {
    throw new SequenceMutationFailure({
      code: "APPROVAL_BLOCKED",
      message: approvalBlockedMessage(decision.reason),
    });
  }

  return prisma.clientEmailSequence.update({
    where: { id: current.id },
    data: {
      status: "APPROVED",
      approvedByStaffUserId: input.staffUserId,
      approvedAt: new Date(),
    },
  });
}

export async function archiveSequence(
  input: StatusMutationInput,
): Promise<ClientEmailSequence> {
  const current = await loadSequenceForMutation(input.sequenceId, input.clientId);
  ensureTransition(current.status, "ARCHIVED");

  const data: Prisma.ClientEmailSequenceUpdateInput = {
    status: "ARCHIVED",
    archivedAt: new Date(),
  };
  if (current.status === "APPROVED") {
    data.approvedBy = { disconnect: true };
    data.approvedAt = null;
  }

  return prisma.clientEmailSequence.update({
    where: { id: current.id },
    data,
  });
}

export async function returnSequenceToDraft(
  input: StatusMutationInput,
): Promise<ClientEmailSequence> {
  const current = await loadSequenceForMutation(input.sequenceId, input.clientId);
  ensureTransition(current.status, "DRAFT");

  const data: Prisma.ClientEmailSequenceUpdateInput = {
    status: "DRAFT",
  };
  if (current.status === "APPROVED") {
    data.approvedBy = { disconnect: true };
    data.approvedAt = null;
  }
  if (current.status === "ARCHIVED") {
    data.archivedAt = null;
  }
  return prisma.clientEmailSequence.update({
    where: { id: current.id },
    data,
  });
}

function approvalBlockedMessage(
  reason:
    | "no_contact_list"
    | "empty_list"
    | "missing_introduction"
    | "unapproved_step"
    | "category_mismatch"
    | "no_steps",
): string {
  switch (reason) {
    case "no_contact_list":
      return "Sequence has no contact list — attach one before approval.";
    case "empty_list":
      return "Target contact list has no email-sendable contacts yet.";
    case "missing_introduction":
      return "Add an introduction step with a non-archived template before approval.";
    case "unapproved_step":
      return "Every step must use a non-archived template before the sequence can be approved.";
    case "category_mismatch":
      return "A step's template category no longer matches the step category — fix the step first.";
    case "no_steps":
      return "Add at least an introduction step before approval.";
    default: {
      const _exhaustive: never = reason;
      return _exhaustive;
    }
  }
}
