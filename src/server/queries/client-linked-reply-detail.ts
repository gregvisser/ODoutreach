import "server-only";

import { prisma } from "@/lib/db";

/**
 * PR #137 — staff-safe linked reply detail.
 *
 * Returns the data needed to render `/clients/[clientId]/activity/replies/[replyId]`:
 *   * the InboundReply (snippet, subject, fromEmail, receivedAt)
 *   * the linked OutboundEmail (subject, sentAt, mailbox)
 *   * the contact (full name, email, suppression)
 *   * the matching enrolment + sequence (status, sequence name)
 *   * an optional `inboundMailboxMessageId` correlation so the UI can deep-link
 *     into the existing message detail page (which already wraps the Graph/Gmail
 *     reply form). Correlation is by `(clientId, mailboxIdentityId, providerMessageId)`
 *     — the exact key the mailbox sync uses to write both records.
 *
 * Access rules (caller is expected to layer `requireOpensDoorsStaff` +
 * `getAccessibleClientIds` on top):
 *   * Reply must belong to `clientId`.
 *   * Reply must have a non-UNLINKED `matchMethod` AND a `linkedOutboundEmailId`
 *     — random inbox mail is invisible here by construction.
 *   * The linked outbound must belong to the same client.
 *
 * Returns `null` (caller renders `notFound()`) on any miss so we never leak
 * the existence of cross-tenant data.
 */
export type LinkedReplyDetail = {
  reply: {
    id: string;
    fromEmail: string;
    toEmail: string | null;
    subject: string | null;
    snippet: string | null;
    bodyPreview: string | null;
    receivedAt: Date;
    matchMethod: string;
    ingestionSource: string;
  };
  contact: {
    id: string | null;
    fullName: string | null;
    email: string | null;
    isSuppressed: boolean;
  };
  linkedOutbound: {
    id: string;
    subject: string | null;
    sentAt: Date | null;
    status: string;
  };
  mailbox: {
    id: string;
    email: string;
    displayName: string | null;
    provider: string;
    connectionStatus: string;
  };
  sequence: {
    id: string;
    name: string;
  } | null;
  enrollment: {
    id: string;
    status: string;
    completedAt: Date | null;
    pausedAt: Date | null;
  } | null;
  /** Set when a corresponding `InboundMailboxMessage` exists — staff can
   *  reply through the existing message-detail page. */
  inboundMailboxMessageId: string | null;
};

export async function loadClientLinkedReplyDetail(args: {
  clientId: string;
  replyId: string;
}): Promise<LinkedReplyDetail | null> {
  const { clientId, replyId } = args;
  if (!clientId || !replyId) return null;

  const reply = await prisma.inboundReply.findFirst({
    where: {
      id: replyId,
      clientId,
      matchMethod: { not: "UNLINKED" },
      linkedOutboundEmailId: { not: null },
    },
    select: {
      id: true,
      fromEmail: true,
      toEmail: true,
      subject: true,
      snippet: true,
      bodyPreview: true,
      receivedAt: true,
      matchMethod: true,
      ingestionSource: true,
      providerMessageId: true,
      contact: {
        select: {
          id: true,
          fullName: true,
          email: true,
          isSuppressed: true,
        },
      },
      linkedOutbound: {
        select: {
          id: true,
          clientId: true,
          subject: true,
          sentAt: true,
          status: true,
          mailboxIdentityId: true,
          mailbox: {
            select: {
              id: true,
              email: true,
              displayName: true,
              provider: true,
              connectionStatus: true,
            },
          },
          sequenceStepSends: {
            take: 1,
            orderBy: { createdAt: "desc" },
            select: {
              enrollment: {
                select: {
                  id: true,
                  status: true,
                  completedAt: true,
                  pausedAt: true,
                  sequence: { select: { id: true, name: true } },
                },
              },
            },
          },
        },
      },
    },
  });

  if (!reply || !reply.linkedOutbound) return null;
  if (reply.linkedOutbound.clientId !== clientId) return null;
  if (!reply.linkedOutbound.mailbox) return null;

  // Look up a correlated InboundMailboxMessage so staff can reply through
  // the existing Graph/Gmail-aware message detail page. Only mailbox-synced
  // replies will have one (webhook-ingested replies won't, and that's
  // surfaced in the UI as a "reply unavailable here" affordance).
  let inboundMailboxMessageId: string | null = null;
  if (reply.providerMessageId && reply.linkedOutbound.mailboxIdentityId) {
    const ibm = await prisma.inboundMailboxMessage.findFirst({
      where: {
        clientId,
        mailboxIdentityId: reply.linkedOutbound.mailboxIdentityId,
        providerMessageId: reply.providerMessageId,
      },
      select: { id: true },
    });
    inboundMailboxMessageId = ibm?.id ?? null;
  }

  const stepSendEnrolment =
    reply.linkedOutbound.sequenceStepSends[0]?.enrollment ?? null;

  return {
    reply: {
      id: reply.id,
      fromEmail: reply.fromEmail,
      toEmail: reply.toEmail,
      subject: reply.subject,
      snippet: reply.snippet,
      bodyPreview: reply.bodyPreview,
      receivedAt: reply.receivedAt,
      matchMethod: reply.matchMethod,
      ingestionSource: reply.ingestionSource,
    },
    contact: {
      id: reply.contact?.id ?? null,
      fullName: reply.contact?.fullName ?? null,
      email: reply.contact?.email ?? null,
      isSuppressed: reply.contact?.isSuppressed ?? false,
    },
    linkedOutbound: {
      id: reply.linkedOutbound.id,
      subject: reply.linkedOutbound.subject,
      sentAt: reply.linkedOutbound.sentAt,
      status: reply.linkedOutbound.status,
    },
    mailbox: {
      id: reply.linkedOutbound.mailbox.id,
      email: reply.linkedOutbound.mailbox.email,
      displayName: reply.linkedOutbound.mailbox.displayName,
      provider: reply.linkedOutbound.mailbox.provider,
      connectionStatus: reply.linkedOutbound.mailbox.connectionStatus,
    },
    sequence: stepSendEnrolment?.sequence ?? null,
    enrollment: stepSendEnrolment
      ? {
          id: stepSendEnrolment.id,
          status: stepSendEnrolment.status,
          completedAt: stepSendEnrolment.completedAt,
          pausedAt: stepSendEnrolment.pausedAt,
        }
      : null,
    inboundMailboxMessageId,
  };
}
