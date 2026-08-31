import "server-only";

import { prisma } from "@/lib/db";
import { readHandlingStateFromMetadata } from "@/lib/inbox/inbound-message-handling";
import {
  replyClaimSubjectKey,
  resolveReplyClaimSubject,
} from "@/lib/inbox/reply-claim";
import type { ReplyOwnershipState } from "@/lib/inbox/reply-ownership";
import { resolveReplyOwnershipState } from "@/lib/inbox/reply-ownership";
import { loadDisplayClaimsForSubjects } from "@/server/inbox/reply-claim";

import type { ReplyClassification } from "@/generated/prisma/enums";

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
  /** Row 80 — what the AI read this reply as. Null = nobody has labelled it. */
  classification: ReplyClassification | null;
  classificationRationale: string | null;
  /** Row 132 — who has this open, or has dealt with it. */
  ownership: ReplyOwnershipState;
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
  viewerStaffUserId?: string,
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
      classification: true,
      classificationRationale: true,
      providerMessageId: true,
      // Row 132 — durable "somebody dealt with this", owned by the reply.
      handledAt: true,
      handledByStaffUserId: true,
      handledByStaff: { select: { displayName: true, email: true } },
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

  // Row 132 — the older, mailbox-message-scoped "handled" signal (see
  // `readHandlingStateFromMetadata`) and the correlated message id a claim
  // may have been recorded against, batched the same way
  // `getRepliesNeedingAPerson` does it.
  const providerMessageIds = replies
    .map((r) => r.providerMessageId)
    .filter((id): id is string => typeof id === "string" && id.length > 0);

  const correlationByKey = new Map<
    string,
    { inboundMailboxMessageId: string; handledAt: Date | null }
  >();
  if (providerMessageIds.length > 0) {
    const messages = await prisma.inboundMailboxMessage.findMany({
      where: { clientId, providerMessageId: { in: providerMessageIds } },
      select: {
        id: true,
        mailboxIdentityId: true,
        providerMessageId: true,
        metadata: true,
      },
    });
    for (const m of messages) {
      if (!m.providerMessageId) continue;
      const state = readHandlingStateFromMetadata(m.metadata);
      correlationByKey.set(`${m.mailboxIdentityId ?? ""}|${m.providerMessageId}`, {
        inboundMailboxMessageId: m.id,
        handledAt: state.handledAt ? new Date(state.handledAt) : null,
      });
    }
  }

  const subjectByReplyId = new Map(
    replies.map((r) => {
      const correlation =
        r.providerMessageId && r.linkedOutbound?.mailboxIdentityId
          ? correlationByKey.get(
              `${r.linkedOutbound.mailboxIdentityId}|${r.providerMessageId}`,
            )
          : undefined;
      return [
        r.id,
        resolveReplyClaimSubject({
          replyId: r.id,
          inboundMailboxMessageId: correlation?.inboundMailboxMessageId ?? null,
        }),
      ] as const;
    }),
  );

  const claimsBySubjectKey = viewerStaffUserId
    ? await loadDisplayClaimsForSubjects({
        clientId,
        subjects: Array.from(subjectByReplyId.values()),
        viewerStaffUserId,
      })
    : new Map();

  const grouped = new Map<string, MailboxReplyGroup>();

  for (const r of replies) {
    const mbx = r.linkedOutbound?.mailbox;
    if (!mbx) continue;

    const correlation =
      r.providerMessageId && r.linkedOutbound?.mailboxIdentityId
        ? correlationByKey.get(
            `${r.linkedOutbound.mailboxIdentityId}|${r.providerMessageId}`,
          )
        : undefined;
    const subject = subjectByReplyId.get(r.id);
    const claim = subject ? (claimsBySubjectKey.get(replyClaimSubjectKey(subject)) ?? null) : null;

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
      classification: r.classification,
      classificationRationale: r.classificationRationale,
      ownership: resolveReplyOwnershipState({
        handledAt: r.handledAt ?? correlation?.handledAt ?? null,
        handledByName: r.handledByStaff?.displayName ?? r.handledByStaff?.email ?? null,
        handledByIsViewer:
          viewerStaffUserId !== undefined &&
          r.handledByStaffUserId === viewerStaffUserId,
        claim,
      }),
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
