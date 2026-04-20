import "server-only";

import type { ClientEmailSequenceEnrollmentStatus } from "@/generated/prisma/enums";
import {
  buildEnrollmentPreview,
  checkEnrollmentReadiness,
  type EnrollmentPreview,
  type EnrollmentReadinessReason,
} from "@/lib/email-sequences/enrollment-policy";
import { prisma } from "@/lib/db";

/**
 * Server helpers for `ClientEmailSequenceEnrollment` (PR D4c).
 *
 * Records-only: no send, no schedule, no step-send worker. Callers
 * are expected to re-verify staff auth + client access + mutator
 * permission before hitting these helpers (the enrollment mutator
 * reuses the same policy as template/sequence mutation). All
 * cross-table invariants are enforced here before writing rows:
 *   * enrollment.clientId === sequence.clientId
 *   * enrollment.contactListId === sequence.contactListId
 *   * every enrolled contactId belongs to the same client AND is
 *     a member of the target list
 *   * re-running enrollment is idempotent — only newly-enrollable
 *     contacts are inserted
 */

export type EnrollmentStatusCounts = Record<
  ClientEmailSequenceEnrollmentStatus,
  number
>;

export type SequenceEnrollmentOverview = {
  preview: EnrollmentPreview;
  counts: EnrollmentStatusCounts;
  total: number;
  readiness: {
    ok: boolean;
    reason: EnrollmentReadinessReason;
  };
};

export type EnrollmentError =
  | "SEQUENCE_NOT_FOUND"
  | "WRONG_CLIENT"
  | "SEQUENCE_NOT_READY"
  | "LIST_EMPTY"
  | "NO_ELIGIBLE_CONTACTS";

export class EnrollmentFailure extends Error {
  readonly code: EnrollmentError;
  constructor(code: EnrollmentError, message: string) {
    super(message);
    this.name = "EnrollmentFailure";
    this.code = code;
  }
}

function zeroCounts(): EnrollmentStatusCounts {
  return {
    PENDING: 0,
    PAUSED: 0,
    COMPLETED: 0,
    EXCLUDED: 0,
  };
}

async function loadListMembersForSequence(
  clientId: string,
  contactListId: string,
) {
  // We scope membership by clientId explicitly so even if a trigger
  // were bypassed, app code still enforces tenant isolation on the
  // enrollment write.
  return prisma.contactListMember.findMany({
    where: { contactListId, clientId },
    select: {
      contact: {
        select: {
          id: true,
          email: true,
          linkedIn: true,
          mobilePhone: true,
          officePhone: true,
          isSuppressed: true,
        },
      },
    },
  });
}

export async function loadSequenceEnrollmentOverview(
  sequenceId: string,
  clientId: string,
): Promise<SequenceEnrollmentOverview> {
  const sequence = await prisma.clientEmailSequence.findUnique({
    where: { id: sequenceId },
    select: {
      id: true,
      clientId: true,
      status: true,
      contactListId: true,
    },
  });
  if (!sequence) {
    throw new EnrollmentFailure(
      "SEQUENCE_NOT_FOUND",
      "Sequence not found.",
    );
  }
  if (sequence.clientId !== clientId) {
    throw new EnrollmentFailure(
      "WRONG_CLIENT",
      "Sequence belongs to a different client workspace.",
    );
  }

  const [members, enrollmentsRaw] = await Promise.all([
    loadListMembersForSequence(clientId, sequence.contactListId),
    prisma.clientEmailSequenceEnrollment.findMany({
      where: { sequenceId, clientId },
      select: { contactId: true, status: true },
    }),
  ]);

  const alreadyEnrolledContactIds = new Set(
    enrollmentsRaw.map((e) => e.contactId),
  );

  const candidates = members.map((m) => ({
    contactId: m.contact.id,
    email: m.contact.email,
    linkedIn: m.contact.linkedIn,
    mobilePhone: m.contact.mobilePhone,
    officePhone: m.contact.officePhone,
    isSuppressed: m.contact.isSuppressed,
  }));

  const preview = buildEnrollmentPreview({
    candidates,
    alreadyEnrolledContactIds,
  });

  const counts = zeroCounts();
  for (const row of enrollmentsRaw) {
    counts[row.status] += 1;
  }

  const readiness = checkEnrollmentReadiness({
    sequenceStatus: sequence.status,
    preview,
  });

  return {
    preview,
    counts,
    total: enrollmentsRaw.length,
    readiness,
  };
}

