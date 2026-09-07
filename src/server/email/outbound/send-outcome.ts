import "server-only";
import type { OutboundEmail, Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { countBookedSendSlotsInUtcWindow, lockSendingMailboxInTransaction, recomputeMailboxLedgerCounterInTransaction, utcDateKeyForInstant, markReservationConsumedForOutboundInTransaction } from "@/server/mailbox/sending-policy";

import { mailboxDailySendCap, startOfNextUtcDay } from "@/lib/mailbox-identities";

export const UNCONFIRMED_SEND_MESSAGE = "Sending is unconfirmed. Do not resend this email; ask an administrator to check the sending mailbox and provider evidence.";
export function unconfirmedSend() { return { ok: false as const, error: UNCONFIRMED_SEND_MESSAGE }; }

/** One durable dispatch owner. A crash after this write must never become a blind retry. */
export async function beginOutboundDispatch(row: OutboundEmail, rfc822MessageId?: string) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "OutboundEmail" WHERE id = ${row.id} FOR UPDATE`;
    const current = await tx.outboundEmail.findFirst({ where: { id: row.id, status: "PROCESSING", providerMessageId: null, dispatchStartedAt: null, sendAttempt: row.sendAttempt, claimedAt: row.claimedAt } });
    if (!current) return false;
    const now = new Date();
    if (current.mailboxIdentityId) {
      const mailbox = await lockSendingMailboxInTransaction(tx, current.mailboxIdentityId, current.clientId);
      if (!mailbox) return false;
      const reservation = await tx.mailboxSendReservation.findUnique({ where: { outboundEmailId: current.id } });
      if (!reservation || reservation.clientId !== current.clientId || reservation.mailboxIdentityId !== mailbox.id || reservation.status !== "RESERVED") {
        // An inconsistent or consumed allowance is not permission to send again.
        return false;
      }
      const windowKey = utcDateKeyForInstant(now);
      const booked = await countBookedSendSlotsInUtcWindow(tx, mailbox.id, windowKey);
      const alreadyBookedToday = reservation.windowKey === windowKey;
      if (booked - (alreadyBookedToday ? 1 : 0) >= mailboxDailySendCap(mailbox.dailySendCap)) {
        const error = "This mailbox has no daily sending allowance left. This email stays queued for the next day.";
        await tx.outboundEmail.update({ where: { id: current.id }, data: { status: "QUEUED", nextRetryAt: startOfNextUtcDay(now), claimedAt: null, claimExpiresAt: null, providerIdempotencyKey: null, lastErrorCode: "MAILBOX_DAILY_CAP", lastErrorMessage: error } });
        return { ok: false as const, error };
      }
      if (!alreadyBookedToday) {
        await tx.mailboxSendReservation.update({ where: { id: reservation.id }, data: { windowKey } });
        await recomputeMailboxLedgerCounterInTransaction(tx, mailbox.id, now);
      }
    }
    const result = await tx.outboundEmail.updateMany({
      where: { id: row.id, status: "PROCESSING", providerMessageId: null, dispatchStartedAt: null, sendAttempt: row.sendAttempt, claimedAt: row.claimedAt },
      data: {
        dispatchStartedAt: now, claimExpiresAt: null, nextRetryAt: null,
        lastErrorCode: "SEND_OUTCOME_UNCONFIRMED", lastErrorMessage: UNCONFIRMED_SEND_MESSAGE,
        ...(rfc822MessageId ? { rfc822MessageId } : {}),
      },
    });
    return result.count === 1;
  });
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
