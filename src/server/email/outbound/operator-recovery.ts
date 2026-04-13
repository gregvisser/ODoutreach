import "server-only";

import { prisma } from "@/lib/db";

/**
 * Releases PROCESSING rows whose claim expired and no provider id was recorded.
 * Scoped to accessible client ids — does not touch other tenants.
 */
export async function releaseStaleProcessingClaimsForScope(accessibleClientIds: string[]) {
  if (accessibleClientIds.length === 0) {
    return { count: 0 };
  }
  const now = new Date();
  return prisma.outboundEmail.updateMany({
    where: {
      clientId: { in: accessibleClientIds },
      status: "PROCESSING",
      providerMessageId: null,
      claimExpiresAt: { lt: now },
    },
    data: {
      status: "QUEUED",
      claimedAt: null,
      claimExpiresAt: null,
      providerIdempotencyKey: null,
      lastErrorCode: "STALE_CLAIM",
      lastErrorMessage:
        "Processing claim expired without provider message id — requeued for safe retry",
    },
  });
}

/**
 * Operator-initiated retry for FAILED rows that never received a provider message id.
 * This is NOT a second send for an already-accepted message — it re-enters the queue.
 */
export async function operatorRequeueFailedSend(outboundEmailId: string, clientId: string) {
  return prisma.outboundEmail.updateMany({
    where: {
      id: outboundEmailId,
      clientId,
      status: "FAILED",
      providerMessageId: null,
    },
    data: {
      status: "QUEUED",
      nextRetryAt: new Date(),
      claimedAt: null,
      claimExpiresAt: null,
      providerIdempotencyKey: null,
      lastErrorCode: "OPERATOR_REQUEUE",
      lastErrorMessage: "Manually requeued by operator (no provider id was stored)",
      failureReason: null,
      retryCount: 0,
    },
  });
}
