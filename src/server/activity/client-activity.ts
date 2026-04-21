import "server-only";

import { prisma } from "@/lib/db";
import {
  buildClientTimeline,
  classifyImportBatchStatus,
  classifyOutboundStatus,
  classifyStepSendStatus,
  DEFAULT_TIMELINE_LIMIT,
  type BuildTimelineResult,
  type TimelineEvent,
} from "@/lib/activity/client-activity-timeline";
import {
  SEQUENCE_FOLLOWUP_SEND_METADATA_KIND,
  SEQUENCE_INTRO_SEND_METADATA_KIND,
} from "@/lib/email-sequences/sequence-send-execution-constants";

/**
 * PR H — unified activity timeline loader.
 *
 * Pulls recent events from every first-class source that is already
 * writing rows for this client and hands them to the pure timeline
 * builder. Every query is constrained to `clientId` directly, and the
 * per-source fetch is capped so a single noisy source can't crowd out
 * the rest of the picture. Sorting, further capping, and aggregate
 * counting happen in `buildClientTimeline`.
 *
 * No writes. No cross-client reads.
 */

const PER_SOURCE_LIMIT = 40;

type LoadOptions = {
  /** Overall cap on the merged timeline; defaults to 100. */
  limit?: number;
};

export async function loadClientActivityTimeline(
  clientId: string,
  opts: LoadOptions = {},
): Promise<BuildTimelineResult> {
  if (!clientId) {
    return {
      events: [],
      summary: {
        totalEvents: 0,
        byType: {},
        warnings: 0,
        errors: 0,
        latestAtIso: null,
      },
      capped: false,
    };
  }

  const limit = opts.limit ?? DEFAULT_TIMELINE_LIMIT;

  const [
    outbound,
    inboundReplies,
    inboundMessages,
    imports,
    lists,
    templates,
    sequences,
    enrollments,
    stepSends,
    audits,
  ] = await Promise.all([
    prisma.outboundEmail.findMany({
      where: { clientId },
      orderBy: { createdAt: "desc" },
      take: PER_SOURCE_LIMIT,
      select: {
        id: true,
        status: true,
        subject: true,
        toEmail: true,
        fromAddress: true,
        lastErrorMessage: true,
        sentAt: true,
        bouncedAt: true,
        queuedAt: true,
        createdAt: true,
        failureReason: true,
        metadata: true,
      },
    }),
    prisma.inboundReply.findMany({
      where: { clientId },
      orderBy: { receivedAt: "desc" },
      take: PER_SOURCE_LIMIT,
      select: {
        id: true,
        fromEmail: true,
        subject: true,
        receivedAt: true,
        matchMethod: true,
        linkedOutboundEmailId: true,
      },
    }),
    prisma.inboundMailboxMessage.findMany({
      where: { clientId },
      orderBy: { receivedAt: "desc" },
      take: PER_SOURCE_LIMIT,
      select: {
        id: true,
        fromEmail: true,
        subject: true,
        receivedAt: true,
        mailboxIdentityId: true,
      },
    }),
    prisma.contactImportBatch.findMany({
      where: { clientId },
      orderBy: { createdAt: "desc" },
      take: PER_SOURCE_LIMIT,
      select: {
        id: true,
        fileName: true,
        status: true,
        rowCount: true,
        errorMessage: true,
        completedAt: true,
        createdAt: true,
      },
    }),
    prisma.contactList.findMany({
      where: { clientId },
      orderBy: { createdAt: "desc" },
      take: PER_SOURCE_LIMIT,
      select: {
        id: true,
        name: true,
        createdAt: true,
        _count: { select: { members: true } },
      },
    }),
    prisma.clientEmailTemplate.findMany({
      where: { clientId },
      orderBy: { updatedAt: "desc" },
      take: PER_SOURCE_LIMIT,
      select: {
        id: true,
        name: true,
        status: true,
        category: true,
        approvedAt: true,
        archivedAt: true,
        createdAt: true,
      },
    }),
    prisma.clientEmailSequence.findMany({
      where: { clientId },
      orderBy: { updatedAt: "desc" },
      take: PER_SOURCE_LIMIT,
      select: {
        id: true,
        name: true,
        status: true,
        approvedAt: true,
        archivedAt: true,
        createdAt: true,
      },
    }),
    prisma.clientEmailSequenceEnrollment.findMany({
      where: { clientId },
      orderBy: { enrolledAt: "desc" },
      take: PER_SOURCE_LIMIT,
      select: {
        id: true,
        status: true,
        enrolledAt: true,
        exclusionReason: true,
        sequence: { select: { name: true } },
        contact: { select: { email: true, fullName: true } },
      },
    }),
    prisma.clientEmailSequenceStepSend.findMany({
      where: { clientId },
      orderBy: { updatedAt: "desc" },
      take: PER_SOURCE_LIMIT,
      select: {
        id: true,
        status: true,
        blockedReason: true,
        updatedAt: true,
        createdAt: true,
        sequence: { select: { name: true } },
        contact: { select: { email: true, fullName: true } },
      },
    }),
    prisma.auditLog.findMany({
      where: { clientId },
      orderBy: { createdAt: "desc" },
      take: PER_SOURCE_LIMIT,
      select: {
        id: true,
        action: true,
        entityType: true,
        entityId: true,
        createdAt: true,
        staffUser: { select: { displayName: true, email: true } },
      },
    }),
  ]);

  const events: TimelineEvent[] = [];

  for (const row of outbound) {
    const { type, severity } = classifyOutboundStatus(row.status);
    const occurredAt =
      row.sentAt ?? row.bouncedAt ?? row.queuedAt ?? row.createdAt;
    const toEmail = row.toEmail;
    const metaKind = readOutboundMetadataKind(row.metadata);
    const metaStepCategory = readOutboundMetadataStepCategory(row.metadata);
    const isSequenceIntro =
      metaKind === SEQUENCE_INTRO_SEND_METADATA_KIND;
    const isSequenceFollowUp =
      metaKind === SEQUENCE_FOLLOWUP_SEND_METADATA_KIND;
    const title = isSequenceIntro
      ? severityToSequenceStepTitle(row.status, toEmail, "INTRODUCTION")
      : isSequenceFollowUp
        ? severityToSequenceStepTitle(
            row.status,
            toEmail,
            metaStepCategory ?? "FOLLOW_UP",
          )
        : severityToOutboundTitle(row.status, toEmail);
    const descriptionParts: string[] = [];
    if (row.subject) descriptionParts.push(`“${row.subject}”`);
    if (row.status === "FAILED" && row.failureReason) {
      descriptionParts.push(row.failureReason);
    } else if (row.status === "FAILED" && row.lastErrorMessage) {
      descriptionParts.push(row.lastErrorMessage);
    }
    events.push({
      id: `outbound:${row.id}`,
      occurredAt,
      type,
      severity,
      title,
      description: descriptionParts.join(" — ") || undefined,
      href: `/activity/outbound/${row.id}`,
      sourceModel: "OutboundEmail",
    });
  }

  for (const row of inboundReplies) {
    events.push({
      id: `reply:${row.id}`,
      occurredAt: row.receivedAt,
      type: "reply",
      severity: row.matchMethod === "UNLINKED" ? "info" : "success",
      title: `Reply from ${row.fromEmail}`,
      description: row.subject ? `“${row.subject}”` : undefined,
      actorLabel: row.fromEmail,
      sourceModel: "InboundReply",
    });
  }

  for (const row of inboundMessages) {
    events.push({
      id: `inbound:${row.id}`,
      occurredAt: row.receivedAt,
      type: "inbound_message",
      severity: "info",
      title: `Inbound message from ${row.fromEmail}`,
      description: row.subject ? `“${row.subject}”` : undefined,
      actorLabel: row.fromEmail,
      sourceModel: "InboundMailboxMessage",
    });
  }

  for (const row of imports) {
    const severity = classifyImportBatchStatus(row.status);
    const occurredAt = row.completedAt ?? row.createdAt;
    const rowCount = row.rowCount;
    const fileName = row.fileName ?? "upload.csv";
    const description =
      row.status === "FAILED" && row.errorMessage
        ? row.errorMessage
        : `${String(rowCount)} row${rowCount === 1 ? "" : "s"} (${row.status.toLowerCase()})`;
    events.push({
      id: `import:${row.id}`,
      occurredAt,
      type: "csv_import",
      severity,
      title: `CSV import — ${fileName}`,
      description,
      sourceModel: "ContactImportBatch",
    });
  }

  for (const row of lists) {
    const memberCount = row._count.members;
    events.push({
      id: `list:${row.id}`,
      occurredAt: row.createdAt,
      type: "contact_list",
      severity: "info",
      title: `Contact list created — ${row.name}`,
      description: `${String(memberCount)} member${memberCount === 1 ? "" : "s"}`,
      sourceModel: "ContactList",
    });
  }

  for (const row of templates) {
    events.push({
      id: `template-created:${row.id}`,
      occurredAt: row.createdAt,
      type: "template",
      severity: "info",
      title: `Template created — ${row.name}`,
      description: `Category: ${row.category}`,
      sourceModel: "ClientEmailTemplate",
    });
    if (row.approvedAt) {
      events.push({
        id: `template-approved:${row.id}`,
        occurredAt: row.approvedAt,
        type: "template",
        severity: "success",
        title: `Template approved — ${row.name}`,
        description: `Category: ${row.category}`,
        sourceModel: "ClientEmailTemplate",
      });
    }
    if (row.archivedAt) {
      events.push({
        id: `template-archived:${row.id}`,
        occurredAt: row.archivedAt,
        type: "template",
        severity: "warning",
        title: `Template archived — ${row.name}`,
        sourceModel: "ClientEmailTemplate",
      });
    }
  }

  for (const row of sequences) {
    events.push({
      id: `sequence-created:${row.id}`,
      occurredAt: row.createdAt,
      type: "sequence",
      severity: "info",
      title: `Sequence created — ${row.name}`,
      description: `Status: ${row.status}`,
      sourceModel: "ClientEmailSequence",
    });
    if (row.approvedAt) {
      events.push({
        id: `sequence-approved:${row.id}`,
        occurredAt: row.approvedAt,
        type: "sequence",
        severity: "success",
        title: `Sequence approved — ${row.name}`,
        sourceModel: "ClientEmailSequence",
      });
    }
    if (row.archivedAt) {
      events.push({
        id: `sequence-archived:${row.id}`,
        occurredAt: row.archivedAt,
        type: "sequence",
        severity: "warning",
        title: `Sequence archived — ${row.name}`,
        sourceModel: "ClientEmailSequence",
      });
    }
  }

  for (const row of enrollments) {
    const contactLabel =
      row.contact?.fullName ??
      row.contact?.email ??
      "contact without email";
    const sequenceName = row.sequence?.name ?? "sequence";
    const severity = row.status === "EXCLUDED" ? "warning" : "info";
    events.push({
      id: `enrollment:${row.id}`,
      occurredAt: row.enrolledAt,
      type: "enrollment",
      severity,
      title: `Enrollment — ${contactLabel}`,
      description:
        row.status === "EXCLUDED" && row.exclusionReason
          ? `${sequenceName}: excluded (${row.exclusionReason})`
          : `${sequenceName}: ${row.status.toLowerCase()}`,
      sourceModel: "ClientEmailSequenceEnrollment",
    });
  }

  for (const row of stepSends) {
    const contactLabel =
      row.contact?.fullName ??
      row.contact?.email ??
      "contact without email";
    const sequenceName = row.sequence?.name ?? "sequence";
    const statusLower = row.status.toLowerCase();
    // "records only" is only true before D4e.2 dispatch. Once a row flips
    // to SENT it represents a real queued/sent OutboundEmail, so we drop
    // that qualifier to avoid misleading operators.
    const dispatched = row.status === "SENT";
    const description =
      row.blockedReason && row.blockedReason.length > 0
        ? `${sequenceName}: ${statusLower} — ${row.blockedReason}`
        : dispatched
          ? `${sequenceName}: ${statusLower} (queued to outbound)`
          : `${sequenceName}: ${statusLower} (records only)`;
    events.push({
      id: `step-send:${row.id}`,
      occurredAt: row.updatedAt,
      type: "step_send",
      severity: classifyStepSendStatus(row.status),
      title: `Sequence step send — ${contactLabel}`,
      description,
      sourceModel: "ClientEmailSequenceStepSend",
    });
  }

  for (const row of audits) {
    const actorLabel =
      row.staffUser?.displayName ?? row.staffUser?.email ?? "System";
    const severity =
      row.action === "DELETE"
        ? "warning"
        : row.action === "LOGIN"
          ? "info"
          : "info";
    // Mailbox-connection audits get a nicer label so the operator sees
    // "Mailbox connected" instead of a generic UPDATE on
    // ClientMailboxIdentity.
    if (row.entityType === "ClientMailboxIdentity") {
      events.push({
        id: `audit:${row.id}`,
        occurredAt: row.createdAt,
        type: "mailbox_oauth",
        severity,
        title: `Mailbox identity updated`,
        description: `${row.action.toLowerCase()} by ${actorLabel}`,
        actorLabel,
        sourceModel: "AuditLog",
      });
      continue;
    }
    events.push({
      id: `audit:${row.id}`,
      occurredAt: row.createdAt,
      type: "audit",
      severity,
      title: `${row.action} · ${row.entityType}`,
      description: `by ${actorLabel}`,
      actorLabel,
      sourceModel: "AuditLog",
    });
  }

  return buildClientTimeline(events, limit);
}

