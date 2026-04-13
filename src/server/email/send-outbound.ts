import "server-only";

import { prisma } from "@/lib/db";
import { extractDomainFromEmail, normalizeEmail } from "@/lib/normalize";
import { evaluateSuppression, type SuppressionDecision } from "@/server/outreach/suppression-guard";
import { requireClientAccess } from "@/server/tenant/access";
import type { StaffUser } from "@/generated/prisma/client";

import { triggerOutboundQueueDrain } from "./outbound/trigger-queue";

export type SendToContactInput = {
  staff: StaffUser;
  clientId: string;
  contactId: string;
  subject: string;
  bodyText: string;
};

export type SendPipelineResult =
  | {
      ok: true;
      outcome: "queued";
      outboundEmailId: string;
      correlationId: string;
    }
  | {
      ok: true;
      outcome: "blocked_suppression";
      outboundEmailId: string;
      correlationId: string;
      decision: SuppressionDecision;
    }
  | {
      ok: false;
      outcome: "failed";
      outboundEmailId?: string;
      correlationId?: string;
      error: string;
    };

/**
 * Request-time pipeline: access → contact → suppression → persist QUEUED → async worker send.
 * Provider API is never called inline here.
 */
export async function sendEmailToContact(
  input: SendToContactInput,
): Promise<SendPipelineResult> {
  const { staff, clientId, contactId, subject, bodyText } = input;

  await requireClientAccess(staff, clientId);

  const contact = await prisma.contact.findFirst({
    where: { id: contactId, clientId },
  });

  if (!contact) {
    return { ok: false, outcome: "failed", error: "Contact not found in this workspace" };
  }

  const to = normalizeEmail(contact.email);
  const toDomain = extractDomainFromEmail(to) || contact.emailDomain || null;

  const decision = await evaluateSuppression(clientId, to);

  if (decision.suppressed) {
    const row = await prisma.outboundEmail.create({
      data: {
        clientId,
        contactId,
        staffUserId: staff.id,
        toEmail: to,
        toDomain,
        subject,
        bodySnapshot: bodyText,
        status: "BLOCKED_SUPPRESSION",
        suppressionSnapshot: decision as object,
        fromAddress: null,
      },
    });

    return {
      ok: true,
      outcome: "blocked_suppression",
      outboundEmailId: row.id,
      correlationId: row.correlationId,
      decision,
    };
  }

  const fromAddress =
    (await prisma.client.findUnique({
      where: { id: clientId },
      select: { defaultSenderEmail: true },
    }))?.defaultSenderEmail?.trim() ||
    process.env.DEFAULT_OUTBOUND_FROM?.trim() ||
    `noreply@opensdoors.local`;

  const row = await prisma.outboundEmail.create({
    data: {
      clientId,
      contactId,
      staffUserId: staff.id,
      toEmail: to,
      toDomain,
      subject,
      bodySnapshot: bodyText,
      status: "QUEUED",
      fromAddress,
      queuedAt: new Date(),
    },
  });

  await triggerOutboundQueueDrain();

  return {
    ok: true,
    outcome: "queued",
    outboundEmailId: row.id,
    correlationId: row.correlationId,
  };
}
