import "server-only";

import { prisma } from "@/lib/db";
import type { InboundMatchMethod } from "@/generated/prisma/enums";
import { isInternalMail } from "@/lib/inbox/internal-mail";
import { normalizeEmail } from "@/lib/normalize";
import { classifyInboundReplyQuietly } from "@/server/ai/classify-inbound-reply";
import { canApplyReplyMilestone } from "@/server/email/outbound/lifecycle";
import { resolveInternalDomainsForClient } from "@/server/inbox/internal-domains";
import { stopFollowUpsForLinkedReply } from "@/server/email-sequences/stop-follow-ups-on-reply";

/**
 * Inbound payload from ESP webhook or dev simulator.
 * `clientId` must come only from trusted routing (e.g. URL token), never from unverified body alone.
 */
export type InboundWebhookPayload = {
  fromEmail: string;
  toEmail?: string;
  subject?: string;
  snippet?: string;
  bodyPreview?: string;
  providerMessageId?: string;
  inReplyToProviderId?: string;
  receivedAt?: string;
};

export type IngestResult = {
  /**
   * The InboundReply id. Null ONLY when the message was skipped as internal
   * staff mail (`skipped: "internal_mail"`), where no reply row is created.
   */
  id: string | null;
  matchMethod: InboundMatchMethod;
  /**
   * Set when the message was NOT ingested as a new reply (M8 — bring this
   * legacy ESP-webhook path up to the same safety bar as mailbox sync):
   *   - "internal_mail": both ends are on a workspace-owned domain (F4), so it
   *     is internal staff mail, never a prospect reply — nothing is stored.
   *   - "duplicate": a reply with this providerMessageId already exists for the
   *     client (an ESP webhook replay), so the existing row is returned untouched.
   */
  skipped?: "internal_mail" | "duplicate";
};

/**
 * Matching rules (same-tenant only — `clientId` is authoritative):
 * 1. If `inReplyToProviderId` matches an `OutboundEmail.providerMessageId` for this client → BY_OUTBOUND_PROVIDER_ID
 * 2. Else if `fromEmail` matches a `Contact.email` for this client → BY_CONTACT_EMAIL
 * 3. Else → UNLINKED (still stored; never guess another tenant)
 */
export async function ingestInboundForClient(params: {
  clientId: string;
  payload: InboundWebhookPayload;
  ingestionSource: string;
}): Promise<IngestResult> {
  const { clientId, payload, ingestionSource } = params;

  const from = normalizeEmail(payload.fromEmail);
  const to = payload.toEmail ? normalizeEmail(payload.toEmail) : null;
  const providerMessageId = payload.providerMessageId?.trim() || null;
  const receivedAt = payload.receivedAt
    ? new Date(payload.receivedAt)
    : new Date();

  // M8 — apply the same two gates the mailbox-sync reply path enforces and
  // that this legacy ESP-webhook ingest previously skipped.
  //
  // 1) F4 internal-mail filter. A message whose sender AND recipient are both
  //    on a workspace-owned domain is internal staff mail, never a prospect
  //    reply — never store it, flip an outbound to REPLIED, or stop follow-ups.
  //    `resolveInternalDomainsForClient` returns [] when the filter is disabled
  //    (no-op / legacy behaviour), and `isInternalMail` is conservative: if
  //    either end is unknown or external it returns false, so a genuine reply
  //    is never dropped.
  const internalDomains = await resolveInternalDomainsForClient(clientId);
  if (isInternalMail({ fromEmail: from, toEmail: to, internalDomains })) {
    return { id: null, matchMethod: "UNLINKED", skipped: "internal_mail" };
  }

  // 2) Reply de-dup. An ESP retries its webhook on any timeout, so the same
  //    message can arrive several times. If a reply with this providerMessageId
  //    already exists for the client, return it untouched rather than creating a
  //    duplicate (which would double-count repliesLinked and re-run the REPLIED
  //    / stop-follow-ups side effects). Mirrors processSyncedMessageForReply.
  if (providerMessageId) {
    const dup = await prisma.inboundReply.findFirst({
      where: { clientId, providerMessageId },
      select: { id: true, matchMethod: true },
    });
    if (dup) {
      return { id: dup.id, matchMethod: dup.matchMethod, skipped: "duplicate" };
    }
  }

  let linkedOutboundEmailId: string | null = null;
  let contactId: string | null = null;
  let matchMethod: InboundMatchMethod = "UNLINKED";

  if (payload.inReplyToProviderId?.trim()) {
    const outbound = await prisma.outboundEmail.findFirst({
      where: {
        clientId,
        providerMessageId: payload.inReplyToProviderId.trim(),
      },
      select: { id: true, contactId: true },
    });
    if (outbound) {
      linkedOutboundEmailId = outbound.id;
      contactId = outbound.contactId;
      matchMethod = "BY_OUTBOUND_PROVIDER_ID";
    }
  }

  if (!contactId) {
    const contact = await prisma.contact.findFirst({
      where: { clientId, email: from },
      select: { id: true },
    });
    if (contact) {
      contactId = contact.id;
      if (matchMethod === "UNLINKED") {
        matchMethod = "BY_CONTACT_EMAIL";
      }
    }
  }

  if (linkedOutboundEmailId && matchMethod === "BY_CONTACT_EMAIL") {
    const ob = await prisma.outboundEmail.findFirst({
      where: { id: linkedOutboundEmailId, clientId },
      select: { contactId: true },
    });
    if (ob?.contactId) {
      contactId = ob.contactId;
    }
  }

  const row = await prisma.inboundReply.create({
    data: {
      clientId,
      contactId,
      linkedOutboundEmailId,
      fromEmail: from,
      toEmail: to,
      subject: payload.subject ?? null,
      snippet: payload.snippet ?? null,
      bodyPreview: payload.bodyPreview ?? null,
      receivedAt,
      providerMessageId,
      inReplyToProviderId: payload.inReplyToProviderId?.trim() ?? null,
      ingestionSource,
      matchMethod,
    },
  });

  if (linkedOutboundEmailId) {
    const ob = await prisma.outboundEmail.findFirst({
      where: { id: linkedOutboundEmailId, clientId },
      select: { id: true, status: true },
    });
    if (ob && canApplyReplyMilestone(ob.status)) {
      await prisma.outboundEmail.update({
        where: { id: ob.id },
        data: { status: "REPLIED" },
      });
    }
    // PR #137 — stop follow-ups for the matching sequence enrolment.
    await stopFollowUpsForLinkedReply({
      clientId,
      outboundEmailId: linkedOutboundEmailId,
    });
  }

  // Row 80 — label the reply for routing. Outside the `linkedOutboundEmailId`
  // branch deliberately: an UNLINKED reply is exactly the one nobody is
  // watching, so it is the one that most needs a label. Never throws.
  await classifyInboundReplyQuietly({ replyId: row.id });

  return { id: row.id, matchMethod };
}
