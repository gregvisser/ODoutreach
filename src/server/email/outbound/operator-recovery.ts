import "server-only";

import { prisma } from "@/lib/db";
import { GENERIC_OUTBOUND_ONLY } from "./generic-outbound-filter";
import { mailboxDailySendCap } from "@/lib/mailbox-identities";
import {
  countBookedSendSlotsInUtcWindow,
  humanizeGovernanceRejection,
  lockSendingMailboxInTransaction,
  mailboxIneligibleForGovernedSendExecution,
  recomputeMailboxLedgerCounterInTransaction,
  utcDateKeyForInstant,
} from "@/server/mailbox/sending-policy";

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
export async function operatorRequeueFailedSend(outboundEmailId: string, clientId: string, expectedErrorCode?: "COMPANY_REVIEW"): Promise<{ count: number; error?: string }> {
  try {
    return await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "OutboundEmail" WHERE id = ${outboundEmailId} AND "clientId" = ${clientId} FOR UPDATE`;
      const where = {
        id: outboundEmailId,
        clientId,
        status: "FAILED" as const,
        ...(expectedErrorCode ? { lastErrorCode: expectedErrorCode } : {}),
        providerMessageId: null,
        dispatchStartedAt: null,
        AND: [GENERIC_OUTBOUND_ONLY],
      };
      const row = await tx.outboundEmail.findFirst({ where });
      if (!row) return { count: 0 };
      const client = await tx.client.findFirst({ where: { id: clientId, deletedAt: null, status: { notIn: ["PAUSED", "ARCHIVED"] } }, select: { id: true } });
      if (!client) return { count: 0, error: "This workspace is paused, archived or unavailable. The email was not requeued." };
      const now = new Date();
      if (row.mailboxIdentityId) {
        const mailbox = await lockSendingMailboxInTransaction(tx, row.mailboxIdentityId, clientId);
        if (!mailbox) return { count: 0, error: "The sending mailbox is no longer available in this workspace." };
        const reason = mailboxIneligibleForGovernedSendExecution(mailbox);
        if (reason) return { count: 0, error: humanizeGovernanceRejection(reason, mailbox) };
        const reservation = await tx.mailboxSendReservation.findUnique({ where: { outboundEmailId } });
        if (reservation && (reservation.clientId !== clientId || reservation.mailboxIdentityId !== mailbox.id || reservation.status === "CONSUMED")) {
          return { count: 0, error: "This email has conflicting or already-used allowance records. Review them before retrying." };
        }
        const windowKey = utcDateKeyForInstant(now);
        if (reservation?.status === "RESERVED" && reservation.windowKey !== windowKey) {
          return { count: 0, error: "This email still holds allowance from an earlier day. Review the old attempt before retrying." };
        }
        const alreadyReserved = reservation?.status === "RESERVED";
        const cap = mailboxDailySendCap(mailbox.dailySendCap);
        const booked = await countBookedSendSlotsInUtcWindow(tx, mailbox.id, windowKey);
        if (booked - (alreadyReserved ? 1 : 0) >= cap) {
          return { count: 0, error: "This mailbox has no daily sending allowance left. The email was not requeued; try again after the daily allowance resets." };
        }
        if (reservation && !alreadyReserved) {
          // Rebook this email's released allowance without deleting the record
          // or replacing its original identity and idempotency key.
          await tx.mailboxSendReservation.update({ where: { id: reservation.id }, data: { status: "RESERVED", windowKey } });
        } else if (!reservation) {
          await tx.mailboxSendReservation.create({ data: { clientId, mailboxIdentityId: mailbox.id, outboundEmailId, idempotencyKey: `operatorRetry:${row.id}:${row.sendAttempt + 1}`, windowKey, status: "RESERVED" } });
        }
        await recomputeMailboxLedgerCounterInTransaction(tx, mailbox.id, now);
      }
      const updated = await tx.outboundEmail.updateMany({ where, data: {
        status: "QUEUED", nextRetryAt: now, claimedAt: null, claimExpiresAt: null, providerIdempotencyKey: null,
        lastErrorCode: "OPERATOR_REQUEUE", lastErrorMessage: "Manually requeued after checking sending eligibility and reserving mailbox allowance", failureReason: null, retryCount: 0,
      } });
      if (updated.count !== 1) throw Error("Retry changed while reserving allowance");
      return updated;
    });
  } catch {
    // A commit acknowledgement may be lost. Do not claim the retry did not happen.
    return { count: 0, error: "Could not confirm the retry. Refresh this page before trying again." };
  }
}
