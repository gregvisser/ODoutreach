import "server-only";

import type { OutboundEmail } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { extractDomainFromEmail, normalizeEmail } from "@/lib/normalize";
import { evaluateSuppression } from "@/server/outreach/suppression-guard";
import { resolveValidatedSenderForClient } from "@/server/email/sender-identity";
import { getGoogleGmailAccessTokenForMailbox } from "@/server/mailbox/google-mailbox-access";
import {
  buildRfc5322PlainTextEmail,
  sendGmailUsersMessagesSend,
} from "@/server/mailbox/gmail-sendmail";
import { getMicrosoftGraphAccessTokenForMailbox } from "@/server/mailbox/microsoft-mailbox-access";
import { sendMicrosoftGraphSendMail } from "@/server/mailbox/microsoft-graph-sendmail";
import { getOutboundEmailProvider } from "../providers";
import {
  humanizeGovernanceRejection,
  mailboxIneligibleForGovernedSendExecution,
  markReservationConsumedForOutbound,
  markReservationReleasedForOutbound,
} from "@/server/mailbox/sending-policy";
import {
  computeNextRetryAt,
  isRetryableSendFailure,
  maxOutboundSendRetries,
} from "./retry-policy";

/**
 * PR N — pull the List-Unsubscribe header values that
 * `sendSequenceStepBatch` persisted into `OutboundEmail.metadata.headers`.
 *
 * The metadata shape is not enforced at the DB level (it is
 * `Json?`), so we defensively narrow each field and fall back to
 * `null` on any shape mismatch. Returns `null` when no compliance
 * headers are configured for this row.
 */
function readListUnsubscribeHeadersFromMetadata(
  metadata: unknown,
): { listUnsubscribe: string; listUnsubscribePost: string } | null {
  if (!metadata || typeof metadata !== "object") return null;
  const headers = (metadata as { headers?: unknown }).headers;
  if (!headers || typeof headers !== "object") return null;
  const lu = (headers as { listUnsubscribe?: unknown }).listUnsubscribe;
  const lup = (headers as { listUnsubscribePost?: unknown }).listUnsubscribePost;
  if (typeof lu !== "string" || typeof lup !== "string") return null;
  const luTrim = lu.trim();
  const lupTrim = lup.trim();
  if (!luTrim || !lupTrim) return null;
  if (/[\r\n]/.test(luTrim) || /[\r\n]/.test(lupTrim)) return null;
  return { listUnsubscribe: luTrim, listUnsubscribePost: lupTrim };
}

/**
 * Extract the hosted URL from an already-angle-bracketed
 * `List-Unsubscribe` value (`<https://...>`). Returns `null` if the
 * value is not wrapped or not an http(s) URL — Microsoft Graph's
 * extended-property workaround requires the URL form.
 */
function extractHostedListUnsubscribeUrl(listUnsubscribe: string): string | null {
  const m = listUnsubscribe.match(/^<(https?:\/\/[^>]+)>$/);
  return m ? m[1] : null;
}

/**
 * Executes provider send for PROCESSING rows. Idempotent if `providerMessageId` already set.
 * Uses conditional updates so duplicate worker invocations cannot double-apply SENT.
 */
