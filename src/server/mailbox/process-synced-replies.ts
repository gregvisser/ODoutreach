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
 * Matching strategy (strongest-first):
 *   Gate: `inReplyToHeader` must be present (RFC 5322 In-Reply-To header).
 *         Messages without it are fresh emails, not thread replies — skip them
 *         entirely to avoid ingesting unrelated inbox traffic as replies.
 *   1. BY_THREAD_REF (definitive): the In-Reply-To value equals the
 *      `rfc822MessageId` we stamped on a specific OutboundEmail for this client.
 *      Unambiguous — a genuine reply to that exact sequence send.
 *   2. BY_CONTACT_EMAIL (legacy fallback): only for outbounds with NO stamped
 *      Message-ID (sent before that feature shipped). Match same clientId, same
 *      mailboxIdentityId, toEmail = inbound fromEmail, sentAt <= received,
 *      status sent/delivered/replied. Requiring `rfc822MessageId = null` here
 *      stops unrelated thread replies from being mislinked to modern sends.
 *   3. If neither matches, skip — don't create unlinked noise.
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
  /** RFC 5322 In-Reply-To header. Null means the message is a fresh email, not a reply. */
  inReplyToHeader: string | null;
}): Promise<{ created: boolean; replyId?: string }> {
  // Only genuine thread replies carry an In-Reply-To header. Without it the
  // message is a new email landing in the mailbox — never an outreach reply.
  if (!input.inReplyToHeader) {
    return { created: false };
  }
  const inReplyTo = input.inReplyToHeader.trim();
  if (!inReplyTo) {
    return { created: false };
  }

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

  // 1) Definitive: the reply's In-Reply-To equals the Message-ID we stamped on
  //    a specific outbound send. Globally unique within the client — a true
  //    reply to that exact sequence email.
  let outbound = await prisma.outboundEmail.findFirst({
    where: {
      clientId: input.clientId,
      rfc822MessageId: inReplyTo,
    },
    orderBy: { sentAt: "desc" },
    select: { id: true, contactId: true, status: true },
  });
  let matchMethod: "BY_THREAD_REF" | "BY_CONTACT_EMAIL" = "BY_THREAD_REF";

  // 2) Legacy fallback: outbounds sent before we stamped Message-IDs. Restrict
  //    to rfc822MessageId = null so modern sends are never loosely matched by
  //    an unrelated thread reply from the same contact.
  if (!outbound) {
    outbound = await prisma.outboundEmail.findFirst({
      where: {
        clientId: input.clientId,
        mailboxIdentityId: input.mailboxIdentityId,
        toEmail: from,
        sentAt: { not: null, lte: input.receivedAt },
        status: { in: ["SENT", "DELIVERED", "REPLIED"] },
        rfc822MessageId: null,
      },
      orderBy: { sentAt: "desc" },
      select: { id: true, contactId: true, status: true },
    });
    matchMethod = "BY_CONTACT_EMAIL";
  }

  if (!outbound) {
    return { created: false };
  }

  const reply = await prisma.inboundReply.create({
    data: {
      clientId: input.clientId,
      contactId: outbound.contactId,
      linkedOutboundEmailId: outbound.id,
      providerMessageId: input.providerMessageId,
      inReplyToProviderId: inReplyTo,
      fromEmail: from,
      toEmail: input.toEmail ? normalizeEmail(input.toEmail) : null,
      subject: input.subject,
      snippet: input.snippet,
      bodyPreview: input.bodyPreview,
      receivedAt: input.receivedAt,
      ingestionSource: "mailbox_sync",
      matchMethod,
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
