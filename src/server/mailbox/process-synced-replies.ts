import "server-only";

import { prisma } from "@/lib/db";
import { emailDomain, isInternalMail } from "@/lib/inbox/internal-mail";
import { canonicalizeEmailForMatching, normalizeEmail } from "@/lib/normalize";
import { classifyInboundReplyQuietly } from "@/server/ai/classify-inbound-reply";
import { canApplyReplyMilestone } from "@/server/email/outbound/lifecycle";
import { stopFollowUpsForLinkedReply } from "@/server/email-sequences/stop-follow-ups-on-reply";
import { suppressReplyOptOut } from "@/server/mailbox/opt-out-detection";

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
 * Legs 2 and 3 compare the recipient CANONICALLY (`canonicalizeEmailForMatching`
 * in @/lib/normalize), not by a literal `toEmail` equality in the database
 * query — row 100: Gmail drops a `+tag` alias when a human hits Reply, so a
 * send to `user+tag@domain` and a reply `From: user@domain` are the same
 * mailbox and must be candidates for the same match. Every other constraint
 * (client, mailbox identity, sentAt <= received, status, and leg 2's subject
 * equality) still narrows the query itself; only the recipient comparison
 * moved from SQL to an in-code canonical check on the narrowed result, so
 * fetching remains bounded and no existing safety constraint was dropped.
 *
 * Idempotent: skips if an InboundReply already exists for this providerMessageId.
 */

/**
 * Reply/forward prefixes real mail clients produce, in one place — row 102:
 * this used to be two independently-maintained regexes (this one, plus a
 * near-duplicate in the looks-like-reply gate below), and the drift between
 * them was itself the bug: a prefix added to one silently stayed missing from
 * the other. "Re"/"Sv"/"Aw"/"Antw"/"Wg"/"Tr"/"Fwd"/"Fw" (English/Scandinavian/
 * German-Dutch/French) plus "Res" (Spanish/Portuguese), "Odp" (Polish), "Vs"
 * (Scandinavian, distinct from "Sv"), a bare "R" (French Outlook), and 回复
 * (Chinese).
 */
const REPLY_FORWARD_PREFIX = /^((re|res|sv|vs|odp|aw|antw|wg|tr|fwd|fw|r|回复)\s*:\s*)+/i;

/**
 * Strip leading reply/forward markers (repeatedly) to recover the subject
 * we originally sent: "RE: RE: Fwd: Hello" → "Hello". Pure — exported for
 * unit tests.
 */
export function stripReplyPrefixes(subject: string | null | undefined): string {
  const s = (subject ?? "").trim();
  return s.replace(REPLY_FORWARD_PREFIX, "").trim();
}

