import "server-only";

import { prisma } from "@/lib/db";
import {
  buildClientTimeline,
  classifyImportBatchStatus,
  classifyOutboundStatus,
  DEFAULT_TIMELINE_LIMIT,
  type BuildTimelineResult,
  type TimelineEvent,
} from "@/lib/activity/client-activity-timeline";

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
    const title = severityToOutboundTitle(row.status, toEmail);
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
