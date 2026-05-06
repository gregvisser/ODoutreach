import "server-only";

import { randomUUID } from "node:crypto";

import type { ClientMailboxIdentity, StaffUser } from "@/generated/prisma/client";
import {
  APPROVED_INTERNAL_PROOF_RECIPIENTS,
  INTERNAL_PROOF_CONFIRMATION_PHRASE,
  INTERNAL_PROOF_METADATA_KIND,
  isApprovedInternalProofRecipient,
} from "@/lib/mailboxes/internal-proof-send";
import { isMailboxRemovedFromWorkspace } from "@/lib/mailbox-workspace-removal";
import { prisma } from "@/lib/db";
import { extractDomainFromEmail, normalizeEmail } from "@/lib/normalize";
import {
  complianceMetadata,
  prepareContactSendCompliance,
} from "@/lib/unsubscribe/contact-send-compliance";
import { hashUnsubscribeToken } from "@/lib/unsubscribe/unsubscribe-token";
import { utcDateKeyForInstant } from "@/lib/sending-window";
import { evaluateSuppression } from "@/server/outreach/suppression-guard";
import { requireClientAccess } from "@/server/tenant/access";
import {
  humanizeGovernanceRejection,
  linkReservationToOutboundInTransaction,
  mailboxIneligibleForGovernedSendExecution,
  tryReserveSendSlotInTransaction,
} from "@/server/mailbox/sending-policy";
import { appendMailboxSignature } from "@/server/mailbox/mailbox-send-composition";
import { triggerOutboundQueueDrain } from "@/server/email/outbound/trigger-queue";

export type InternalProofSendResult =
  | {
      ok: true;
      outboundEmailId: string;
      correlationId: string;
      mailboxIdentityId: string;
      mailboxEmail: string;
      toEmail: string;
      subject: string;
      remainingForMailbox: number;
      message: string;
    }
  | { ok: false; error: string };

const SUBJECT_MAX = 300;
const BODY_MAX = 50_000;

