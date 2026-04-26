import "server-only";

import type {
  ClientEmailSequenceStepSendStatus,
  ClientEmailTemplateCategory,
} from "@/generated/prisma/enums";
import {
  buildSequenceStepSendIdempotencyKey,
  classifySequenceStepSendCandidate,
  incrementStepSendCount,
  zeroStepSendCounts,
  type SequenceStepSendCandidate,
  type SequenceStepSendClassification,
  type SequenceStepSendClassificationCounts,
} from "@/lib/email-sequences/sequence-send-policy";
import {
  getClientSenderProfile,
  type ClientSenderProfile,
} from "@/lib/opensdoors-brief";
import { prisma } from "@/lib/db";

/**
 * Operator-triggered sequence step-send PLANNER (PR D4e.1 — records only).
 *
 * Produces `ClientEmailSequenceStepSend` rows for every PENDING /
 * PAUSED enrollment in the target sequence step. RECORDS ONLY:
 *
 *   * NEVER creates an `OutboundEmail`.
 *   * NEVER reserves `MailboxSendReservation`.
 *   * NEVER issues a Graph/Gmail/ESP call.
 *   * NEVER advances `ClientEmailSequenceEnrollment.currentStepPosition`.
 *
 * Status values written by D4e.1 are restricted to:
 *   PLANNED (placeholder — never written today),
 *   READY, SKIPPED, SUPPRESSED, BLOCKED.
 * `SENT` / `FAILED` are reserved for the D4e.2 dispatcher and this
 * planner must never write them.
 */

export type SequenceStepSendPreview = {
  id: string;
  enrollmentId: string;
  contactId: string;
  contactEmail: string | null;
  contactDisplay: string;
  status: ClientEmailSequenceStepSendStatus;
  reason:
    | "ready"
    | "skipped_enrollment_excluded"
    | "skipped_enrollment_completed"
    | "blocked_wrong_client"
    | "blocked_wrong_sequence"
    | "blocked_step_not_in_sequence"
    | "blocked_template_mismatch"
    | "blocked_template_not_approved"
    | "blocked_missing_email"
    | "blocked_suppressed"
    | "blocked_unknown_placeholder"
    | "blocked_missing_unsubscribe_link"
    | "blocked_missing_required_field";
  reasonDetail: string | null;
  subjectPreview: string | null;
  bodyPreview: string | null;
  plannedAtIso: string;
};

export type SequenceStepSendPlanResult = {
  sequenceId: string;
  stepId: string;
  stepCategory: ClientEmailTemplateCategory;
  counts: SequenceStepSendClassificationCounts & {
    /** Total rows persisted (any status). */
    total: number;
  };
  senderProfile: {
    senderName: string | null;
    senderEmail: string | null;
    senderCompanyName: string;
    emailSignature: string;
    unsubscribeLink: string | null;
  };
  previews: SequenceStepSendPreview[];
};

export type SequenceStepSendPlanError =
  | "SEQUENCE_NOT_FOUND"
  | "WRONG_CLIENT"
  | "STEP_NOT_FOUND"
  | "TEMPLATE_NOT_FOUND"
  | "NO_ENROLLMENTS";

export class SequenceStepSendPlanFailure extends Error {
  readonly code: SequenceStepSendPlanError;
  constructor(code: SequenceStepSendPlanError, message: string) {
    super(message);
    this.name = "SequenceStepSendPlanFailure";
    this.code = code;
  }
}

const PREVIEW_SUBJECT_MAX = 300;
const PREVIEW_BODY_MAX = 4000;

function truncate(value: string, max: number): string {
  if (value.length <= max) return value;
  return value.slice(0, Math.max(0, max - 1)) + "…";
}

