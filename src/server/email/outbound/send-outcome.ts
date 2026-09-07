import "server-only";
import type { OutboundEmail, Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { markReservationConsumedForOutboundInTransaction } from "@/server/mailbox/sending-policy";

export const UNCONFIRMED_SEND_MESSAGE = "Sending is unconfirmed. Do not resend this email; ask an administrator to check the sending mailbox and provider evidence.";
export function unconfirmedSend() { return { ok: false as const, error: UNCONFIRMED_SEND_MESSAGE }; }

/** One durable dispatch owner. A crash after this write must never become a blind retry. */
export async function beginOutboundDispatch(row: OutboundEmail, rfc822MessageId?: string) {
  const result = await prisma.outboundEmail.updateMany({
    where: { id: row.id, status: "PROCESSING", providerMessageId: null, dispatchStartedAt: null, sendAttempt: row.sendAttempt, claimedAt: row.claimedAt },
    data: {
      dispatchStartedAt: new Date(), claimExpiresAt: null, nextRetryAt: null,
      lastErrorCode: "SEND_OUTCOME_UNCONFIRMED", lastErrorMessage: UNCONFIRMED_SEND_MESSAGE,
      ...(rfc822MessageId ? { rfc822MessageId } : {}),
    },
  });
  return result.count === 1;
}

/** Sent state and mailbox allowance either commit together or remain held. */
export async function persistAcceptedOutbound(args: Prisma.OutboundEmailUpdateManyArgs) {
  return prisma.$transaction(async (tx) => {
    const updated = await tx.outboundEmail.updateMany(args);
    if (updated.count > 0 && typeof args.where?.id === "string") {
      await markReservationConsumedForOutboundInTransaction(tx, args.where.id);
    }
    return updated;
  });
}

/** Explicit rejection responses only. Timeouts, 5xx and unreadable success are ambiguous. */
export function providerDefinitelyRejected(code?: string) {
  return ["400", "401", "403", "404", "405", "413", "415", "422", "429"].includes(code ?? "");
}
