import "server-only";

import { prisma } from "@/lib/db";
import { normalizeEmail } from "@/lib/normalize";
import { canApplyReplyMilestone } from "@/server/email/outbound/lifecycle";
import { stopFollowUpsForLinkedReply } from "@/server/email-sequences/stop-follow-ups-on-reply";

/**
 * After mailbox inbox sync upserts an InboundMailboxMessage, this function
 * checks whether that message is a reply to one of our outbound sequence
 * emails and, if so, creates an InboundReply linked to the outbound.
 *
 * Matching strategy (mailbox-scoped, strongest-first):
 *   1. Find an OutboundEmail WHERE same clientId, same mailboxIdentityId,
 *      toEmail = inbound fromEmail, status is sent/delivered/replied, sentAt set.
 *      Take the most recent match (handles multiple sequence sends to same contact).
 *   2. If no mailbox-scoped match, skip — don't create unlinked noise.
 *
 * Idempotent: skips if an InboundReply already exists for this providerMessageId.
 */
export async function processSyncedMessageForReply(input: {
  clientId: string;
  mailboxIdentityId: string;
  providerMessageId: string;
  fromEmail: string;
  toEmail: string | null;
  subject: string | null;
  snippet: string | null;
  bodyPreview: string | null;
  receivedAt: Date;
  conversationId: string | null;
}): Promise<{ created: boolean; replyId?: string }> {
  const from = normalizeEmail(input.fromEmail);

  const existing = await prisma.inboundReply.findFirst({
    where: {
      clientId: input.clientId,
      providerMessageId: input.providerMessageId,
    },
    select: { id: true },
  });
  if (existing) {
    return { created: false };
  }

  const outbound = await prisma.outboundEmail.findFirst({
    where: {
      clientId: input.clientId,
      mailboxIdentityId: input.mailboxIdentityId,
      toEmail: from,
      sentAt: { not: null },
      status: { in: ["SENT", "DELIVERED", "REPLIED"] },
    },
    orderBy: { sentAt: "desc" },
    select: { id: true, contactId: true, status: true },
  });

  if (!outbound) {
    return { created: false };
  }

  const reply = await prisma.inboundReply.create({
    data: {
      clientId: input.clientId,
      contactId: outbound.contactId,
      linkedOutboundEmailId: outbound.id,
      providerMessageId: input.providerMessageId,
      fromEmail: from,
      toEmail: input.toEmail ? normalizeEmail(input.toEmail) : null,
      subject: input.subject,
      snippet: input.snippet,
      bodyPreview: input.bodyPreview,
      receivedAt: input.receivedAt,
      ingestionSource: "mailbox_sync",
      matchMethod: "BY_CONTACT_EMAIL",
    },
  });

  if (canApplyReplyMilestone(outbound.status)) {
    await prisma.outboundEmail.update({
      where: { id: outbound.id },
      data: { status: "REPLIED" },
    });
  }

  // PR #137 — stop follow-ups for the matching sequence enrolment. Safe to
  // call unconditionally: it's a no-op when the outbound has no step-send
  // record, when the enrolment is already EXCLUDED/COMPLETED, or when the
  // same reply is re-processed.
  await stopFollowUpsForLinkedReply({
    clientId: input.clientId,
    outboundEmailId: outbound.id,
  });

  return { created: true, replyId: reply.id };
}
