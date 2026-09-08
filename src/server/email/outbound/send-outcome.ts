import "server-only";
import type { OutboundEmail, Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { countBookedSendSlotsInUtcWindow, lockSendingMailboxInTransaction, recomputeMailboxLedgerCounterInTransaction, utcDateKeyForInstant, markReservationConsumedForOutboundInTransaction } from "@/server/mailbox/sending-policy";

import { mailboxDailySendCap, startOfNextUtcDay } from "@/lib/mailbox-identities";

import { effectiveDailyCap, isWarmupRampEnabled } from "@/lib/mailboxes/mailbox-warmup";
import { countMailboxSendingDays } from "@/server/mailbox/mailbox-sending-history";
import { INTERNAL_PROOF_METADATA_KIND } from "@/lib/mailboxes/internal-proof-send";
import { INBOUND_REPLY_METADATA_KIND } from "@/lib/inbox/inbound-reply-metadata";
import { isSendPacingEnabled, minuteOfDayUtc, sendSlotsForDay, sendsPermittedByNow } from "@/lib/mailboxes/send-pacing";

export const UNCONFIRMED_SEND_MESSAGE = "Sending is unconfirmed. Do not resend this email; ask an administrator to check the sending mailbox and provider evidence.";
export function unconfirmedSend() { return { ok: false as const, error: UNCONFIRMED_SEND_MESSAGE }; }

/** One durable dispatch owner. A crash after this write must never become a blind retry. */
export async function beginOutboundDispatch(row: OutboundEmail, rfc822MessageId?: string, reconcilingAcceptedSend = false) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "OutboundEmail" WHERE id = ${row.id} FOR UPDATE`;
    const current = await tx.outboundEmail.findFirst({ where: { id: row.id, status: "PROCESSING", providerMessageId: null, dispatchStartedAt: null, sendAttempt: row.sendAttempt, claimedAt: row.claimedAt } });
    if (!current) return false;
    let now = new Date();
    if (current.mailboxIdentityId) {
      const mailbox = await lockSendingMailboxInTransaction(tx, current.mailboxIdentityId, current.clientId);
      if (!mailbox) return false;
      now = new Date(); // Recheck the day after waiting for the mailbox lock.
      const reservation = await tx.mailboxSendReservation.findUnique({ where: { outboundEmailId: current.id } });
      if (!reservation || reservation.clientId !== current.clientId || reservation.mailboxIdentityId !== mailbox.id || reservation.status !== "RESERVED") {
        // An inconsistent or consumed allowance is not permission to send again.
        return false;
      }
      const windowKey = utcDateKeyForInstant(now);
      const booked = await countBookedSendSlotsInUtcWindow(tx, mailbox.id, windowKey);
      const alreadyBookedToday = reservation.windowKey === windowKey;
      // A positive provider lookup reconciles an existing send; it must not
      // request new allowance or move that send into a different day.
      const kind = current.metadata && typeof current.metadata === "object" && !Array.isArray(current.metadata)
        ? current.metadata.kind : undefined;
      // Human replies and internal tests share the hard daily cap, while
      // ordinary contact/sequence outreach also observes warm-up and pacing.
      const outreachExempt = kind === INBOUND_REPLY_METADATA_KIND || kind === INTERNAL_PROOF_METADATA_KIND || kind === "governedTestSend";
      const warmupApplies = !reconcilingAcceptedSend && isWarmupRampEnabled() && !outreachExempt;
      const hardCap = mailboxDailySendCap(mailbox.dailySendCap);
      const cap = warmupApplies ? effectiveDailyCap(mailbox, await countMailboxSendingDays(mailbox.id, tx, now)) : hardCap;
      const limitedByWarmup = cap < hardCap;
      if (!reconcilingAcceptedSend && booked - (alreadyBookedToday ? 1 : 0) >= cap) {
        const error = limitedByWarmup
          ? "This mailbox has used today's warm-up allowance. This email stays queued for the next day."
          : "This mailbox has no daily sending allowance left. This email stays queued for the next day.";
        await tx.outboundEmail.update({ where: { id: current.id }, data: { status: "QUEUED", nextRetryAt: startOfNextUtcDay(now), claimedAt: null, claimExpiresAt: null, providerIdempotencyKey: null, lastErrorCode: limitedByWarmup ? "MAILBOX_WARMUP_CAP" : "MAILBOX_DAILY_CAP", lastErrorMessage: error } });
        return { ok: false as const, error };
      }
      if (!reconcilingAcceptedSend && !outreachExempt && isSendPacingEnabled()) {
        const client = await tx.client.findUniqueOrThrow({ where: { id: current.clientId }, select: { sendBatchSize: true } });
        const pacing = { mailboxId: mailbox.id, dateKey: windowKey, dailyCap: cap, batchSize: client.sendBatchSize };
        const minute = minuteOfDayUtc(now);
        const dayStart = new Date(`${windowKey}T00:00:00Z`);
        const dayEnd = startOfNextUtcDay(now);
        // Pending reservations are not sends: counting all of them would hold
        // every prebooked message until the day's final batch. Count accepted
        // sends and fenced attempts under the same mailbox lock instead.
        const occupied = await tx.outboundEmail.count({ where: {
          clientId: current.clientId, mailboxIdentityId: mailbox.id,
          OR: [
            { sentAt: { gte: dayStart, lt: dayEnd } },
            { sentAt: null, dispatchStartedAt: { gte: dayStart, lt: dayEnd } },
          ],
        } });
        if (occupied >= sendsPermittedByNow({ ...pacing, nowMinuteOfDay: minute })) {
          const nextSlot = sendSlotsForDay(pacing).find((slot, index) => index >= occupied && slot > minute);
          const nextRetryAt = nextSlot === undefined ? dayEnd : new Date(dayStart.getTime() + nextSlot * 60_000);
          const error = "This email is waiting for the mailbox's next scheduled batch. It stays queued.";
          await tx.outboundEmail.update({ where: { id: current.id }, data: { status: "QUEUED", nextRetryAt, claimedAt: null, claimExpiresAt: null, providerIdempotencyKey: null, lastErrorCode: "MAILBOX_SEND_PACING", lastErrorMessage: error } });
          return { ok: false as const, error };
        }
      }
      if (!reconcilingAcceptedSend && !alreadyBookedToday) {
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