export async function executeOutboundSend(outboundEmailId: string): Promise<{
  ok: boolean;
  error?: string;
}> {
  const row = await prisma.outboundEmail.findUnique({
    where: { id: outboundEmailId },
  });

  if (!row) {
    return { ok: false, error: "Outbound not found" };
  }

  if (row.providerMessageId) {
    return { ok: true };
  }

  if (row.status !== "PROCESSING") {
    return { ok: true };
  }

  const to = normalizeEmail(row.toEmail);
  const decision = await evaluateSuppression(row.clientId, to);
  if (decision.suppressed) {
    await prisma.outboundEmail.updateMany({
      where: { id: row.id, status: "PROCESSING", providerMessageId: null },
      data: {
        status: "BLOCKED_SUPPRESSION",
        suppressionSnapshot: decision as object,
        claimedAt: null,
        claimExpiresAt: null,
        providerIdempotencyKey: null,
        lastProviderEventType: "suppression_recheck_blocked",
        lastErrorMessage: "Recipient became suppressed before send completed",
        lastErrorCode: "SUPPRESSED",
      },
    });
    if (row.mailboxIdentityId) {
      await markReservationReleasedForOutbound(row.id);
    }
    return { ok: true };
  }

  if (!row.subject || !row.bodySnapshot) {
    await markFailed(row.id, "INVALID_PAYLOAD", "Missing subject or body snapshot");
    return { ok: false, error: "Invalid payload" };
  }

  if (row.mailboxIdentityId) {
    return await sendViaConnectedMailboxOrFail(row, to);
  }

  // Legacy / non-mailbox row: Resend or mock (see getOutboundEmailProvider).
  const client = await prisma.client.findUnique({
    where: { id: row.clientId },
    select: {
      defaultSenderEmail: true,
      senderIdentityStatus: true,
    },
  });

  if (!client) {
    await markFailed(row.id, "CLIENT_MISSING", "Client not found");
    return { ok: false, error: "Client not found" };
  }

  let resolvedFrom: string;
  try {
    const r = resolveValidatedSenderForClient({
      clientDefaultSenderEmail: client.defaultSenderEmail,
      clientSenderIdentityStatus: client.senderIdentityStatus,
      rowFromAddress: row.fromAddress,
    });
    resolvedFrom = r.from;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await markFailed(row.id, "SENDER_REJECTED", msg);
    return { ok: false, error: msg };
  }

  const idempotencyKey =
    row.providerIdempotencyKey?.trim() ??
    `osm_fallback_${row.id}_a${row.sendAttempt}`;

  const listUnsub = readListUnsubscribeHeadersFromMetadata(row.metadata);
  const providerExtraHeaders = listUnsub
    ? [
        { name: "List-Unsubscribe", value: listUnsub.listUnsubscribe },
        { name: "List-Unsubscribe-Post", value: listUnsub.listUnsubscribePost },
      ]
    : undefined;

  try {
    const provider = getOutboundEmailProvider();
    const result = await provider.send({
      correlationId: row.correlationId,
      from: row.fromAddress?.trim() ? row.fromAddress : resolvedFrom,
      to,
      subject: row.subject,
      bodyText: row.bodySnapshot,
      tag: row.clientId,
      idempotencyKey,
      extraHeaders: providerExtraHeaders,
    });

    if (result.ok === false) {
      return await handleSendFailure(
        row.id,
        row.retryCount,
        result.error,
        result.code,
        row.mailboxIdentityId,
      );
    }

    const updated = await prisma.outboundEmail.updateMany({
      where: {
        id: row.id,
        status: "PROCESSING",
        providerMessageId: null,
      },
      data: {
        status: "SENT",
        providerMessageId: result.providerMessageId,
        providerName: result.providerName,
        sentAt: new Date(),
        claimedAt: null,
        claimExpiresAt: null,
        nextRetryAt: null,
        lastErrorCode: null,
        lastErrorMessage: null,
        failureReason: null,
        metadata: result.raw as object | undefined,
        fromAddress: row.fromAddress?.trim() ? row.fromAddress : resolvedFrom,
        toDomain: extractDomainFromEmail(to) || row.toDomain,
      },
    });

    if (updated.count === 0) {
      return { ok: true };
    }

    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return await handleSendFailure(
      row.id,
      row.retryCount,
      msg,
      "EXCEPTION",
      row.mailboxIdentityId,
    );
  }
}

