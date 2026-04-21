import "server-only";

import { randomUUID } from "node:crypto";

import { prisma } from "@/lib/db";
import {
  appendReplyOutboundId,
  buildReplySubject,
  mergeHandlingIntoMetadata,
  readHandlingStateFromMetadata,
} from "@/lib/inbox/inbound-message-handling";
import { extractDomainFromEmail, normalizeEmail } from "@/lib/normalize";
import { evaluateSuppression } from "@/server/outreach/suppression-guard";
import { getGoogleGmailAccessTokenForMailbox } from "@/server/mailbox/google-mailbox-access";
import {
  buildReplyRfc5322PlainTextEmail,
  sendGmailReply,
} from "@/server/mailbox/gmail-reply";
import { getMicrosoftGraphAccessTokenForMailbox } from "@/server/mailbox/microsoft-mailbox-access";
import { sendMicrosoftGraphReply } from "@/server/mailbox/microsoft-graph-reply";
import {
  humanizeGovernanceRejection,
  linkReservationToOutboundInTransaction,
  mailboxIneligibleForGovernedSendExecution,
  markReservationConsumedForOutbound,
  markReservationReleasedForOutbound,
  tryReserveSendSlotInTransaction,
} from "@/server/mailbox/sending-policy";
import { requireClientAccess } from "@/server/tenant/access";
import type { StaffUser } from "@/generated/prisma/client";

export const INBOUND_REPLY_METADATA_KIND = "inboundMailboxReply";
export const INBOUND_REPLY_SUBJECT_MAX = 300;
export const INBOUND_REPLY_BODY_MAX = 50_000;

export type ReplyToInboundMessageInput = {
  staff: StaffUser;
  clientId: string;
  inboundMessageId: string;
  /** Operator-authored body text. Subject is derived from the original message. */
  bodyText: string;
};

export type ReplyToInboundMessageResult =
  | {
      ok: true;
      outboundEmailId: string;
      correlationId: string;
      subject: string;
      providerMessageId: string;
      providerName: string;
    }
  | { ok: false; error: string; errorCode: string };

/**
 * Send an operator-authored reply to an ingested `InboundMailboxMessage`.
 *
 * Safety rules (in order):
 *   1. Tenant isolation via `requireClientAccess` and the `clientId` filter.
 *   2. Mailbox must be ACTIVE, CONNECTED, can send, sending-enabled.
 *   3. Recipient must not be in the client's suppression list.
 *   4. Ledger reservation acquired before the provider call (30/day cap).
 *   5. Provider replies via `/me/messages/{id}/reply` (Microsoft) or
 *      `users.messages.send` with `threadId` (Gmail) so the reply joins
 *      the original thread.
 *   6. On provider success: OutboundEmail marked `SENT`, reservation
 *      CONSUMED, and `InboundMailboxMessage.metadata.handling` updated
 *      with `handledAt`, `handledByStaffUserId`, `lastRepliedAt`, and
 *      the new OutboundEmail id.
 *   7. On provider failure: OutboundEmail marked `FAILED`, reservation
 *      RELEASED, no handling mutation.
 */
