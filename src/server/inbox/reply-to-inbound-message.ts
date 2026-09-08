import "server-only";

import { prisma } from "@/lib/db";
import { recordInboundMessageHandlingInTransaction } from "./persist-inbound-message";
import { buildReplySubject } from "@/lib/inbox/inbound-message-handling";
import { extractDomainFromEmail, normalizeEmail } from "@/lib/normalize";
import { releaseReplyClaims } from "@/server/inbox/reply-claim";
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
  markReservationConsumedForOutboundInTransaction,
  markReservationReleasedForOutboundInTransaction,
  tryReserveSendSlotInTransaction,
} from "@/server/mailbox/sending-policy";
import { requireClientAccess } from "@/server/tenant/access";
import type { Prisma, StaffUser } from "@/generated/prisma/client";
import { isReplyRequestId } from "@/lib/inbox/reply-attempt";
import { INBOUND_REPLY_METADATA_KIND } from "@/lib/inbox/inbound-reply-metadata";
import { beginOutboundDispatch } from "@/server/email/outbound/send-outcome";

export { INBOUND_REPLY_METADATA_KIND } from "@/lib/inbox/inbound-reply-metadata";
export const INBOUND_REPLY_SUBJECT_MAX = 300;
export const INBOUND_REPLY_BODY_MAX = 50_000;

function unconfirmedReply(): ReplyToInboundMessageResult {
  return {
    ok: false,
    errorCode: "REPLY_OUTCOME_UNCONFIRMED",
    error: "A reply to this message is still sending, or its result could not be confirmed. Please do not resend it: that could create a duplicate. Check the mailbox's Sent folder and ask your administrator to reconcile the result before trying again.",
  };
}

// Only explicit rejection responses permit a fresh send. Timeouts, server
// errors and malformed success responses cannot prove the provider did not send.
function isDefiniteRejection(code: string | undefined): boolean {
  return ["400", "401", "403", "404", "405", "413", "415", "422", "429"].includes(code ?? "");
}

export type ReplyToInboundMessageInput = {
  staff: StaffUser;
  clientId: string;
  inboundMessageId: string;
  /** Operator-authored body text. Subject is derived from the original message. */
  bodyText: string;
  /** Browser-generated identity retained until this attempt has a known result. */
  requestId: string;
};

export type ReplyToInboundMessageResult =
  | {
      ok: true;
      outboundEmailId: string;
      correlationId: string;
      subject: string;
      providerMessageId: string;
      providerName: string;
      replayed?: true;
    }
  | { ok: false; error: string; errorCode: string; safeToStartNewAttempt?: true };

async function savedReplyAttempt(
  db: Pick<Prisma.TransactionClient, "outboundEmail">,
  input: ReplyToInboundMessageInput,
): Promise<ReplyToInboundMessageResult | null> {
  const row = await db.outboundEmail.findFirst({
    where: {
      clientId: input.clientId,
      AND: [
        { metadata: { path: ["kind"], equals: INBOUND_REPLY_METADATA_KIND } },
        { metadata: { path: ["inboundMessageId"], equals: input.inboundMessageId } },
        { metadata: { path: ["replyRequestId"], equals: input.requestId } },
      ],
    },
  });
  if (!row) return null;
  if (row.bodySnapshot !== input.bodyText || row.staffUserId !== input.staff.id) {
    return { ok: false, errorCode: "REPLY_ATTEMPT_MISMATCH", error: "This reply attempt belongs to a different draft or staff member. Check the original reply before sending again." };
  }
  if (row.sentAt && row.providerMessageId && row.providerName) {
    return { ok: true, outboundEmailId: row.id, correlationId: row.correlationId, subject: row.subject ?? "", providerMessageId: row.providerMessageId, providerName: row.providerName, replayed: true };
  }
  if (row.status === "FAILED" && !row.providerMessageId && !row.sentAt) {
    return { ok: false, errorCode: row.lastErrorCode ?? "PROVIDER_FAILED", error: row.lastErrorMessage ?? "This reply was not sent. You can try again.", safeToStartNewAttempt: true };
  }
  return unconfirmedReply();
}

