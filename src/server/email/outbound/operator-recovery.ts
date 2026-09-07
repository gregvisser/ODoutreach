import "server-only";

import { prisma } from "@/lib/db";
import { GENERIC_OUTBOUND_ONLY } from "./generic-outbound-filter";

/**
 * Releases PROCESSING rows whose claim expired and no provider id was recorded.
 * Scoped to accessible client ids. Inline replies require their own recovery.
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
      dispatchStartedAt: null,
      claimExpiresAt: { lt: now },
      AND: [GENERIC_OUTBOUND_ONLY],
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
 * Mailbox replies never enter this generic queue; recover them from the message.
 */
export async function operatorRequeueFailedSend(outboundEmailId: string, clientId: string) {
  return prisma.outboundEmail.updateMany({
    where: {
      id: outboundEmailId,
      clientId,
      status: "FAILED",
      providerMessageId: null,
      dispatchStartedAt: null,
      AND: [GENERIC_OUTBOUND_ONLY],
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