export async function replyToInboundMailboxMessage(
  input: ReplyToInboundMessageInput,
): Promise<ReplyToInboundMessageResult> {
  const { staff, clientId, inboundMessageId } = input;
  await requireClientAccess(staff, clientId);

  const body = input.bodyText.trim();
  if (!body) {
    return {
      ok: false,
      errorCode: "BODY_REQUIRED",
      error: "Reply body is required.",
    };
  }
  if (body.length > INBOUND_REPLY_BODY_MAX) {
    return {
      ok: false,
      errorCode: "BODY_TOO_LONG",
      error: `Reply body is too long (max ${String(INBOUND_REPLY_BODY_MAX)} characters).`,
    };
  }

  const message = await prisma.inboundMailboxMessage.findFirst({
    where: { id: inboundMessageId, clientId },
  });
  if (!message) {
    return {
      ok: false,
      errorCode: "INBOUND_NOT_FOUND",
      error: "That inbound message is not part of this workspace.",
    };
  }

  if (!message.fromEmail || !message.fromEmail.includes("@")) {
    return {
      ok: false,
      errorCode: "INVALID_SENDER",
      error: "Original sender does not have a valid email address — cannot reply safely.",
    };
  }

  const mailbox = await prisma.clientMailboxIdentity.findFirst({
    where: { id: message.mailboxIdentityId, clientId },
  });
  if (!mailbox) {
    return {
      ok: false,
      errorCode: "MAILBOX_MISSING",
      error: "The mailbox that received this message is no longer connected.",
    };
  }
  const ineligible = mailboxIneligibleForGovernedSendExecution(mailbox);
  if (ineligible) {
    return {
      ok: false,
      errorCode: ineligible,
      error: humanizeGovernanceRejection(ineligible, mailbox),
    };
  }

  const to = normalizeEmail(message.fromEmail);
  const toDomain = extractDomainFromEmail(to) || null;
  const subject = clipSubject(buildReplySubject(message.subject));

  const decision = await evaluateSuppression(clientId, to);
  if (decision.suppressed) {
    return {
      ok: false,
      errorCode: "SUPPRESSED_RECIPIENT",
      error: `Recipient ${to} is on this workspace's suppression list. Clear the suppression before replying.`,
    };
  }

  const idempotencyKey = `inboundReply:${clientId}:${inboundMessageId}:${randomUUID()}`;
  const fromAddress = normalizeEmail(mailbox.email);

  // Reservation + queued OutboundEmail — kept in one transaction so a
  // concurrent send can never book this ledger slot twice.
  type ReserveOutcome =
    | {
        kind: "created";
        outboundEmailId: string;
        correlationId: string;
      }
    | { kind: "reserve_fail"; error: string; errorCode: string };

  const reserveResult = await prisma.$transaction(
    async (tx): Promise<ReserveOutcome> => {
      const freshMailbox = await tx.clientMailboxIdentity.findFirstOrThrow({
        where: { id: mailbox.id, clientId },
      });
      const reserve = await tryReserveSendSlotInTransaction(tx, {
        clientId,
        mailbox: freshMailbox,
        idempotencyKey,
        at: new Date(),
      });
      if (!reserve.ok) {
        return {
          kind: "reserve_fail",
          error: reserve.error,
          errorCode: reserve.errorCode,
        };
      }
      if ("alreadyQueued" in reserve && reserve.alreadyQueued) {
        return {
          kind: "reserve_fail",
          error: "Duplicate reply attempt — refresh the page and try again.",
          errorCode: "IDEMPOTENCY_DUPLICATE",
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
          bodySnapshot: body,
          status: "PROCESSING",
          fromAddress,
          mailboxIdentityId: mailbox.id,
          queuedAt: new Date(),
          attemptedAt: new Date(),
          metadata: {
            kind: INBOUND_REPLY_METADATA_KIND,
            inboundMessageId,
            mailboxProvider: mailbox.provider,
            conversationId: message.conversationId ?? null,
          } as object,
        },
      });
      await linkReservationToOutboundInTransaction(
        tx,
        reserve.reservationId,
        created.id,
      );
      return {
        kind: "created",
        outboundEmailId: created.id,
        correlationId: created.correlationId,
      };
    },
    { maxWait: 10_000, timeout: 30_000 },
  );

  if (reserveResult.kind === "reserve_fail") {
    return {
      ok: false,
      error: reserveResult.error,
      errorCode: reserveResult.errorCode,
    };
  }

  const { outboundEmailId, correlationId } = reserveResult;

  // Provider dispatch (inline). Success → mark SENT + consume reservation
  // + update inbound handling. Failure → mark FAILED + release reservation.
  try {
    if (mailbox.provider === "MICROSOFT") {
      const accessToken = await getMicrosoftGraphAccessTokenForMailbox(
        mailbox.id,
      );
      const result = await sendMicrosoftGraphReply({
        accessToken,
        providerMessageId: message.providerMessageId,
        bodyText: body,
        correlationId,
      });
      if (!result.ok) {
        await markOutboundFailedAndReleaseReservation(
          outboundEmailId,
          result.error,
          result.code,
        );
        return {
          ok: false,
          errorCode: result.code ?? "PROVIDER_FAILED",
          error: result.error,
        };
      }
      await finaliseReplySent({
        inboundMessageId,
        outboundEmailId,
        providerMessageId: result.providerMessageId,
        providerName: result.providerName,
        staffUserId: staff.id,
      });
      return {
        ok: true,
        outboundEmailId,
        correlationId,
        subject,
        providerMessageId: result.providerMessageId,
        providerName: result.providerName,
      };
    }

    if (mailbox.provider === "GOOGLE") {
      const accessToken = await getGoogleGmailAccessTokenForMailbox(mailbox.id);
      const internetMessageId = readStringMeta(
        message.metadata,
        "internetMessageId",
      );
      const threadId =
        readStringMeta(message.metadata, "threadId") ??
        message.conversationId ??
        null;
      const rfc = buildReplyRfc5322PlainTextEmail({
        from: fromAddress,
        to,
        subject,
        bodyText: body,
        inReplyToMessageId: internetMessageId,
      });
      const result = await sendGmailReply({
        accessToken,
        rfc5322Message: rfc,
        threadId,
      });
      if (!result.ok) {
        await markOutboundFailedAndReleaseReservation(
          outboundEmailId,
          result.error,
          result.code,
        );
        return {
          ok: false,
          errorCode: result.code ?? "PROVIDER_FAILED",
          error: result.error,
        };
      }
      await finaliseReplySent({
        inboundMessageId,
        outboundEmailId,
        providerMessageId: result.providerMessageId,
        providerName: result.providerName,
        staffUserId: staff.id,
      });
      return {
        ok: true,
        outboundEmailId,
        correlationId,
        subject,
        providerMessageId: result.providerMessageId,
        providerName: result.providerName,
      };
    }

    await markOutboundFailedAndReleaseReservation(
      outboundEmailId,
      `Unsupported mailbox provider for reply: ${String(mailbox.provider)}`,
      "UNSUPPORTED_PROVIDER",
    );
    return {
      ok: false,
      errorCode: "UNSUPPORTED_PROVIDER",
      error: "Reply is only supported on Microsoft 365 and Google Workspace mailboxes.",
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await markOutboundFailedAndReleaseReservation(
      outboundEmailId,
      msg,
      "EXCEPTION",
    );
    return {
      ok: false,
      errorCode: "EXCEPTION",
      error: msg,
    };
  }
}