export async function queueSelectedMailboxInternalProofSend(input: {
  staff: StaffUser;
  clientId: string;
  mailboxIdentityId: string;
  toEmail: string;
  subject: string;
  bodyText: string;
  confirmationPhrase: string;
}): Promise<InternalProofSendResult> {
  const { staff, clientId } = input;
  await requireClientAccess(staff, clientId);

  if (input.confirmationPhrase.trim() !== INTERNAL_PROOF_CONFIRMATION_PHRASE) {
    return {
      ok: false,
      error: `Type the exact confirmation phrase: ${INTERNAL_PROOF_CONFIRMATION_PHRASE}`,
    };
  }

  const to = normalizeEmail(input.toEmail);
  if (!isApprovedInternalProofRecipient(to)) {
    return {
      ok: false,
      error: `Recipient must be one of: ${APPROVED_INTERNAL_PROOF_RECIPIENTS.join(", ")}`,
    };
  }

  const subject = input.subject.trim();
  const bodyText = input.bodyText.trim();
  if (!subject) return { ok: false, error: "Subject is required." };
  if (subject.length > SUBJECT_MAX) {
    return { ok: false, error: `Subject is too long (max ${String(SUBJECT_MAX)} characters).` };
  }
  if (!bodyText) return { ok: false, error: "Body is required." };
  if (bodyText.length > BODY_MAX) {
    return { ok: false, error: `Body is too long (max ${String(BODY_MAX)} characters).` };
  }

  const [client, mailbox] = await Promise.all([
    prisma.client.findFirst({
      where: { id: clientId },
      select: { id: true, defaultSenderEmail: true },
    }),
    prisma.clientMailboxIdentity.findFirst({
      where: { id: input.mailboxIdentityId, clientId },
    }),
  ]);
  if (!client) return { ok: false, error: "Workspace not found." };
  if (!mailbox) return { ok: false, error: "Selected mailbox is not in this workspace." };

  const ineligible = mailboxIneligibleForGovernedSendExecution(mailbox);
  if (ineligible) {
    return {
      ok: false,
      error: humanizeGovernanceRejection(ineligible, mailbox),
    };
  }

  const bodyWithSignature = appendMailboxSignature({ bodyText, mailbox });
  if (!bodyWithSignature) {
    return {
      ok: false,
      error: `Selected mailbox ${mailbox.email} needs a sender signature before proof send.`,
    };
  }

  const decision = await evaluateSuppression(clientId, to);
  if (decision.suppressed) {
    return {
      ok: false,
      error: "This approved proof recipient is currently suppressed for this workspace.",
    };
  }

  const compliance = prepareContactSendCompliance({
    bodyText: bodyWithSignature,
    clientDefaultSenderEmail: client.defaultSenderEmail ?? mailbox.email,
  });
  const metaHeaders = complianceMetadata(compliance);
  const metadata = {
    kind: INTERNAL_PROOF_METADATA_KIND,
    selectedMailboxIdentityId: mailbox.id,
    selectedMailboxEmail: normalizeEmail(mailbox.email),
    approvedRecipient: to,
    ...(metaHeaders ?? {}),
  };
  const toDomain = extractDomainFromEmail(to) || null;
  const idempotencyKey = `internalProof:${clientId}:${mailbox.id}:${randomUUID()}`;
  const at = new Date();
  const windowKey = utcDateKeyForInstant(at);

  const txResult = await prisma.$transaction(async (tx) => {
    const m = await tx.clientMailboxIdentity.findFirstOrThrow({
      where: { id: mailbox.id, clientId },
    });
    if (isMailboxRemovedFromWorkspace(m)) {
      return {
        kind: "reserve_fail" as const,
        error: humanizeGovernanceRejection("mailbox_removed_from_workspace", m),
      };
    }
    const executionReason = mailboxIneligibleForGovernedSendExecution(m);
    if (executionReason) {
      return {
        kind: "reserve_fail" as const,
        error: humanizeGovernanceRejection(executionReason, m),
      };
    }

    const reserve = await tryReserveSendSlotInTransaction(tx, {
      clientId,
      mailbox: m,
      idempotencyKey,
      at,
    });
    if (!reserve.ok) {
      return { kind: "reserve_fail" as const, error: reserve.error };
    }
    if ("alreadyQueued" in reserve && reserve.alreadyQueued) {
      const existing = await tx.outboundEmail.findFirstOrThrow({
        where: { id: reserve.outboundEmailId, clientId },
        select: { id: true, correlationId: true },
      });
      return { kind: "created" as const, id: existing.id, correlationId: existing.correlationId };
    }
    if (reserve.duplicate && reserve.outboundEmailId === null) {
      return {
        kind: "reserve_fail" as const,
        error: "Unable to reserve a fresh proof-send slot. Try again.",
      };
    }

    const created = await tx.outboundEmail.create({
      data: {
        clientId,
        contactId: null,
        staffUserId: staff.id,
        toEmail: to,
        toDomain,
        subject,
        bodySnapshot: compliance.finalBody,
        status: "QUEUED",
        fromAddress: normalizeEmail(m.email),
        mailboxIdentityId: m.id,
        queuedAt: new Date(),
        metadata: metadata as object,
      },
    });

    if (compliance.kind === "hosted") {
      await tx.unsubscribeToken.create({
        data: {
          tokenHash: hashUnsubscribeToken(compliance.rawToken),
          clientId,
          contactId: null,
          outboundEmailId: created.id,
          email: to,
          emailDomain: toDomain,
          purpose: "outreach_unsubscribe",
        },
      });
    }

    await linkReservationToOutboundInTransaction(tx, reserve.reservationId, created.id);
    await tx.auditLog.create({
      data: {
        staffUserId: staff.id,
        clientId,
        action: "CREATE",
        entityType: "OutboundEmail",
        entityId: created.id,
        metadata: {
          kind: INTERNAL_PROOF_METADATA_KIND,
          mailboxIdentityId: m.id,
          mailboxEmail: normalizeEmail(m.email),
          recipient: to,
          subject,
        },
      },
    });

    return {
      kind: "created" as const,
      id: created.id,
      correlationId: created.correlationId,
    };
  });

  if (txResult.kind === "reserve_fail") {
    return { ok: false, error: txResult.error };
  }

  await triggerOutboundQueueDrain();
  const bookedAfter = await prisma.mailboxSendReservation.count({
    where: {
      mailboxIdentityId: mailbox.id,
      windowKey,
      status: { in: ["RESERVED", "CONSUMED"] },
    },
  });
  const remainingForMailbox = Math.max(0, Math.max(1, mailbox.dailySendCap || 30) - bookedAfter);

  return {
    ok: true,
    outboundEmailId: txResult.id,
    correlationId: txResult.correlationId,
    mailboxIdentityId: mailbox.id,
    mailboxEmail: normalizeEmail(mailbox.email),
    toEmail: to,
    subject,
    remainingForMailbox,
    message: `Internal proof queued from ${normalizeEmail(mailbox.email)} to ${to}.`,
  };
}