function severityToOutboundTitle(status: string, toEmail: string): string {
  switch (status) {
    case "SENT":
      return `Email sent to ${toEmail}`;
    case "DELIVERED":
      return `Email delivered to ${toEmail}`;
    case "REPLIED":
      return `Email replied — ${toEmail}`;
    case "BOUNCED":
      return `Email bounced — ${toEmail}`;
    case "FAILED":
      return `Email failed — ${toEmail}`;
    case "BLOCKED_SUPPRESSION":
      return `Email blocked by suppression — ${toEmail}`;
    case "PROCESSING":
      return `Email sending — ${toEmail}`;
    case "PREPARING":
    case "REQUESTED":
    case "QUEUED":
    default:
      return `Email queued — ${toEmail}`;
  }
}

/**
 * PR D4e.2/D4e.3 — friendlier titles for OutboundEmail rows that are
 * part of a sequence send (introduction or follow-up N). The metadata
 * sentinel is set by `sendSequenceStepBatch`. Any row without that
 * sentinel falls back to the generic outbound title above.
 */
function severityToSequenceStepTitle(
  status: string,
  toEmail: string,
  stepCategory: string,
): string {
  const stepLabel = formatStepCategoryLabel(stepCategory);
  switch (status) {
    case "SENT":
      return `Sequence ${stepLabel} sent to ${toEmail}`;
    case "DELIVERED":
      return `Sequence ${stepLabel} delivered to ${toEmail}`;
    case "REPLIED":
      return `Sequence ${stepLabel} replied — ${toEmail}`;
    case "BOUNCED":
      return `Sequence ${stepLabel} bounced — ${toEmail}`;
    case "FAILED":
      return `Sequence ${stepLabel} failed — ${toEmail}`;
    case "BLOCKED_SUPPRESSION":
      return `Sequence ${stepLabel} blocked by suppression — ${toEmail}`;
    case "PROCESSING":
      return `Sequence ${stepLabel} sending — ${toEmail}`;
    case "PREPARING":
    case "REQUESTED":
    case "QUEUED":
    default:
      return `Sequence ${stepLabel} queued — ${toEmail}`;
  }
}