/**
 * Idempotent "Create enrollment records" action. Skips ineligible
 * contacts (suppressed / missing email) with counts — no EXCLUDED
 * rows are persisted today.
 *
 * Returns a summary of what was written this run plus the refreshed
 * overview so UI can show precise feedback.
 */
export async function enrollSequenceContacts(input: {
  sequenceId: string;
  clientId: string;
  staffUserId: string;
}): Promise<{
  inserted: number;
  skipped: {
    suppressed: number;
    missingEmail: number;
    missingIdentifier: number;
    alreadyEnrolled: number;
  };
  totalEnrollments: number;
}> {
  const overview = await loadSequenceEnrollmentOverview(
    input.sequenceId,
    input.clientId,
  );

  if (!overview.readiness.ok) {
    switch (overview.readiness.reason) {
      case "sequence_archived":
      case "sequence_not_approval_ready":
        throw new EnrollmentFailure(
          "SEQUENCE_NOT_READY",
          "Only sequences in READY_FOR_REVIEW or APPROVED can be enrolled.",
        );
      case "no_candidates":
        throw new EnrollmentFailure(
          "LIST_EMPTY",
          "Target contact list has no members.",
        );
      case "no_email_sendable":
        throw new EnrollmentFailure(
          "NO_ELIGIBLE_CONTACTS",
          "No new email-sendable contacts to enroll.",
        );
      default: {
        const _x: "ready" = overview.readiness.reason;
        throw new EnrollmentFailure(
          "NO_ELIGIBLE_CONTACTS",
          `Cannot enroll: ${_x}`,
        );
      }
    }
  }

  const { preview } = overview;

  // Look up the sequence again to grab contactListId within the
  // same transaction boundary — we already validated tenant match
  // in loadSequenceEnrollmentOverview.
  const sequence = await prisma.clientEmailSequence.findUnique({
    where: { id: input.sequenceId },
    select: { id: true, clientId: true, contactListId: true },
  });
  if (!sequence || sequence.clientId !== input.clientId) {
    throw new EnrollmentFailure(
      "WRONG_CLIENT",
      "Sequence no longer belongs to this workspace.",
    );
  }

  // Double-guard: re-verify each contact is a member of the list
  // AND owned by this client at write time.
  const enrollableIds = preview.enrollableContactIds;
  if (enrollableIds.length === 0) {
    return {
      inserted: 0,
      skipped: {
        suppressed: preview.suppressed,
        missingEmail: preview.missingEmail,
        missingIdentifier: preview.missingIdentifier,
        alreadyEnrolled: preview.alreadyEnrolled,
      },
      totalEnrollments: overview.total,
    };
  }

  const memberRows = await prisma.contactListMember.findMany({
    where: {
      contactListId: sequence.contactListId,
      clientId: input.clientId,
      contactId: { in: enrollableIds },
    },
    select: { contactId: true },
  });
  const verifiedIds = new Set(memberRows.map((m) => m.contactId));
  const toInsert = enrollableIds.filter((id) => verifiedIds.has(id));

  if (toInsert.length === 0) {
    return {
      inserted: 0,
      skipped: {
        suppressed: preview.suppressed,
        missingEmail: preview.missingEmail,
        missingIdentifier: preview.missingIdentifier,
        alreadyEnrolled: preview.alreadyEnrolled,
      },
      totalEnrollments: overview.total,
    };
  }

  const result = await prisma.clientEmailSequenceEnrollment.createMany({
    data: toInsert.map((contactId) => ({
      clientId: input.clientId,
      sequenceId: sequence.id,
      contactId,
      contactListId: sequence.contactListId,
      status: "PENDING" as const,
      createdByStaffUserId: input.staffUserId,
    })),
    skipDuplicates: true,
  });

  return {
    inserted: result.count,
    skipped: {
      suppressed: preview.suppressed,
      missingEmail: preview.missingEmail,
      missingIdentifier: preview.missingIdentifier,
      alreadyEnrolled: preview.alreadyEnrolled,
    },
    totalEnrollments: overview.total + result.count,
  };
}