export async function processSyncedMessageForReply(input: {
  clientId: string;
  mailboxIdentityId: string;
  providerMessageId: string;
  fromEmail: string;
  toEmail: string | null;
  subject: string | null;
  /**
   * The FULL message body when one was fetched, else null.
   *
   * Added 2026-08-24. Opt-out detection was reading `bodyPreview`, a ~240
   * character preview, while the full body sat unused in the caller — the
   * bounce path 65 lines earlier was already using it. An opt-out is a legal
   * obligation under PECR however it arrives, and "please remove me" is
   * usually the second or third paragraph, below any preview.
   */
  bodyText?: string | null;
  snippet: string | null;
  bodyPreview: string | null;
  receivedAt: Date;
  conversationId: string | null;
  /** RFC 5322 In-Reply-To header. Null when the provider didn't expose headers. */
  inReplyToHeader: string | null;
  /**
   * F4 — the workspace's own mailbox domains. When set, a message whose
   * sender AND recipient are both internal is never matched (internal staff
   * mail is not a prospect reply), and a thread-ref match from an internal
   * sender is rejected. Empty / omitted = filter off (legacy behaviour).
   */
  internalDomains?: readonly string[];
  /**
   * Audit M5/M6 — when true, the thread-ref (In-Reply-To) leg additionally
   * requires `toEmail == from` (sender is the contact we emailed), matching the
   * constraint the fallback legs already apply. Stops a forwarded / CC'd third
   * party on the thread from mis-linking to the prospect. Omitted = legacy
   * behaviour (thread-ref trusts In-Reply-To regardless of sender).
   */
  requireThreadRefSenderMatch?: boolean;
}): Promise<{ created: boolean; replyId?: string }> {
  const inReplyTo = input.inReplyToHeader?.trim() || null;
  const hasInReplyTo = inReplyTo !== null && inReplyTo.length > 0;
  // Subject-line reply signal — shares REPLY_FORWARD_PREFIX with
  // stripReplyPrefixes (row 102) so a prefix this gate doesn't recognise can
  // never leave the fix in stripReplyPrefixes unreachable: this gate runs
  // first, and a message it rejects never gets as far as leg 2's subject
  // match. Used as a fallback when the provider didn't include the
  // In-Reply-To header — notably Microsoft Graph's list-messages endpoint
  // returns internetMessageHeaders empty even when $select'd.
  const subject = (input.subject ?? "").trim();
  const looksLikeReplyBySubject = REPLY_FORWARD_PREFIX.test(subject);

  if (!hasInReplyTo && !looksLikeReplyBySubject) {
    // No In-Reply-To header AND subject doesn't look like a reply/forward —
    // this is fresh inbox mail, never an outreach reply.
    return { created: false };
  }

  // F4 — internal staff mail (both ends on a workspace domain) is never a
  // prospect reply. internalDomains is empty when the filter is disabled.
  const internalDomains = input.internalDomains ?? [];
  if (
    isInternalMail({
      fromEmail: input.fromEmail,
      toEmail: input.toEmail,
      internalDomains,
    })
  ) {
    return { created: false };
  }

  const from = normalizeEmail(input.fromEmail);
  const internalDomainSet = new Set(internalDomains.map((d) => d.toLowerCase()));
  const senderDomain = emailDomain(from);
  const senderIsInternal =
    senderDomain !== null && internalDomainSet.has(senderDomain);

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
  // F4 — a thread-ref match is only trustworthy when the reply comes from an
  // external party. An internal sender on the thread (a staff reply-all or
  // forward that still carries our Message-ID) must NOT be linked to the
  // prospect, even though the In-Reply-To matches our outbound.
  let outbound =
    hasInReplyTo && !senderIsInternal
      ? await prisma.outboundEmail.findFirst({
          where: {
            clientId: input.clientId,
            rfc822MessageId: inReplyTo,
            // M5/M6 — when enabled, also require the reply to come FROM the
            // address we emailed, so a forwarded/CC'd third party carrying our
            // Message-ID can't be attributed to the prospect.
            ...(input.requireThreadRefSenderMatch ? { toEmail: from } : {}),
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
      const candidates = await prisma.outboundEmail.findMany({
        where: {
          clientId: input.clientId,
          mailboxIdentityId: input.mailboxIdentityId,
          sentAt: { not: null, lte: input.receivedAt },
          status: { in: ["SENT", "DELIVERED", "REPLIED"] },
          subject: { equals: baseSubject, mode: "insensitive" },
        },
        orderBy: { sentAt: "desc" },
        select: { id: true, contactId: true, status: true, toEmail: true },
      });
      outbound =
        candidates.find(
          (c) => canonicalizeEmailForMatching(c.toEmail) === canonicalizeEmailForMatching(from),
        ) ?? null;
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
    const candidates = await prisma.outboundEmail.findMany({
      where: {
        clientId: input.clientId,
        mailboxIdentityId: input.mailboxIdentityId,
        sentAt: { not: null, lte: input.receivedAt },
        status: { in: ["SENT", "DELIVERED", "REPLIED"] },
        rfc822MessageId: null,
      },
      orderBy: { sentAt: "desc" },
      select: { id: true, contactId: true, status: true, toEmail: true },
    });
    outbound =
      candidates.find(
        (c) => canonicalizeEmailForMatching(c.toEmail) === canonicalizeEmailForMatching(from),
      ) ?? null;
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

  // H3 — if this matched reply explicitly demands to stop (opt-out / complaint),
  // suppress the sender for FUTURE campaigns too (stopping follow-ups only ends
  // THIS sequence). Flag-gated (`MAILBOX_COMPLAINT_DETECTION_ENABLED`); no-op
  // when off. The sender is a known contacted prospect (we matched their send),
  // and seed-allowlist addresses are exempt inside suppressRecipientForHardBounce.
  await suppressReplyOptOut({
    clientId: input.clientId,
    fromEmail: from,
    subject: input.subject,
    // Full body first. This is the compliance leg: reply MATCHING never reads
    // the body (headers and subject only), so only opt-out detection was
    // affected -- and it is the one with a legal obligation behind it.
    bodyText: input.bodyText ?? input.bodyPreview ?? input.snippet,
    contactId: outbound.contactId,
    outboundEmailId: outbound.id,
    receivedAt: input.receivedAt,
  });

  // Row 80 — label the reply so a "yes, happy to talk" is routed to a person
  // within minutes rather than sitting in a list. Runs LAST on purpose: every
  // guarantee above (the reply is stored, follow-ups are stopped, an opt-out is
  // suppressed) has already happened and cannot be affected by this. It never
  // throws, and the label is advisory — nothing here sends, suppresses or stops
  // anything on the strength of a model's opinion.
  await classifyInboundReplyQuietly({ replyId: reply.id });

  return { created: true, replyId: reply.id };
}
