import "server-only";

import type {
  ClientEmailSequenceEnrollmentStatus,
  ClientEmailSequenceStatus,
  ClientEmailTemplateCategory,
  ClientEmailTemplateStatus,
} from "@/generated/prisma/enums";
import { summarizeContactReadiness } from "@/lib/client-contacts-readiness";
import type { EnrollmentPreview } from "@/lib/email-sequences/enrollment-policy";
import {
  SEQUENCE_STATUS_ORDER,
  summarizeSequenceReadiness,
  type SequenceReadinessSummary,
  type SequenceStepInput,
} from "@/lib/email-sequences/sequence-policy";
import { TEMPLATE_CATEGORY_ORDER } from "@/lib/email-templates/template-policy";
import { prisma } from "@/lib/db";
import { loadSequenceEnrollmentPreviews } from "./enrollments";

/**
 * Server-side, client-scoped queries for `ClientEmailSequence` (PR D4b).
 *
 * These helpers assume the caller has already resolved access via
 * `requireClientAccess` / `getAccessibleClientIds` — they do NOT
 * re-check staff auth. They exist to keep view-model shaping in one
 * place so the server component on `/clients/[id]/outreach` stays
 * small.
 */

export type SequenceStepSummary = {
  id: string;
  category: ClientEmailTemplateCategory;
  position: number;
  delayDays: number;
  template: {
    id: string;
    name: string;
    category: ClientEmailTemplateCategory;
    status: ClientEmailTemplateStatus;
  };
};

export type SequenceSummary = {
  id: string;
  clientId: string;
  name: string;
  description: string | null;
  status: ClientEmailSequenceStatus;
  contactList: {
    id: string;
    name: string;
    memberCount: number;
    emailSendableCount: number;
  };
  steps: SequenceStepSummary[];
  createdAtIso: string;
  updatedAtIso: string;
  approvedAtIso: string | null;
  archivedAtIso: string | null;
  createdBy: { id: string; name: string | null; email: string } | null;
  approvedBy: { id: string; name: string | null; email: string } | null;
  readiness: SequenceReadinessSummary;
  enrollment: SequenceEnrollmentSummary;
};

export type SequenceEnrollmentSummary = {
  preview: EnrollmentPreview;
  counts: Record<ClientEmailSequenceEnrollmentStatus, number>;
  total: number;
};

export type SequenceCounts = {
  total: number;
  byStatus: Record<ClientEmailSequenceStatus, number>;
};

export type SequenceListOption = {
  id: string;
  name: string;
  memberCount: number;
  emailSendableCount: number;
};

export type SequenceTemplateOption = {
  id: string;
  name: string;
  category: ClientEmailTemplateCategory;
  status: ClientEmailTemplateStatus;
};

export type ClientEmailSequencesOverview = {
  sequences: SequenceSummary[];
  counts: SequenceCounts;
  contactLists: SequenceListOption[];
  approvedTemplatesByCategory: Record<
    ClientEmailTemplateCategory,
    SequenceTemplateOption[]
  >;
  approvedIntroductionCount: number;
  approvedTemplatesTotal: number;
};

function makeStatusCounts(
  rows: Array<{ status: ClientEmailSequenceStatus }>,
): SequenceCounts {
  const byStatus = Object.fromEntries(
    SEQUENCE_STATUS_ORDER.map((s) => [s, 0]),
  ) as Record<ClientEmailSequenceStatus, number>;
  for (const r of rows) {
    byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
  }
  return { total: rows.length, byStatus };
}

async function loadContactListReadinessMap(
  clientId: string,
  listIds: string[],
): Promise<
  Map<string, { memberCount: number; emailSendableCount: number; name: string }>
