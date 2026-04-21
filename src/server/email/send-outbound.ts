import "server-only";

import { randomUUID } from "node:crypto";

import { prisma } from "@/lib/db";
import { extractDomainFromEmail, normalizeEmail } from "@/lib/normalize";
import { evaluateSuppression, type SuppressionDecision } from "@/server/outreach/suppression-guard";
import { requireClientAccess } from "@/server/tenant/access";
import type { StaffUser } from "@/generated/prisma/client";
import {
  buildContactSendIdempotencyKey,
  humanizeGovernanceRejection,
  linkReservationToOutboundInTransaction,
  loadGovernedSendingMailbox,
  tryReserveSendSlotInTransaction,
} from "@/server/mailbox/sending-policy";

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

  // PR F1: contact.email is nullable. Reject the send here — the send path
  // must never normalize or dispatch to a null email, even if the caller
  // somehow routed to a no-email contact.
  if (!contact.email) {
    return {
      ok: false,
      outcome: "failed",
      error:
        "Contact has no email address on file. Add an email before sending, or reach out via another channel.",
    };
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

  const defaultFrom =
    (await prisma.client.findUnique({
      where: { id: clientId },
      select: { defaultSenderEmail: true },
    }))?.defaultSenderEmail?.trim() ||
    process.env.DEFAULT_OUTBOUND_FROM?.trim() ||
    `noreply@opensdoors.local`;

  const idempotencyKey = buildContactSendIdempotencyKey(
    clientId,
    contactId,
    randomUUID(),
  );

  const governance = await loadGovernedSendingMailbox(clientId);

  if (governance.mode === "legacy") {
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
        fromAddress: defaultFrom,
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

  if (governance.mode === "ineligible") {
    return {
      ok: false,
      outcome: "failed",
      error: humanizeGovernanceRejection(
        governance.reason,
        governance.mailbox ?? null,
      ),
    };
  }

  const txResult = await prisma.$transaction(async (tx) => {
    const m = await tx.clientMailboxIdentity.findFirstOrThrow({
      where: { id: governance.mailbox.id, clientId },
    });
    const reserve = await tryReserveSendSlotInTransaction(tx, {
      clientId,
      mailbox: m,
      idempotencyKey,
      at: new Date(),
    });

    if (!reserve.ok) {
      return { kind: "reserve_fail" as const, error: reserve.error };
    }

    if ("alreadyQueued" in reserve && reserve.alreadyQueued) {
      const existing = await tx.outboundEmail.findFirstOrThrow({
        where: { id: reserve.outboundEmailId, clientId },
        select: { id: true, correlationId: true },
      });
      return { kind: "idempotent" as const, ...existing };
    }

    const fromAddress = normalizeEmail(m.email);
    const newOutboundData = {
      clientId,
      contactId,
      staffUserId: staff.id,
      toEmail: to,
      toDomain,
      subject,
      bodySnapshot: bodyText,
      status: "QUEUED" as const,
      fromAddress,
      mailboxIdentityId: m.id,
      queuedAt: new Date(),
    };

    if (reserve.duplicate) {
      if (reserve.outboundEmailId === null) {
        const created = await tx.outboundEmail.create({ data: newOutboundData });
        await linkReservationToOutboundInTransaction(tx, reserve.reservationId, created.id);
        return {
          kind: "created" as const,
          id: created.id,
          correlationId: created.correlationId,
        };
      }
      return {
        kind: "reserve_fail" as const,
        error: "Unable to link this send to a reservation. Try again.",
      };
    }

    const created = await tx.outboundEmail.create({ data: newOutboundData });
    await linkReservationToOutboundInTransaction(tx, reserve.reservationId, created.id);
    return {
      kind: "created" as const,
      id: created.id,
      correlationId: created.correlationId,
    };
  });

  if (txResult.kind === "reserve_fail") {
    return { ok: false, outcome: "failed", error: txResult.error };
  }

  await triggerOutboundQueueDrain();

  return {
    ok: true,
    outcome: "queued",
    outboundEmailId: txResult.id,
    correlationId: txResult.correlationId,
  };
}
