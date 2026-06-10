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
 *   Gate: the inbound message must look like a reply / forward — either the
 *         RFC 5322 In-Reply-To header is present, OR the subject starts with
 *         a reply/forward prefix ("Re:", "RE:", "Fwd:", "Sv:", "Aw:", etc.).
 *         The subject fallback exists because Microsoft Graph's
 *         list-messages endpoint does NOT actually populate
 *         internetMessageHeaders — every Microsoft 365 sync would otherwise
 *         reject every reply. Fresh inbox mail (no header, no Re:) is skipped.
 *   1. BY_THREAD_REF (definitive, only when In-Reply-To present): the header
 *      value equals the `rfc822MessageId` we stamped on a specific OutboundEmail
 *      for this client. Unambiguous — a genuine reply to that exact send.
 *   2. BY_CONTACT_EMAIL subject-anchored: any outbound (stamped or not) to
 *      that exact recipient from that mailbox whose subject equals the
 *      reply's base subject (Re:/Fwd: prefixes stripped). Required because
 *      Gmail rewrites outgoing Message-IDs, so a stamped send can miss the
 *      thread match through no fault of ours.
 *   3. BY_CONTACT_EMAIL legacy fallback: outbounds with NO stamped
 *      Message-ID (Microsoft Graph sends, and legacy Gmail). Match same
 *      clientId, same mailboxIdentityId, toEmail = inbound fromEmail,
 *      sentAt <= received, status sent/delivered/replied. Requiring
 *      `rfc822MessageId = null` here stops unrelated thread replies (with a
 *      different subject) from being mislinked to modern Gmail sends.
 *   4. If nothing matches, skip — don't create unlinked noise.
 *
 * Idempotent: skips if an InboundReply already exists for this providerMessageId.
 */

/**
 * Strip leading reply/forward markers (repeatedly) to recover the subject
 * we originally sent: "RE: RE: Fwd: Hello" → "Hello". Mirrors the prefix
 * set used by the looks-like-reply gate. Pure — exported for unit tests.
 */
export function stripReplyPrefixes(subject: string | null | undefined): string {
  const s = (subject ?? "").trim();
  return s
    .replace(/^((re|sv|aw|antw|wg|tr|fwd|fw|回复)\s*:\s*)+/i, "")
    .trim();
}

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
  /** RFC 5322 In-Reply-To header. Null when the provider didn't expose headers. */
  inReplyToHeader: string | null;
}): Promise<{ created: boolean; replyId?: string }> {
  const inReplyTo = input.inReplyToHeader?.trim() || null;
  const hasInReplyTo = inReplyTo !== null && inReplyTo.length > 0;
  // Subject-line reply signal. Covers most common languages and clients:
  // "Re:" / "RE:" (English), "Sv:" (Scandinavian), "Aw:" / "Antw:" / "Wg:"
  // (German/Dutch), "Tr:" (French), "回复:" (Chinese), plus forwards
  // ("Fwd:" / "Fw:"). Used as a fallback when the provider didn't include
  // the In-Reply-To header — notably Microsoft Graph's list-messages
  // endpoint returns internetMessageHeaders empty even when $select'd.
  const subject = (input.subject ?? "").trim();
  const looksLikeReplyBySubject =
    /^(re|sv|aw|antw|wg|tr|fwd|fw)\s*:/i.test(subject) ||
    /^回复\s*:/.test(subject);

  if (!hasInReplyTo && !looksLikeReplyBySubject) {
    // No In-Reply-To header AND subject doesn't look like a reply/forward —
    // this is fresh inbox mail, never an outreach reply.
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

  // 1) Definitive (only when we actually have an In-Reply-To header):
  //    the reply's In-Reply-To equals the Message-ID we stamped on a
  //    specific outbound send. Globally unique within the client.
  let outbound = hasInReplyTo
    ? await prisma.outboundEmail.findFirst({
        where: {
          clientId: input.clientId,
          rfc822MessageId: inReplyTo,
        },
        orderBy: { sentAt: "desc" },
        select: { id: true, contactId: true, status: true },
      })
    : null;
  let matchMethod: "BY_THREAD_REF" | "BY_CONTACT_EMAIL" = "BY_THREAD_REF";

  // 2) Subject-anchored contact match. Stamped (Gmail) sends can miss the
  //    thread match for reasons outside our control — Gmail rewrites the
  //    outgoing Message-ID at send time, and some recipients' clients drop
  //    or mangle In-Reply-To — and the legacy fallback below deliberately
  //    excludes stamped sends. Without this leg a Gmail-sent outreach reply
  //    could NEVER link (observed in production: repliesLinked stayed 0 and
  //    a confirmed Train Hugger lead reply never appeared for staff).
  //    Anchoring on the reply's base subject (prefixes stripped) equalling
  //    the subject WE sent to that exact recipient from that mailbox keeps
  //    false positives out: an unrelated thread from the same contact has a
  //    different subject.
  if (!outbound && looksLikeReplyBySubject) {
    const baseSubject = stripReplyPrefixes(subject);
    if (baseSubject.length > 0) {
      outbound = await prisma.outboundEmail.findFirst({
        where: {
          clientId: input.clientId,
          mailboxIdentityId: input.mailboxIdentityId,
          toEmail: from,
          sentAt: { not: null, lte: input.receivedAt },
          status: { in: ["SENT", "DELIVERED", "REPLIED"] },
          subject: { equals: baseSubject, mode: "insensitive" },
        },
        orderBy: { sentAt: "desc" },
        select: { id: true, contactId: true, status: true },
      });
      matchMethod = "BY_CONTACT_EMAIL";
    }
  }

  // 3) Contact-email fallback: outbounds with no stamped Message-ID (legacy
  //    Gmail or any Microsoft Graph send — we don't stamp Graph yet). Same
  //    clientId + mailbox + recipient + sent-before-received + good status,
  //    restricted to rfc822MessageId = null so modern Gmail sends aren't
  //    loosely matched by an unrelated thread from the same contact (the
  //    subject-anchored leg above is the safe path for stamped sends).
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