/**
 * Batch variant for loading many sequences' enrollment state at once
 * so the Outreach page avoids N+1 per-sequence round trips.
 */
export async function loadSequenceEnrollmentCounts(params: {
  clientId: string;
  sequenceIds: readonly string[];
}): Promise<Record<string, EnrollmentStatusCounts>> {
  const out: Record<string, EnrollmentStatusCounts> = {};
  for (const id of params.sequenceIds) out[id] = zeroCounts();
  if (params.sequenceIds.length === 0) return out;
  const rows = await prisma.clientEmailSequenceEnrollment.groupBy({
    by: ["sequenceId", "status"],
    where: {
      clientId: params.clientId,
      sequenceId: { in: params.sequenceIds as string[] },
    },
    _count: { _all: true },
  });
  for (const row of rows) {
    if (!out[row.sequenceId]) out[row.sequenceId] = zeroCounts();
    out[row.sequenceId][row.status] = row._count._all;
  }
  return out;
}

/**
 * Batch variant for the enrollment preview counts of each sequence
 * on the Outreach page. Keeps response shape small (counts only —
 * not the full skipped list) and does not leak member contact ids.
 */
export async function loadSequenceEnrollmentPreviews(params: {
  clientId: string;
  sequences: ReadonlyArray<{
    id: string;
    contactListId: string;
  }>;
}): Promise<
  Record<
    string,
    {
      preview: EnrollmentPreview;
      counts: EnrollmentStatusCounts;
      total: number;
    }
  >
> {
  const out: Record<
    string,
    {
      preview: EnrollmentPreview;
      counts: EnrollmentStatusCounts;
      total: number;
    }
  > = {};

  if (params.sequences.length === 0) return out;

  // Gather all unique contact list ids across these sequences.
  const listIds = Array.from(
    new Set(params.sequences.map((s) => s.contactListId)),
  );

  const [memberRows, enrollRows] = await Promise.all([
    prisma.contactListMember.findMany({
      where: {
        clientId: params.clientId,
        contactListId: { in: listIds },
      },
      select: {
        contactListId: true,
        contact: {
          select: {
            id: true,
            email: true,
            linkedIn: true,
            mobilePhone: true,
            officePhone: true,
            isSuppressed: true,
          },
        },
      },
    }),
    prisma.clientEmailSequenceEnrollment.findMany({
      where: {
        clientId: params.clientId,
        sequenceId: { in: params.sequences.map((s) => s.id) },
      },
      select: { sequenceId: true, contactId: true, status: true },
    }),
  ]);

  const membersByList = new Map<
    string,
    Array<{
      contactId: string;
      email: string | null;
      linkedIn: string | null;
      mobilePhone: string | null;
      officePhone: string | null;
      isSuppressed: boolean;
    }>
  >();
  for (const row of memberRows) {
    const list = membersByList.get(row.contactListId) ?? [];
    list.push({
      contactId: row.contact.id,
      email: row.contact.email,
      linkedIn: row.contact.linkedIn,
      mobilePhone: row.contact.mobilePhone,
      officePhone: row.contact.officePhone,
      isSuppressed: row.contact.isSuppressed,
    });
    membersByList.set(row.contactListId, list);
  }

  const enrollmentsBySequence = new Map<
    string,
    { already: Set<string>; counts: EnrollmentStatusCounts; total: number }
  >();
  for (const row of enrollRows) {
    const existing =
      enrollmentsBySequence.get(row.sequenceId) ?? {
        already: new Set<string>(),
        counts: zeroCounts(),
        total: 0,
      };
    existing.already.add(row.contactId);
    existing.counts[row.status] += 1;
    existing.total += 1;
    enrollmentsBySequence.set(row.sequenceId, existing);
  }

  for (const seq of params.sequences) {
    const already =
      enrollmentsBySequence.get(seq.id)?.already ?? new Set<string>();
    const counts = enrollmentsBySequence.get(seq.id)?.counts ?? zeroCounts();
    const total = enrollmentsBySequence.get(seq.id)?.total ?? 0;
    const candidates = membersByList.get(seq.contactListId) ?? [];
    const preview = buildEnrollmentPreview({
      candidates,
      alreadyEnrolledContactIds: already,
    });
    out[seq.id] = { preview, counts, total };
  }
  return out;
}
