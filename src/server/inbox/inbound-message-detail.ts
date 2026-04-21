import "server-only";

import { prisma } from "@/lib/db";
import { readHandlingStateFromMetadata } from "@/lib/inbox/inbound-message-handling";
import type {
  ClientMailboxIdentity,
  InboundMailboxMessage,
  OutboundEmail,
} from "@/generated/prisma/client";

export type InboundMessageLink = {
  outbound: Pick<
    OutboundEmail,
    "id" | "subject" | "toEmail" | "sentAt" | "status"
  > | null;
  contactId: string | null;
};

export type InboundMessageDetail = {
  message: InboundMailboxMessage;
  mailbox: Pick<
    ClientMailboxIdentity,
    | "id"
    | "email"
    | "displayName"
    | "provider"
    | "connectionStatus"
    | "canSend"
    | "isSendingEnabled"
    | "isActive"
  >;
  handling: ReturnType<typeof readHandlingStateFromMetadata>;
  /** Outbound replies we have already sent for this inbound message. */
  replyHistory: Pick<
    OutboundEmail,
    "id" | "subject" | "toEmail" | "sentAt" | "status" | "createdAt"
  >[];
  /** Matching InboundReply row (if any) for operator context. */
  linkedReply: {
    id: string;
    linkedOutboundEmailId: string | null;
    matchMethod: string;
  } | null;
};

/**
 * Loads a single InboundMailboxMessage and its adjacent rows for the
 * detail page. Tenant isolation is enforced by caller (`requireClientAccess`)
 * and double-enforced here via the `clientId` filter — this loader must
 * never leak across workspaces.
 *
 * Returns `null` when the message does not belong to the given client
 * or does not exist; the page renders a 404 on null.
 */
export async function loadInboundMessageDetailForClient(
  clientId: string,
  messageId: string,
): Promise<InboundMessageDetail | null> {
  if (!clientId || !messageId) return null;

  const message = await prisma.inboundMailboxMessage.findFirst({
    where: { id: messageId, clientId },
  });
  if (!message) return null;

  const [mailbox, replyHistory, linkedReply] = await Promise.all([
    prisma.clientMailboxIdentity.findFirst({
      where: { id: message.mailboxIdentityId, clientId },
      select: {
        id: true,
        email: true,
        displayName: true,
        provider: true,
        connectionStatus: true,
        canSend: true,
        isSendingEnabled: true,
        isActive: true,
      },
    }),
    loadReplyHistoryForInboundMessage(clientId, message),
    findLinkedInboundReply(clientId, message),
  ]);

  if (!mailbox) return null;

  const handling = readHandlingStateFromMetadata(message.metadata);

  return {
    message,
    mailbox,
    handling,
    replyHistory,
    linkedReply,
  };
}

async function loadReplyHistoryForInboundMessage(
  clientId: string,
  message: InboundMailboxMessage,
): Promise<
  Pick<
    OutboundEmail,
    "id" | "subject" | "toEmail" | "sentAt" | "status" | "createdAt"
  >[]
> {
  const handling = readHandlingStateFromMetadata(message.metadata);
  if (handling.replyOutboundEmailIds.length === 0) return [];
  return prisma.outboundEmail.findMany({
    where: {
      id: { in: handling.replyOutboundEmailIds },
      clientId,
    },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      subject: true,
      toEmail: true,
      sentAt: true,
      status: true,
      createdAt: true,
    },
  });
}

async function findLinkedInboundReply(
  clientId: string,
  message: InboundMailboxMessage,
): Promise<{
  id: string;
  linkedOutboundEmailId: string | null;
  matchMethod: string;
} | null> {
  if (!message.providerMessageId) return null;
  const hit = await prisma.inboundReply.findFirst({
    where: {
      clientId,
      providerMessageId: message.providerMessageId,
    },
    select: { id: true, linkedOutboundEmailId: true, matchMethod: true },
  });
  return hit
    ? {
        id: hit.id,
        linkedOutboundEmailId: hit.linkedOutboundEmailId,
        matchMethod: hit.matchMethod,
      }
    : null;
}