/**
 * Send an operator-authored reply to an ingested `InboundMailboxMessage`.
 *
 * Safety rules (in order):
 *   1. Tenant isolation via `requireClientAccess` and the `clientId` filter.
 *   2. Mailbox must be ACTIVE, CONNECTED, can send, sending-enabled.
 *   3. Recipient must not be in the client's suppression list.
 *   4. Ledger reservation acquired before the provider call (30/day cap).
 *   5. Provider replies via `/users/{mailbox}/messages/{id}/reply` (Microsoft) or
 *      `users.messages.send` with `threadId` (Gmail) so the reply joins
 *      the original thread.
 *   6. On provider success: OutboundEmail marked `SENT`, reservation
 *      CONSUMED, and `InboundMailboxMessage.metadata.handling` updated
 *      with `handledAt`, `handledByStaffUserId`, `lastRepliedAt`, and
 *      the new OutboundEmail id.
 *   7. Only a definite rejection (or failure before dispatch) marks FAILED
 *      and releases the reservation. Uncertain sends stay PROCESSING and
 *      block further replies to that message pending reconciliation.
 */
export async function replyToInboundMailboxMessage(
  input: ReplyToInboundMessageInput,
): Promise<ReplyToInboundMessageResult> {
  const { staff, clientId, inboundMessageId } = input;
  await requireClientAccess(staff, clientId);

  if (!isReplyRequestId(input.requestId)) {
    return { ok: false, errorCode: "REPLY_REQUEST_ID_REQUIRED", error: "Refresh this page before sending a reply." };
  }

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

  const attemptInput = { ...input, requestId: input.requestId.toLowerCase(), bodyText: body };
  // A replay is a read of the original outcome, not a new send. Return it even
  // if the mailbox was disconnected or the recipient suppressed afterward.
  const saved = await savedReplyAttempt(prisma, attemptInput);
  if (saved) return saved;

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
  if (mailbox.workspaceRemovedAt) {
    return {
      ok: false,
      errorCode: "MAILBOX_REMOVED_FROM_WORKSPACE",
      error:
        "This mailbox was removed from the workspace. Historical messages stay visible, but you cannot reply from it until the address is restored.",
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

  const idempotencyKey = `inboundReply:${clientId}:${inboundMessageId}:${attemptInput.requestId}`;
  const fromAddress = normalizeEmail(mailbox.email);

  // Reservation + queued OutboundEmail — kept in one transaction so a
  // concurrent send can never book this ledger slot twice.
  type ReserveOutcome =
    | {
        kind: "created";
        outboundEmailId: string;
        correlationId: string;
      }
    | { kind: "unconfirmed" }
    | { kind: "replay"; result: ReplyToInboundMessageResult }
    | { kind: "reserve_fail"; error: string; errorCode: string };

  const reserveResult = await prisma.$transaction(
    async (tx): Promise<ReserveOutcome> => {
      // Serialize competing replies on the received message. This lock is
      // separate from the advisory staff claim and held only while reserving.
      const locked = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM "InboundMailboxMessage"
        WHERE id = ${inboundMessageId} AND "clientId" = ${clientId} FOR UPDATE`;
      if (!locked.length) return { kind: "reserve_fail", errorCode: "INBOUND_NOT_FOUND", error: "That message is no longer available." };
      // Recheck after acquiring the lock: another request may have committed
      // while this one waited. This deduplication spans UTC ledger windows.
      const replay = await savedReplyAttempt(tx, attemptInput);
      if (replay) return { kind: "replay", result: replay };
      const unresolved = await tx.outboundEmail.findFirst({
        where: {
          // QUEUED can be a historical generic retry of an inline reply. It
          // remains held too; ignoring it here could create a fresh duplicate.
          clientId, status: { in: ["PROCESSING", "QUEUED"] },
          AND: [
            { metadata: { path: ["kind"], equals: INBOUND_REPLY_METADATA_KIND } },
            { metadata: { path: ["inboundMessageId"], equals: inboundMessageId } },
          ],
        },
        select: { id: true },
      });
      if (unresolved) return { kind: "unconfirmed" };
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
            replyRequestId: attemptInput.requestId,
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

  if (reserveResult.kind === "replay") return reserveResult.result;
  if (reserveResult.kind === "unconfirmed") return unconfirmedReply();
  if (reserveResult.kind === "reserve_fail") {
    return {
      ok: false,
      error: reserveResult.error,
      errorCode: reserveResult.errorCode,
    };
  }

  const { outboundEmailId, correlationId } = reserveResult;

  // Once dispatch starts, a thrown error cannot establish non-delivery.
  let dispatchStarted = false;
  try {
    if (mailbox.provider === "MICROSOFT") {
      const accessToken = await getMicrosoftGraphAccessTokenForMailbox(
        mailbox.id,
      );
      const held = await beginReplyDispatch(outboundEmailId);
      if (held) return held;
      dispatchStarted = true;
      const result = await sendMicrosoftGraphReply({
        accessToken,
        mailboxUserPrincipalName: mailbox.emailNormalized,
        providerMessageId: message.providerMessageId,
        bodyText: body,
        correlationId,
      });
      if (!result.ok) {
        if (!isDefiniteRejection(result.code)) return unconfirmedReply();
        await markOutboundFailedAndReleaseReservation(
          outboundEmailId,
          result.error,
          result.code,
        );
        return {
          ok: false,
          errorCode: result.code ?? "PROVIDER_FAILED",
          error: result.error,
          safeToStartNewAttempt: true,
        };
      }
      await finaliseReplySent({
        clientId,
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
      const held = await beginReplyDispatch(outboundEmailId);
      if (held) return held;
      dispatchStarted = true;
      const result = await sendGmailReply({
        accessToken,
        rfc5322Message: rfc,
        threadId,
      });
      if (!result.ok) {
        if (!isDefiniteRejection(result.code)) return unconfirmedReply();
        await markOutboundFailedAndReleaseReservation(
          outboundEmailId,
          result.error,
          result.code,
        );
        return {
          ok: false,
          errorCode: result.code ?? "PROVIDER_FAILED",
          error: result.error,
          safeToStartNewAttempt: true,
        };
      }
      await finaliseReplySent({
        clientId,
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
      safeToStartNewAttempt: true,
    };
  } catch (e) {
    if (dispatchStarted) return unconfirmedReply();
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
      safeToStartNewAttempt: true,
    };
  }
}

/** Recheck allowance after token retrieval, immediately before provider dispatch. */
async function beginReplyDispatch(outboundEmailId: string): Promise<ReplyToInboundMessageResult | null> {
  const row = await prisma.outboundEmail.findUniqueOrThrow({ where: { id: outboundEmailId } });
  const started = await beginOutboundDispatch(row);
  if (started === true) return null;
  if (started === false) return unconfirmedReply();
  // Replies must never fall into the generic background queue. This gate
  // proved no provider attempt began, so release the old booking atomically.
  const error = "This reply was not sent because the mailbox has no daily allowance left. Try again after its daily allowance resets.";
  const saved = await markOutboundFailedAndReleaseReservation(outboundEmailId, error, "MAILBOX_DAILY_CAP", "QUEUED");
  return saved ? { ok: false, errorCode: "MAILBOX_DAILY_CAP", error, safeToStartNewAttempt: true } : unconfirmedReply();
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
  expectedStatus: "PROCESSING" | "QUEUED" = "PROCESSING",
): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const failed = await tx.outboundEmail.updateMany({
      where: { id: outboundEmailId, providerMessageId: null, status: expectedStatus,
        ...(expectedStatus === "QUEUED" ? { dispatchStartedAt: null, lastErrorCode: "MAILBOX_DAILY_CAP" } : {}) },
      data: {
        status: "FAILED",
        failureReason: error.slice(0, 2000),
        lastErrorCode: (code ?? "PROVIDER_FAILED").slice(0, 120),
        lastErrorMessage: error.slice(0, 2000),
        dispatchStartedAt: null,
        nextRetryAt: null,
      },
    });
    if (failed.count) await markReservationReleasedForOutboundInTransaction(tx, outboundEmailId);
    return failed.count === 1;
  });
}

async function finaliseReplySent(input: {
  clientId: string;
  inboundMessageId: string;
  outboundEmailId: string;
  providerMessageId: string;
  providerName: string;
  staffUserId: string;
}): Promise<void> {
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    // Match reservation's lock order: message, outbound record, mailbox ledger.
    await tx.$queryRaw`SELECT id FROM "InboundMailboxMessage"
      WHERE id = ${input.inboundMessageId} AND "clientId" = ${input.clientId} FOR UPDATE`;
    const sent = await tx.outboundEmail.updateMany({
      where: {
        id: input.outboundEmailId,
        clientId: input.clientId,
        status: "PROCESSING",
        providerMessageId: null,
      },
      data: {
        status: "SENT",
        providerMessageId: input.providerMessageId,
        providerName: input.providerName,
        sentAt: now,
      },
    });
    if (sent.count !== 1) throw new Error("Reply status could not be finalised.");
    await markReservationConsumedForOutboundInTransaction(tx, input.outboundEmailId);
    const handling = await recordInboundMessageHandlingInTransaction(tx, { ...input, now });
    if (!handling) throw new Error("Reply message no longer exists.");
  }, { maxWait: 10_000, timeout: 30_000 });

  // The reply has left the building — the advisory "X is looking at this"
  // marker has done its job. Release it after durable bookkeeping commits.
  await releaseReplyClaims({
    clientId: input.clientId,
    subject: {
      subjectType: "INBOUND_MESSAGE",
      subjectId: input.inboundMessageId,
    },
  });
}
