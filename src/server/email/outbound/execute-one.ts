import "server-only";

import { prisma } from "@/lib/db";
import { extractDomainFromEmail, normalizeEmail } from "@/lib/normalize";
import { evaluateSuppression } from "@/server/outreach/suppression-guard";
import { resolveValidatedSenderForClient } from "@/server/email/sender-identity";

import { getOutboundEmailProvider } from "../providers";
import {
  computeNextRetryAt,
  isRetryableSendFailure,
  maxOutboundSendRetries,
} from "./retry-policy";

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
    return { ok: true };
  }

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

  if (!row.subject || !row.bodySnapshot) {
    await markFailed(row.id, "INVALID_PAYLOAD", "Missing subject or body snapshot");
    return { ok: false, error: "Invalid payload" };
  }

  const idempotencyKey =
    row.providerIdempotencyKey?.trim() ??
    `osm_fallback_${row.id}_a${row.sendAttempt}`;

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
    });

    if (result.ok === false) {
      return await handleSendFailure(row.id, row.retryCount, result.error, result.code);
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
    return await handleSendFailure(row.id, row.retryCount, msg, "EXCEPTION");
  }
}

async function markFailed(id: string, code: string, message: string) {
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
}

async function handleSendFailure(
  id: string,
  retryCount: number,
  error: string,
  code?: string,
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
  return { ok: false, error };
}