function buildSenderRow(
  client: { name: string; defaultSenderEmail: string | null },
  brief: ClientSenderProfile,
  /** Placeholder unsubscribe link for plan-time composition. */
  unsubscribePlaceholder: string,
) {
  return {
    senderName: client.name,
    senderEmail: client.defaultSenderEmail,
    senderCompanyName: brief.senderCompanyName,
    emailSignature: brief.emailSignature,
    unsubscribeLink:
      client.defaultSenderEmail && client.defaultSenderEmail.length > 0
        ? unsubscribePlaceholder
        : null,
  };
}

function describeContact(contact: {
  email: string | null;
  fullName: string | null;
  firstName: string | null;
  lastName: string | null;
}): string {
  if (contact.fullName && contact.fullName.trim().length > 0)
    return contact.fullName;
  const pieces = [contact.firstName, contact.lastName]
    .filter((p): p is string => !!p && p.trim().length > 0)
    .join(" ");
  if (pieces.length > 0) return pieces;
  return contact.email ?? "(no identifier)";
}

/**
 * Load every row needed to classify step sends for the given step,
 * scoped by clientId at every hop.
 */
async function loadPlanningBundle(params: {
  clientId: string;
  sequenceId: string;
  stepId: string;
}) {
  const { clientId, sequenceId, stepId } = params;

  const [client, sequence, step] = await Promise.all([
    prisma.client.findUnique({
      where: { id: clientId },
      select: {
        id: true,
        name: true,
        defaultSenderEmail: true,
        onboarding: { select: { formData: true } },
      },
    }),
    prisma.clientEmailSequence.findUnique({
      where: { id: sequenceId },
      select: {
        id: true,
        clientId: true,
        contactListId: true,
        status: true,
      },
    }),
    prisma.clientEmailSequenceStep.findUnique({
      where: { id: stepId },
      select: {
        id: true,
        sequenceId: true,
        templateId: true,
        category: true,
        position: true,
      },
    }),
  ]);

  if (!client) {
    throw new SequenceStepSendPlanFailure(
      "WRONG_CLIENT",
      "Client not found.",
    );
  }
  if (!sequence) {
    throw new SequenceStepSendPlanFailure(
      "SEQUENCE_NOT_FOUND",
      "Sequence not found.",
    );
  }
  if (sequence.clientId !== clientId) {
    throw new SequenceStepSendPlanFailure(
      "WRONG_CLIENT",
      "Sequence belongs to a different client.",
    );
  }
  if (!step || step.sequenceId !== sequenceId) {
    throw new SequenceStepSendPlanFailure(
      "STEP_NOT_FOUND",
      "Step not found in this sequence.",
    );
  }

  const template = await prisma.clientEmailTemplate.findUnique({
    where: { id: step.templateId },
    select: {
      id: true,
      clientId: true,
      status: true,
      subject: true,
      content: true,
    },
  });
  if (!template || template.clientId !== clientId) {
    throw new SequenceStepSendPlanFailure(
      "TEMPLATE_NOT_FOUND",
      "Step's template not found in this client.",
    );
  }

  const enrollments = await prisma.clientEmailSequenceEnrollment.findMany({
    where: { sequenceId, clientId },
    select: {
      id: true,
      clientId: true,
      sequenceId: true,
      contactId: true,
      status: true,
      contact: {
        select: {
          id: true,
          clientId: true,
          email: true,
          fullName: true,
          firstName: true,
          lastName: true,
          company: true,
          title: true,
          mobilePhone: true,
          officePhone: true,
          isSuppressed: true,
        },
      },
    },
  });

  return { client, sequence, step, template, enrollments };
}