> {
  const out = new Map<
    string,
    { memberCount: number; emailSendableCount: number; name: string }
  >();
  if (listIds.length === 0) return out;

  const lists = await prisma.contactList.findMany({
    where: { clientId, id: { in: listIds } },
    select: {
      id: true,
      name: true,
      members: {
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
      },
    },
  });

  for (const list of lists) {
    const summary = summarizeContactReadiness(
      list.members.map((m) => m.contact),
    );
    out.set(list.id, {
      name: list.name,
      memberCount: summary.total,
      emailSendableCount: summary.emailSendable,
    });
  }
  return out;
}

/**
 * Load every sequence + option list needed to render the Outreach page
 * "Email sequences" section. Returns counts, per-sequence summaries,
 * the contact-list picker options with readiness, and the approved
 * templates grouped by category so the form can power per-step
 * dropdowns without another round-trip.
 */
export async function loadClientEmailSequencesOverview(
  clientId: string,
): Promise<ClientEmailSequencesOverview> {
  const emptyApprovedByCategory = Object.fromEntries(
    TEMPLATE_CATEGORY_ORDER.map((c) => [c, [] as SequenceTemplateOption[]]),
  ) as Record<ClientEmailTemplateCategory, SequenceTemplateOption[]>;

  if (!clientId) {
    return {
      sequences: [],
      counts: makeStatusCounts([]),
      contactLists: [],
      approvedTemplatesByCategory: emptyApprovedByCategory,
      approvedIntroductionCount: 0,
      approvedTemplatesTotal: 0,
    };
  }

  const [sequenceRows, allListRows, approvedTemplates] = await Promise.all([
    prisma.clientEmailSequence.findMany({
      where: { clientId },
      orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
      select: {
        id: true,
        clientId: true,
        name: true,
        description: true,
        status: true,
        contactListId: true,
        createdAt: true,
        updatedAt: true,
        approvedAt: true,
        archivedAt: true,
        createdBy: { select: { id: true, displayName: true, email: true } },
        approvedBy: { select: { id: true, displayName: true, email: true } },
        contactList: { select: { id: true, name: true } },
        steps: {
          orderBy: { position: "asc" },
          select: {
            id: true,
            category: true,
            position: true,
            delayDays: true,
            template: {
              select: {
                id: true,
                name: true,
                category: true,
                status: true,
              },
            },
          },
        },
      },
    }),
    prisma.contactList.findMany({
      where: { clientId },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        name: true,
        members: {
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
        },
      },
      take: 50,
    }),
    prisma.clientEmailTemplate.findMany({
      where: { clientId, status: "APPROVED" },
      orderBy: [{ category: "asc" }, { updatedAt: "desc" }],
      select: { id: true, name: true, category: true, status: true },
    }),
  ]);

  const listIdsInSequences = sequenceRows.map((s) => s.contactListId);
  const [sequenceListReadiness, enrollmentPreviewsById] = await Promise.all([
    loadContactListReadinessMap(clientId, listIdsInSequences),
    loadSequenceEnrollmentPreviews({
      clientId,
      sequences: sequenceRows.map((s) => ({
        id: s.id,
        contactListId: s.contactListId,
      })),
    }),
  ]);

  const contactLists: SequenceListOption[] = allListRows.map((l) => {
    const summary = summarizeContactReadiness(
      l.members.map((m) => m.contact),
    );
    return {
      id: l.id,
      name: l.name,
      memberCount: summary.total,
      emailSendableCount: summary.emailSendable,
    };
  });

  const approvedTemplatesByCategory = Object.fromEntries(
    TEMPLATE_CATEGORY_ORDER.map((c) => [c, [] as SequenceTemplateOption[]]),
  ) as Record<ClientEmailTemplateCategory, SequenceTemplateOption[]>;
  for (const t of approvedTemplates) {
    approvedTemplatesByCategory[t.category].push({
      id: t.id,
      name: t.name,
      category: t.category,
      status: t.status,
    });
  }
  const approvedIntroductionCount =
    approvedTemplatesByCategory.INTRODUCTION.length;
  const approvedTemplatesTotal = approvedTemplates.length;

  const sequences: SequenceSummary[] = sequenceRows.map((s) => {
    const listReadiness =
      sequenceListReadiness.get(s.contactListId) ?? {
        name: s.contactList.name,
        memberCount: 0,
        emailSendableCount: 0,
      };

    const steps: SequenceStepSummary[] = s.steps.map((step) => ({
      id: step.id,
      category: step.category,
      position: step.position,
      delayDays: step.delayDays,
      template: {
        id: step.template.id,
        name: step.template.name,
        category: step.template.category,
        status: step.template.status,
      },
    }));

    const readinessInput = {
      contactList: {
        id: s.contactList.id,
        memberCount: listReadiness.memberCount,
        emailSendableCount: listReadiness.emailSendableCount,
      },
      steps: steps.map<SequenceStepInput>((step) => ({
        category: step.category,
        position: step.position,
        delayDays: step.delayDays,
        template: {
          id: step.template.id,
          category: step.template.category,
          status: step.template.status,
          clientId,
        },
      })),
    };
    const readiness = summarizeSequenceReadiness(readinessInput);

    const enrollmentRaw =
      enrollmentPreviewsById[s.id] ??
      ({
        preview: {
          total: 0,
          enrollable: 0,
          alreadyEnrolled: 0,
          suppressed: 0,
          missingEmail: 0,
          missingIdentifier: 0,
          enrollableContactIds: [],
          skipped: [],
        },
        counts: {
          PENDING: 0,
          PAUSED: 0,
          COMPLETED: 0,
          EXCLUDED: 0,
        },
        total: 0,
      } as const);

    return {
      id: s.id,
      clientId: s.clientId,
      name: s.name,
      description: s.description,
      status: s.status,
      contactList: {
        id: s.contactList.id,
        name: s.contactList.name,
        memberCount: listReadiness.memberCount,
        emailSendableCount: listReadiness.emailSendableCount,
      },
      steps,
      createdAtIso: s.createdAt.toISOString(),
      updatedAtIso: s.updatedAt.toISOString(),
      approvedAtIso: s.approvedAt ? s.approvedAt.toISOString() : null,
      archivedAtIso: s.archivedAt ? s.archivedAt.toISOString() : null,
      createdBy: s.createdBy
        ? {
            id: s.createdBy.id,
            name: s.createdBy.displayName,
            email: s.createdBy.email,
          }
        : null,
      approvedBy: s.approvedBy
        ? {
            id: s.approvedBy.id,
            name: s.approvedBy.displayName,
            email: s.approvedBy.email,
          }
        : null,
      readiness,
      enrollment: {
        preview: enrollmentRaw.preview,
        counts: enrollmentRaw.counts,
        total: enrollmentRaw.total,
      },
    };
  });

  return {
    sequences,
    counts: makeStatusCounts(sequences.map((s) => ({ status: s.status }))),
    contactLists,
    approvedTemplatesByCategory,
    approvedIntroductionCount,
    approvedTemplatesTotal,
  };
}

/**
 * Small helper for launch-readiness / workspace bundle callers that
 * just want counts without the full overview.
 */
export async function getClientEmailSequenceCounts(
  clientId: string,
): Promise<{
  approvedSequencesCount: number;
  approvedIntroductionTemplatesCount: number;
  approvedTemplatesTotal: number;
}> {
  if (!clientId) {
    return {
      approvedSequencesCount: 0,
      approvedIntroductionTemplatesCount: 0,
      approvedTemplatesTotal: 0,
    };
  }

  const [approvedSequencesCount, approvedIntroductionTemplatesCount, approvedTemplatesTotal] =
    await Promise.all([
      prisma.clientEmailSequence.count({
        where: { clientId, status: "APPROVED" },
      }),
      prisma.clientEmailTemplate.count({
        where: { clientId, status: "APPROVED", category: "INTRODUCTION" },
      }),
      prisma.clientEmailTemplate.count({
        where: { clientId, status: "APPROVED" },
      }),
    ]);

  return {
    approvedSequencesCount,
    approvedIntroductionTemplatesCount,
    approvedTemplatesTotal,
  };
}