async function markFailed(id: string, code: string, message: string) {
  const row = await prisma.outboundEmail.findUnique({
    where: { id },
    select: { mailboxIdentityId: true },
  });
  await prisma.outboundEmail.updateMany({
    where: { id, status: "PROCESSING", providerMessageId: null },
    data: {
      status: "FAILED",
      claimedAt: null,
      claimExpiresAt: null,
      lastErrorCode: code,
      lastErrorMessage: message.slice(0, 2000),
      failureReason: message.slice(0, 2000),
    },
  });
  if (row?.mailboxIdentityId) {
    await markReservationReleasedForOutbound(id);
  }
}

async function handleSendFailure(
  id: string,
  retryCount: number,
  error: string,
  code: string | undefined,
  mailboxIdentityId: string | null,
): Promise<{ ok: false; error: string }> {
  const max = maxOutboundSendRetries();
  const retryable = isRetryableSendFailure(code, error);
  const next = retryCount + 1;

  if (retryable && next <= max) {
    const nextAt = computeNextRetryAt(retryCount);
    await prisma.outboundEmail.updateMany({
      where: { id, status: "PROCESSING", providerMessageId: null },
      data: {
        status: "QUEUED",
        retryCount: next,
        nextRetryAt: nextAt,
        claimedAt: null,
        claimExpiresAt: null,
        providerIdempotencyKey: null,
        lastErrorCode: code ?? "RETRYABLE",
        lastErrorMessage: error.slice(0, 2000),
        failureReason: error.slice(0, 2000),
        lastAttemptAt: new Date(),
      },
    });
    return { ok: false, error };
  }

  await prisma.outboundEmail.updateMany({
    where: { id, status: "PROCESSING", providerMessageId: null },
    data: {
      status: "FAILED",
      claimedAt: null,
      claimExpiresAt: null,
      providerIdempotencyKey: null,
      lastErrorCode: code ?? "FAILED",
      lastErrorMessage: error.slice(0, 2000),
      failureReason: error.slice(0, 2000),
    },
  });
  if (mailboxIdentityId) {
    await markReservationReleasedForOutbound(id);
  }
  return { ok: false, error };
}

