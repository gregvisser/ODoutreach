import "server-only";

import { prisma } from "@/lib/db";
import type { InboundMatchMethod } from "@/generated/prisma/enums";
import { normalizeEmail } from "@/lib/normalize";
import { canApplyReplyMilestone } from "@/server/email/outbound/lifecycle";

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
  id: string;
  matchMethod: InboundMatchMethod;
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
  const receivedAt = payload.receivedAt
    ? new Date(payload.receivedAt)
    : new Date();

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
      toEmail: payload.toEmail ? normalizeEmail(payload.toEmail) : null,
      subject: payload.subject ?? null,
      snippet: payload.snippet ?? null,
      bodyPreview: payload.bodyPreview ?? null,
      receivedAt,
      providerMessageId: payload.providerMessageId?.trim() ?? null,
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
  }

  return { id: row.id, matchMethod };
}