export async function planSequenceStepSends(params: {
  clientId: string;
  sequenceId: string;
  stepId: string;
  staffUserId: string;
}): Promise<SequenceStepSendPlanResult> {
  const bundle = await loadPlanningBundle(params);
  const { client, sequence, step, template, enrollments } = bundle;

  if (enrollments.length === 0) {
    throw new SequenceStepSendPlanFailure(
      "NO_ENROLLMENTS",
      "No enrollments exist for this sequence yet.",
    );
  }

  const brief = getClientSenderProfile({
    client: { name: client.name },
    formData: client.onboarding?.formData ?? null,
  });
  // The real unsubscribe URL is minted by the D4e.2 dispatcher per
  // contact. At plan time we substitute a deterministic placeholder
  // so the composition helper can verify the token renders; this
  // string is NEVER sent to a recipient in D4e.1.
  const unsubscribePlaceholder = client.defaultSenderEmail
    ? "[D4e.2 unsubscribe link]"
    : "";
  const senderRow = buildSenderRow(client, brief, unsubscribePlaceholder);

  const nowIso = new Date().toISOString();
  const counts: SequenceStepSendClassificationCounts = zeroStepSendCounts();
  const previews: SequenceStepSendPreview[] = [];

  // Write each plan row via upsert so re-running the planner is
  // fully idempotent. We never overwrite a SENT/FAILED row (D4e.2+).
  for (const enrollment of enrollments) {
    const candidate: SequenceStepSendCandidate = {
      clientId: params.clientId,
      sequence: { id: sequence.id, clientId: sequence.clientId },
      step: {
        id: step.id,
        sequenceId: step.sequenceId,
        templateId: step.templateId,
      },
      template: {
        id: template.id,
        clientId: template.clientId,
        status: template.status,
        subject: template.subject,
        content: template.content,
      },
      enrollment: {
        id: enrollment.id,
        clientId: enrollment.clientId,
        sequenceId: enrollment.sequenceId,
        contactId: enrollment.contactId,
        status: enrollment.status,
      },
      contact: {
        id: enrollment.contact.id,
        clientId: enrollment.contact.clientId,
        firstName: enrollment.contact.firstName,
        lastName: enrollment.contact.lastName,
        fullName: enrollment.contact.fullName,
        company: enrollment.contact.company,
        role: enrollment.contact.title,
        website: null,
        email: enrollment.contact.email,
        mobilePhone: enrollment.contact.mobilePhone,
        officePhone: enrollment.contact.officePhone,
        isSuppressed: enrollment.contact.isSuppressed,
      },
      sender: senderRow,
    };

    const decision: SequenceStepSendClassification =
      classifySequenceStepSendCandidate(candidate);

    const idempotencyKey = buildSequenceStepSendIdempotencyKey({
      sequenceId: sequence.id,
      enrollmentId: enrollment.id,
      stepId: step.id,
    });

    const subjectPreview =
      decision.composition.subject.length > 0
        ? truncate(decision.composition.subject, PREVIEW_SUBJECT_MAX)
        : null;
    const bodyPreview =
      decision.composition.body.length > 0
        ? truncate(decision.composition.body, PREVIEW_BODY_MAX)
        : null;

    // D4e.1 invariant: never write SENT or FAILED. If the classifier
    // ever returns one, coerce to BLOCKED to avoid masquerading as a
    // dispatched send.
    const persistedStatus: ClientEmailSequenceStepSendStatus =
      decision.status === "SENT" || decision.status === "FAILED"
        ? "BLOCKED"
        : decision.status;

    // We use a short transaction to:
    //   1. Look up an existing plan row for this idempotency key.
    //   2. Refuse to overwrite a terminal D4e.2+ row.
    //   3. Upsert the plan-time fields.
    await prisma.$transaction(async (tx) => {
      const existing = await tx.clientEmailSequenceStepSend.findUnique({
        where: { idempotencyKey },
        select: { id: true, status: true, outboundEmailId: true },
      });
      // If D4e.2+ already advanced this row to SENT/FAILED (with a
      // linked OutboundEmail), never rewrite it from the planner.
      if (existing && (existing.status === "SENT" || existing.status === "FAILED")) {
        return;
      }

      if (existing) {
        await tx.clientEmailSequenceStepSend.update({
          where: { id: existing.id },
          data: {
            status: persistedStatus,
            blockedReason: decision.reasonDetail,
            subjectPreview,
            bodyPreview,
            templateId: template.id,
            contactId: enrollment.contactId,
            contactListId: sequence.contactListId,
            createdByStaffUserId: params.staffUserId,
          },
        });
      } else {
        await tx.clientEmailSequenceStepSend.create({
          data: {
            clientId: params.clientId,
            sequenceId: sequence.id,
            enrollmentId: enrollment.id,
            stepId: step.id,
            templateId: template.id,
            contactId: enrollment.contactId,
            contactListId: sequence.contactListId,
            status: persistedStatus,
            idempotencyKey,
            subjectPreview,
            bodyPreview,
            blockedReason: decision.reasonDetail,
            createdByStaffUserId: params.staffUserId,
          },
        });
      }
    });

    incrementStepSendCount(counts, persistedStatus);
    previews.push({
      id: idempotencyKey,
      enrollmentId: enrollment.id,
      contactId: enrollment.contactId,
      contactEmail: enrollment.contact.email,
      contactDisplay: describeContact(enrollment.contact),
      status: persistedStatus,
      reason: decision.reason,
      reasonDetail: decision.reasonDetail,
      subjectPreview,
      bodyPreview,
      plannedAtIso: nowIso,
    });
  }

  const total =
    counts.planned +
    counts.ready +
    counts.blocked +
    counts.suppressed +
    counts.skipped +
    counts.sent +
    counts.failed;

  return {
    sequenceId: sequence.id,
    stepId: step.id,
    stepCategory: step.category,
    counts: { ...counts, total },
    senderProfile: senderRow,
    previews,
  };
}

