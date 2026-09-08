import "server-only";
import type { OutboundEmail, Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { countBookedSendSlotsInUtcWindow, lockSendingMailboxInTransaction, recomputeMailboxLedgerCounterInTransaction, markReservationConsumedForOutboundInTransaction } from "@/server/mailbox/sending-policy";

import { mailboxDailySendCap } from "@/lib/mailbox-identities";

import { effectiveDailyCap, isWarmupRampEnabled } from "@/lib/mailboxes/mailbox-warmup";
import { countCalendarSendingDays, loadClientSendingWindow } from "@/server/mailbox/client-sending-calendar";
import { nextSendingCalendarWindow, resolveSendingCalendarDay } from "@/lib/mailboxes/sending-calendar";
import { calendarSendSlotsForDay } from "@/lib/mailboxes/calendar-send-pacing";
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
      now = new Date(); // Resolve the day after waiting for the mailbox lock.
      const reservation = await tx.mailboxSendReservation.findUnique({ where: { outboundEmailId: current.id } });
      if (!reservation || reservation.clientId !== current.clientId || reservation.mailboxIdentityId !== mailbox.id || reservation.status !== "RESERVED") {
        // An inconsistent or consumed allowance is not permission to send again.
        return false;
      }
      // Provider-confirmed reconciliation records an existing send, so a
      // changed calendar must not require fresh eligibility or allowance.
      if (!reconcilingAcceptedSend) {
        const sendingWindow = await loadClientSendingWindow(current.clientId, now, tx);
        const windowKey = sendingWindow.key;
        const booked = await countBookedSendSlotsInUtcWindow(tx, mailbox.id, windowKey);
        const alreadyBookedToday = reservation.windowKey === windowKey;
        // A positive provider lookup reconciles an existing send; it must not
        // request new allowance or move that send into a different day.
        const kind = current.metadata && typeof current.metadata === "object" && !Array.isArray(current.metadata)
          ? current.metadata.kind : undefined;
        // Human replies and internal tests share the hard daily cap. Preserve their
        // exemption from outreach warm-up, calendar hours and pacing.
        const outreachExempt = kind === INBOUND_REPLY_METADATA_KIND || kind === INTERNAL_PROOF_METADATA_KIND || kind === "governedTestSend";
        const warmupApplies = isWarmupRampEnabled() && !outreachExempt;
        const hardCap = mailboxDailySendCap(mailbox.dailySendCap);
        const cap = warmupApplies ? effectiveDailyCap(mailbox, await countCalendarSendingDays(mailbox.id, now, tx)) : hardCap;
        const limitedByWarmup = cap < hardCap;
        if (!reconcilingAcceptedSend && booked - (alreadyBookedToday ? 1 : 0) >= cap) {
          const error = limitedByWarmup
            ? "This mailbox has used today's warm-up allowance. This email stays queued for the next day."
            : "This mailbox has no daily sending allowance left. This email stays queued for the next day.";
          await tx.outboundEmail.update({ where: { id: current.id }, data: { status: "QUEUED", nextRetryAt: sendingWindow.endsAt, claimedAt: null, claimExpiresAt: null, providerIdempotencyKey: null, lastErrorCode: limitedByWarmup ? "MAILBOX_WARMUP_CAP" : "MAILBOX_DAILY_CAP", lastErrorMessage: error } });
          return { ok: false as const, error };
        }
        const ordinaryOutreach = !outreachExempt;
        if (ordinaryOutreach && (sendingWindow.calendar || sendingWindow.pausedUntil)) {
          const day = sendingWindow.calendar ? resolveSendingCalendarDay(sendingWindow.calendar, now) : null;
          if (day && !day.ok) throw Error(day.error);
          const isOpen = !sendingWindow.pausedUntil && day?.ok && day.value.windows.some(window => +window.startsAt <= +now && +now < +window.endsAt);
          if (!isOpen) {
            const next = sendingWindow.calendar ? nextSendingCalendarWindow(sendingWindow.calendar, now) : null;
            if (next && !next.ok) throw Error(next.error);
            const nextRetryAt = sendingWindow.pausedUntil ?? new Date(Math.min(+sendingWindow.endsAt, next?.ok && next.value ? +next.value.startsAt : Infinity));
            const error = "This email is waiting for the client's sending hours. It stays queued.";
            await tx.outboundEmail.update({ where: { id: current.id }, data: { status: "QUEUED", nextRetryAt, claimedAt: null, claimExpiresAt: null, providerIdempotencyKey: null, lastErrorCode: "CLIENT_CALENDAR_CLOSED", lastErrorMessage: error } });
            return { ok: false as const, error };
          }
        }
        if (!outreachExempt && isSendPacingEnabled()) {
          const client = await tx.client.findUniqueOrThrow({ where: { id: current.clientId }, select: { sendBatchSize: true } });
          const pacing = { mailboxId: mailbox.id, dateKey: windowKey, dailyCap: cap, batchSize: client.sendBatchSize };
          const minute = minuteOfDayUtc(now);
          const dayStart = sendingWindow.startsAt;
          const dayEnd = sendingWindow.endsAt;
          const calendarSlots = sendingWindow.calendar ? calendarSendSlotsForDay(sendingWindow.calendar, { mailboxId: mailbox.id, at: now, dailyCap: cap, batchSize: client.sendBatchSize }) : null;
          if (calendarSlots && !calendarSlots.ok) throw Error(calendarSlots.error);
          const permitted = calendarSlots?.ok ? calendarSlots.slots.filter(slot => +slot <= +now).length : sendsPermittedByNow({ ...pacing, nowMinuteOfDay: minute });
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
          if (occupied >= permitted) {
            const slots = calendarSlots?.ok ? calendarSlots.slots : sendSlotsForDay(pacing).map(slot => new Date(+dayStart + slot * 60_000));
            const nextRetryAt = slots.find((slot, index) => index >= occupied && +slot > +now) ?? dayEnd;
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
