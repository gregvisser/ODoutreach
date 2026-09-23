import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import {
  REPLY_STOPPED_FOLLOWUP_CODE,
  REPLY_STOPPED_FOLLOWUP_MESSAGE,
} from "@/lib/email-sequences/sequence-enrollment-send-hold";
import { markReservationReleasedForOutboundInTransaction } from "@/server/mailbox/sending-policy";

/**
 * PR #137 — when a linked reply is recorded for an outbound sequence email,
 * mark the matching `ClientEmailSequenceEnrollment` as COMPLETED so the
 * step-send planner and dispatcher will skip any future follow-up steps for
 * that enrolment.
 *
 * Why COMPLETED (not PAUSED):
 *   * `classifySequenceStepSendCandidate` already SKIPs COMPLETED enrolments
 *     at plan time (and the dispatcher re-runs that classifier per row, so
 *     pre-planned READY rows are also blocked).
 *   * COMPLETED is the existing "done — do not send more" semantic.
 *
 * Idempotency / safety:
 *   * Only flips enrolments whose current status is PENDING or PAUSED.
 *     EXCLUDED (operator suppression) and COMPLETED are never overwritten.
 *   * Only mutates enrolments matched via
 *     `OutboundEmail → ClientEmailSequenceStepSend → enrollmentId` so we
 *     never touch unrelated contacts or other clients' rows.
 *   * Repeated invocation does not flip an enrolment twice. It still holds
 *     any follow-up that is already queued for that enrolment.
 *   * A follow-up already saved as QUEUED or PROCESSING (dispatch not
 *     started) is marked failed and its mailbox reservation is released.
 *     A send that has already started is left alone.
 *   * No provider calls.
 */
export async function stopFollowUpsForLinkedReply(args: {
  clientId: string;
  outboundEmailId: string;
}, db: Prisma.TransactionClient = prisma): Promise<{ enrollmentsStopped: number; followUpsHeld: number }> {
  const { clientId, outboundEmailId } = args;
  if (!clientId || !outboundEmailId) return { enrollmentsStopped: 0, followUpsHeld: 0 };

  const stepSends = await db.clientEmailSequenceStepSend.findMany({
    where: {
      clientId,
      outboundEmailId,
    },
    select: {
      enrollmentId: true,
      enrollment: { select: { id: true, status: true, clientId: true } },
    },
  });

  if (stepSends.length === 0) return { enrollmentsStopped: 0, followUpsHeld: 0 };

  const enrollmentsToComplete = new Set<string>();
  const enrollmentsToHold = new Set<string>();
  for (const row of stepSends) {
    if (!row.enrollment) continue;
    if (row.enrollment.clientId !== clientId) continue;
    if (
      row.enrollment.status === "PENDING" ||
      row.enrollment.status === "PAUSED" ||
      row.enrollment.status === "COMPLETED" ||
      row.enrollment.status === "EXCLUDED"
    ) {
      enrollmentsToHold.add(row.enrollment.id);
    }
    if (
      row.enrollment.status === "PENDING" ||
      row.enrollment.status === "PAUSED"
    ) {
      enrollmentsToComplete.add(row.enrollment.id);
    }
  }

  if (enrollmentsToHold.size === 0) return { enrollmentsStopped: 0, followUpsHeld: 0 };

  let enrollmentsStopped = 0;
  if (enrollmentsToComplete.size > 0) {
    const result = await db.clientEmailSequenceEnrollment.updateMany({
      where: {
        id: { in: Array.from(enrollmentsToComplete) },
        clientId,
        status: { in: ["PENDING", "PAUSED"] },
      },
      data: {
        status: "COMPLETED",
        completedAt: new Date(),
      },
    });
    enrollmentsStopped = result.count;
  }

  const followUpsHeld = await holdQueuedFollowUpsForEnrollments(
    db,
    clientId,
    Array.from(enrollmentsToHold),
    outboundEmailId,
  );

  return { enrollmentsStopped, followUpsHeld };
}

/**
 * A follow-up can already be QUEUED (pacing, calendar, or the five-minute
 * worker) before the reply is ingested. Completing the enrolment stops the
 * planner from creating another one; it does not recall the row already
 * waiting. Hold those rows here, and again at dispatch if this write races
 * the worker. Never touch a send that has already started.
 */
async function holdQueuedFollowUpsForEnrollments(
  db: Prisma.TransactionClient,
  clientId: string,
  enrollmentIds: string[],
  repliedOutboundEmailId: string,
): Promise<number> {
  const siblings = await db.clientEmailSequenceStepSend.findMany({
    where: {
      clientId,
      enrollmentId: { in: enrollmentIds },
      outboundEmailId: { not: repliedOutboundEmailId },
      outboundEmail: {
        clientId,
        dispatchStartedAt: null,
        providerMessageId: null,
        status: { in: ["QUEUED", "PROCESSING"] },
      },
    },
    select: { outboundEmailId: true },
  });

  let held = 0;
  for (const sibling of siblings) {
    const queuedId = sibling.outboundEmailId;
    if (!queuedId || queuedId === repliedOutboundEmailId) continue;
    const updated = await db.outboundEmail.updateMany({
      where: {
        id: queuedId,
        clientId,
        dispatchStartedAt: null,
        providerMessageId: null,
        status: { in: ["QUEUED", "PROCESSING"] },
      },
      data: {
        status: "FAILED",
        claimedAt: null,
        claimExpiresAt: null,
        providerIdempotencyKey: null,
        nextRetryAt: null,
        lastErrorCode: REPLY_STOPPED_FOLLOWUP_CODE,
        lastErrorMessage: REPLY_STOPPED_FOLLOWUP_MESSAGE,
        failureReason: REPLY_STOPPED_FOLLOWUP_MESSAGE,
      },
    });
    if (updated.count === 0) continue;
    held += updated.count;
    await markReservationReleasedForOutboundInTransaction(db, queuedId);
  }
  return held;
}