export type SequenceStepSendOverview = {
  stepId: string;
  category: ClientEmailTemplateCategory;
  counts: SequenceStepSendClassificationCounts & { total: number };
  latestPreparedAtIso: string | null;
  latestSubjectPreview: string | null;
  previews: SequenceStepSendPreview[];
};

/**
 * Read-only view of existing step-send plan rows for a given step.
 * Used by the Outreach "Send preparation" card — the UI only reads
 * from this helper.
 */
export async function loadSequenceStepSendOverview(params: {
  clientId: string;
  sequenceId: string;
  stepId: string;
}): Promise<SequenceStepSendOverview | null> {
  const step = await prisma.clientEmailSequenceStep.findUnique({
    where: { id: params.stepId },
    select: { id: true, sequenceId: true, category: true },
  });
  if (!step || step.sequenceId !== params.sequenceId) return null;

  const rows = await prisma.clientEmailSequenceStepSend.findMany({
    where: {
      clientId: params.clientId,
      sequenceId: params.sequenceId,
      stepId: params.stepId,
    },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: 200,
    select: {
      id: true,
      enrollmentId: true,
      contactId: true,
      status: true,
      blockedReason: true,
      subjectPreview: true,
      bodyPreview: true,
      createdAt: true,
      updatedAt: true,
      contact: {
        select: {
          email: true,
          fullName: true,
          firstName: true,
          lastName: true,
        },
      },
    },
  });

  let counts: SequenceStepSendClassificationCounts = zeroStepSendCounts();
  let latestPreparedAtIso: string | null = null;
  let latestSubjectPreview: string | null = null;
  const previews: SequenceStepSendPreview[] = [];

  for (const r of rows) {
    counts = incrementStepSendCount(counts, r.status);
    const iso = r.updatedAt.toISOString();
    if (!latestPreparedAtIso || iso > latestPreparedAtIso) {
      latestPreparedAtIso = iso;
      if (r.subjectPreview && !latestSubjectPreview) {
        latestSubjectPreview = r.subjectPreview;
      }
    }
    previews.push({
      id: r.id,
      enrollmentId: r.enrollmentId,
      contactId: r.contactId,
      contactEmail: r.contact.email,
      contactDisplay: describeContact(r.contact),
      status: r.status,
      // Overview rows use a structural "existing" reason bucket; the
      // detailed classification reason lives on `blockedReason`.
      reason: reasonFromStatus(r.status),
      reasonDetail: r.blockedReason,
      subjectPreview: r.subjectPreview,
      bodyPreview: r.bodyPreview,
      plannedAtIso: iso,
    });
  }

  const total =
    counts.planned +
    counts.ready +
    counts.blocked +
    counts.suppressed +
    counts.skipped +
    counts.sent +
    counts.failed;

  return {
    stepId: step.id,
    category: step.category,
    counts: { ...counts, total },
    latestPreparedAtIso,
    latestSubjectPreview,
    previews,
  };
}

