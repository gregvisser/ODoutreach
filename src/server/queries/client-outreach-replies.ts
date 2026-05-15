import "server-only";

import { prisma } from "@/lib/db";

export type OutreachReplyRow = {
  id: string;
  fromEmail: string;
  subject: string | null;
  bodyPreview: string | null;
  receivedAt: Date;
  matchMethod: string;
  linkedOutboundEmailId: string | null;
  contactName: string | null;
  sequenceName: string | null;
  outboundSubject: string | null;
};

export type MailboxReplyGroup = {
  mailboxId: string;
  mailboxEmail: string;
  mailboxDisplayName: string | null;
  replyCount: number;
  replies: OutreachReplyRow[];
};

/**
 * PR #130 — load only sequence-linked replies for a client, grouped by
 * the mailbox that the outbound email was sent from.
 *
 * A reply is "linked" when `matchMethod` is not `UNLINKED` AND the
 * `linkedOutboundEmailId` points to an OutboundEmail that belongs to
 * this same client. Unlinked general inbox messages are excluded.
 */
export async function loadClientOutreachReplies(
  clientId: string,
): Promise<MailboxReplyGroup[]> {
  if (!clientId) return [];

  const replies = await prisma.inboundReply.findMany({
    where: {
      clientId,
      matchMethod: { not: "UNLINKED" },
      linkedOutboundEmailId: { not: null },
    },
    orderBy: { receivedAt: "desc" },
    take: 200,
    select: {
      id: true,
      fromEmail: true,
      subject: true,
      bodyPreview: true,
      receivedAt: true,
      matchMethod: true,
      linkedOutboundEmailId: true,
      contact: { select: { fullName: true, email: true } },
      linkedOutbound: {
        select: {
          id: true,
          subject: true,
          mailboxIdentityId: true,
          mailbox: {
            select: {
              id: true,
              email: true,
              displayName: true,
            },
          },
          sequenceStepSends: {
            take: 1,
            orderBy: { createdAt: "desc" },
            select: {
              sequence: { select: { name: true } },
            },
          },
        },
      },
    },
  });

  const grouped = new Map<string, MailboxReplyGroup>();

  for (const r of replies) {
    const mbx = r.linkedOutbound?.mailbox;
    if (!mbx) continue;

    const row: OutreachReplyRow = {
      id: r.id,
      fromEmail: r.fromEmail,
      subject: r.subject,
      bodyPreview: r.bodyPreview,
      receivedAt: r.receivedAt,
      matchMethod: r.matchMethod,
      linkedOutboundEmailId: r.linkedOutboundEmailId,
      contactName: r.contact?.fullName ?? null,
      sequenceName:
        r.linkedOutbound?.sequenceStepSends?.[0]?.sequence?.name ?? null,
      outboundSubject: r.linkedOutbound?.subject ?? null,
    };

    const existing = grouped.get(mbx.id);
    if (existing) {
      existing.replyCount += 1;
      existing.replies.push(row);
    } else {
      grouped.set(mbx.id, {
        mailboxId: mbx.id,
        mailboxEmail: mbx.email,
        mailboxDisplayName: mbx.displayName,
        replyCount: 1,
        replies: [row],
      });
    }
  }

  const connectedMailboxes = await prisma.clientMailboxIdentity.findMany({
    where: {
      clientId,
      workspaceRemovedAt: null,
      connectionStatus: "CONNECTED",
    },
    select: { id: true, email: true, displayName: true },
    orderBy: { email: "asc" },
  });

  for (const m of connectedMailboxes) {
    if (!grouped.has(m.id)) {
      grouped.set(m.id, {
        mailboxId: m.id,
        mailboxEmail: m.email,
        mailboxDisplayName: m.displayName,
        replyCount: 0,
        replies: [],
      });
    }
  }

  return Array.from(grouped.values()).sort((a, b) =>
    a.mailboxEmail.localeCompare(b.mailboxEmail),
  );
}