async function sendViaConnectedMailboxOrFail(
  row: OutboundEmail,
  to: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!row.mailboxIdentityId) {
    return { ok: false, error: "Missing governed mailbox" };
  }
  const mailbox = await prisma.clientMailboxIdentity.findFirst({
    where: { id: row.mailboxIdentityId, clientId: row.clientId },
  });
  if (!mailbox) {
    await markFailed(row.id, "MAILBOX_MISSING", "Linked mailbox not found for this client");
    return { ok: false, error: "Linked mailbox not found" };
  }
  if (mailbox.workspaceRemovedAt) {
    await markFailed(
      row.id,
      "MAILBOX_REMOVED",
      "Mailbox was removed from the workspace before send completed",
    );
    return { ok: false, error: "Mailbox removed from workspace" };
  }

  const ineligible = mailboxIneligibleForGovernedSendExecution(mailbox);
  if (ineligible) {
    const msg = humanizeGovernanceRejection(ineligible, mailbox);
    await markFailed(row.id, ineligible, msg);
    return { ok: false, error: msg };
  }
  if (mailbox.provider === "GOOGLE") {
    const fromForLog = row.fromAddress?.trim() || normalizeEmail(mailbox.email);
    if (!fromForLog.includes("@")) {
      await markFailed(row.id, "INVALID_FROM", "Mailbox from address is invalid for send");
      return { ok: false, error: "Invalid mailbox from address" };
    }
    const subject = row.subject;
    const body = row.bodySnapshot;
    if (!subject?.trim() || !body) {
      await markFailed(row.id, "INVALID_PAYLOAD", "Missing subject or body snapshot");
      return { ok: false, error: "Invalid payload" };
    }
    const listUnsub = readListUnsubscribeHeadersFromMetadata(row.metadata);
    const gmailExtraHeaders = listUnsub
      ? [
          { name: "List-Unsubscribe", value: listUnsub.listUnsubscribe },
          { name: "List-Unsubscribe-Post", value: listUnsub.listUnsubscribePost },
        ]
      : undefined;
    try {
      const accessToken = await getGoogleGmailAccessTokenForMailbox(mailbox.id);
      const rfc = buildRfc5322PlainTextEmail({
        from: fromForLog,
        to,
        subject,
        bodyText: body,
        extraHeaders: gmailExtraHeaders,
      });
      const result = await sendGmailUsersMessagesSend({
        accessToken,
        rfc5322Message: rfc,
      });
      if (result.ok === false) {
        return await handleSendFailure(
          row.id,
          row.retryCount,
          result.error,
          result.code,
          row.mailboxIdentityId,
        );
      }
      const updated = await prisma.outboundEmail.updateMany({
        where: { id: row.id, status: "PROCESSING", providerMessageId: null },
        data: {
          status: "SENT",
          providerMessageId: result.providerMessageId,
          providerName: result.providerName,
          sentAt: new Date(),
          claimedAt: null,
          claimExpiresAt: null,
          nextRetryAt: null,
          lastErrorCode: null,
          lastErrorMessage: null,
          failureReason: null,
          fromAddress: fromForLog,
          toDomain: extractDomainFromEmail(to) || row.toDomain,
        },
      });
      if (updated.count === 0) {
        return { ok: true };
      }
      await markReservationConsumedForOutbound(row.id);
      return { ok: true };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return await handleSendFailure(
        row.id,
        row.retryCount,
        msg,
        "EXCEPTION",
        row.mailboxIdentityId,
      );
    }
  }
  if (mailbox.provider !== "MICROSOFT") {
    await markFailed(row.id, "PROVIDER", "Unknown mailbox provider for governed send");
    return { ok: false, error: "Unknown provider" };
  }

  const fromForLog = row.fromAddress?.trim() || normalizeEmail(mailbox.email);
  if (!fromForLog.includes("@")) {
    await markFailed(row.id, "INVALID_FROM", "Mailbox from address is invalid for send");
    return { ok: false, error: "Invalid mailbox from address" };
  }

  const subject = row.subject;
  const body = row.bodySnapshot;
  if (!subject?.trim() || !body) {
    await markFailed(row.id, "INVALID_PAYLOAD", "Missing subject or body snapshot");
    return { ok: false, error: "Invalid payload" };
  }

  const listUnsub = readListUnsubscribeHeadersFromMetadata(row.metadata);
  const graphListUnsubscribeUrl = listUnsub
    ? extractHostedListUnsubscribeUrl(listUnsub.listUnsubscribe)
    : null;

  try {
    const accessToken = await getMicrosoftGraphAccessTokenForMailbox(mailbox.id);
    const result = await sendMicrosoftGraphSendMail({
      accessToken,
      mailboxUserPrincipalName: mailbox.emailNormalized,
      to,
      subject,
      bodyText: body,
      correlationId: row.correlationId,
      options: graphListUnsubscribeUrl
        ? { listUnsubscribeUrl: graphListUnsubscribeUrl }
        : undefined,
    });
    if (result.ok === false) {
      return await handleSendFailure(
        row.id,
        row.retryCount,
        result.error,
        result.code,
        row.mailboxIdentityId,
      );
    }
    const updated = await prisma.outboundEmail.updateMany({
      where: { id: row.id, status: "PROCESSING", providerMessageId: null },
      data: {
        status: "SENT",
        providerMessageId: result.providerMessageId,
        providerName: result.providerName,
        sentAt: new Date(),
        claimedAt: null,
        claimExpiresAt: null,
        nextRetryAt: null,
        lastErrorCode: null,
        lastErrorMessage: null,
        failureReason: null,
        fromAddress: fromForLog,
        toDomain: extractDomainFromEmail(to) || row.toDomain,
      },
    });
    if (updated.count === 0) {
      return { ok: true };
    }
    await markReservationConsumedForOutbound(row.id);
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return await handleSendFailure(
      row.id,
      row.retryCount,
      msg,
      "EXCEPTION",
      row.mailboxIdentityId,
    );
  }
}