function clipSubject(subject: string): string {
  return subject.length > INBOUND_REPLY_SUBJECT_MAX
    ? subject.slice(0, INBOUND_REPLY_SUBJECT_MAX)
    : subject;
}

function readStringMeta(meta: unknown, key: string): string | null {
  if (
    meta !== null &&
    typeof meta === "object" &&
    !Array.isArray(meta) &&
    key in (meta as Record<string, unknown>)
  ) {
    const v = (meta as Record<string, unknown>)[key];
    return typeof v === "string" && v.length > 0 ? v : null;
  }
  return null;
}

async function markOutboundFailedAndReleaseReservation(
  outboundEmailId: string,
  error: string,
  code: string | undefined,
): Promise<void> {
  await prisma.outboundEmail.updateMany({
    where: { id: outboundEmailId, providerMessageId: null },
    data: {
      status: "FAILED",
      failureReason: error.slice(0, 2000),
      lastErrorCode: (code ?? "PROVIDER_FAILED").slice(0, 120),
      lastErrorMessage: error.slice(0, 2000),
    },
  });
  await markReservationReleasedForOutbound(outboundEmailId);
}

async function finaliseReplySent(input: {
  inboundMessageId: string;
  outboundEmailId: string;
  providerMessageId: string;
  providerName: string;
  staffUserId: string;
}): Promise<void> {
  const now = new Date();
  await prisma.outboundEmail.updateMany({
    where: {
      id: input.outboundEmailId,
      providerMessageId: null,
    },
    data: {
      status: "SENT",
      providerMessageId: input.providerMessageId,
      providerName: input.providerName,
      sentAt: now,
    },
  });
  await markReservationConsumedForOutbound(input.outboundEmailId);

  const existing = await prisma.inboundMailboxMessage.findUnique({
    where: { id: input.inboundMessageId },
    select: { metadata: true },
  });
  if (!existing) return;

  const current = readHandlingStateFromMetadata(existing.metadata);
  const nextState = appendReplyOutboundId(current, input.outboundEmailId);
  const iso = now.toISOString();
  const nextMetadata = mergeHandlingIntoMetadata(existing.metadata, {
    handledAt: current.handledAt ?? iso,
    handledByStaffUserId:
      current.handledByStaffUserId ?? input.staffUserId,
    lastRepliedAt: iso,
    replyOutboundEmailIds: nextState.replyOutboundEmailIds,
  });

  await prisma.inboundMailboxMessage.update({
    where: { id: input.inboundMessageId },
    data: { metadata: nextMetadata as object },
  });
}