/**
 * Turns a `ClientEmailTemplateCategory` into a human-readable label
 * used inside timeline titles. Defensive against unknown values — we
 * strip FOLLOW_UP_ underscores and fall back to "follow-up" if the
 * value is missing entirely.
 */
function formatStepCategoryLabel(stepCategory: string): string {
  if (stepCategory === "INTRODUCTION") return "introduction";
  if (stepCategory.startsWith("FOLLOW_UP_")) {
    const n = stepCategory.slice("FOLLOW_UP_".length);
    return `follow-up ${n}`;
  }
  return "follow-up";
}

/**
 * Reads `metadata.kind` off an OutboundEmail JSON column without
 * throwing on null/unknown shapes. Prisma types `metadata` as
 * `Prisma.JsonValue` so we narrow defensively here.
 */
function readOutboundMetadataKind(meta: unknown): string | null {
  if (
    meta !== null &&
    typeof meta === "object" &&
    !Array.isArray(meta) &&
    "kind" in (meta as Record<string, unknown>)
  ) {
    const kind = (meta as Record<string, unknown>).kind;
    return typeof kind === "string" ? kind : null;
  }
  return null;
}

/**
 * PR D4e.3 — reads `metadata.stepCategory` off an OutboundEmail row so
 * the timeline can render "Sequence follow-up 2 sent" instead of a
 * generic "follow-up" label. Defensive against null/unknown shapes.
 */
function readOutboundMetadataStepCategory(meta: unknown): string | null {
  if (
    meta !== null &&
    typeof meta === "object" &&
    !Array.isArray(meta) &&
    "stepCategory" in (meta as Record<string, unknown>)
  ) {
    const cat = (meta as Record<string, unknown>).stepCategory;
    return typeof cat === "string" ? cat : null;
  }
  return null;
}