export type SequencePrepSnapshot = {
  sequenceId: string;
  sequenceName: string;
  sequenceStatus: string;
  introductionStepId: string | null;
  introductionTemplateId: string | null;
  introductionApproved: boolean;
  enrollmentCount: number;
  counts: SequenceStepSendClassificationCounts & { total: number };
  latestPreparedAtIso: string | null;
  latestSubjectPreview: string | null;
};

/**
 * Page-level aggregate: for every sequence in the client, report the
 * current send-preparation state of its INTRODUCTION step (if one
 * exists). Powers the read-only "Send preparation" card.
 */
export async function loadClientSequencePrepSnapshots(
  clientId: string,
): Promise<SequencePrepSnapshot[]> {
  const sequences = await prisma.clientEmailSequence.findMany({
    where: { clientId },
    orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
    select: {
      id: true,
      name: true,
      status: true,
      steps: {
        where: { category: "INTRODUCTION" },
        select: {
          id: true,
          templateId: true,
          template: { select: { status: true } },
        },
      },
      _count: { select: { enrollments: true } },
    },
  });

  if (sequences.length === 0) return [];

  const sequenceIds = sequences.map((s) => s.id);
  const planRows = await prisma.clientEmailSequenceStepSend.findMany({
    where: {
      clientId,
      sequenceId: { in: sequenceIds },
    },
    select: {
      sequenceId: true,
      stepId: true,
      status: true,
      subjectPreview: true,
      updatedAt: true,
    },
  });

  const bySequence = new Map<string, typeof planRows>();
  for (const row of planRows) {
    const list = bySequence.get(row.sequenceId) ?? [];
    list.push(row);
    bySequence.set(row.sequenceId, list);
  }

  return sequences.map((s) => {
    const introStep = s.steps[0] ?? null;
    const introStepId = introStep?.id ?? null;
    const planForStep =
      (introStepId ? (bySequence.get(s.id) ?? []).filter((r) => r.stepId === introStepId) : []) ?? [];
    let counts: SequenceStepSendClassificationCounts = zeroStepSendCounts();
    let latestPreparedAtIso: string | null = null;
    let latestSubjectPreview: string | null = null;
    for (const r of planForStep) {
      counts = incrementStepSendCount(counts, r.status);
      const iso = r.updatedAt.toISOString();
      if (!latestPreparedAtIso || iso > latestPreparedAtIso) {
        latestPreparedAtIso = iso;
        if (r.subjectPreview) latestSubjectPreview = r.subjectPreview;
      }
    }
    const total =
      counts.planned +
      counts.ready +
      counts.blocked +
      counts.suppressed +
      counts.skipped +
      counts.sent +
      counts.failed;
    return {
      sequenceId: s.id,
      sequenceName: s.name,
      sequenceStatus: s.status,
      introductionStepId: introStepId,
      introductionTemplateId: introStep?.templateId ?? null,
      introductionApproved: introStep
        ? introStep.template.status !== "ARCHIVED"
        : false,
      enrollmentCount: s._count.enrollments,
      counts: { ...counts, total },
      latestPreparedAtIso,
      latestSubjectPreview,
    };
  });
}

function reasonFromStatus(
  status: ClientEmailSequenceStepSendStatus,
): SequenceStepSendPreview["reason"] {
  switch (status) {
    case "READY":
      return "ready";
    case "SUPPRESSED":
      return "blocked_suppressed";
    case "SKIPPED":
      return "skipped_enrollment_excluded";
    case "BLOCKED":
    case "PLANNED":
    case "SENT":
    case "FAILED":
    default:
      return "blocked_missing_required_field";
  }
}
