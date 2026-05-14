import "server-only";

import { prisma } from "@/lib/db";

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
 *   * Repeated invocation for the same outbound is a no-op once the first
 *     reply has flipped the enrolment.
 *   * No emails sent, no provider calls, no queue work.
 */
export async function stopFollowUpsForLinkedReply(args: {
  clientId: string;
  outboundEmailId: string;
}): Promise<{ enrollmentsStopped: number }> {
  const { clientId, outboundEmailId } = args;
  if (!clientId || !outboundEmailId) return { enrollmentsStopped: 0 };

  const stepSends = await prisma.clientEmailSequenceStepSend.findMany({
    where: {
      clientId,
      outboundEmailId,
    },
    select: {
      enrollmentId: true,
      enrollment: { select: { id: true, status: true, clientId: true } },
    },
  });

  if (stepSends.length === 0) return { enrollmentsStopped: 0 };

  const targetEnrollmentIds = new Set<string>();
  for (const row of stepSends) {
    if (!row.enrollment) continue;
    if (row.enrollment.clientId !== clientId) continue;
    if (
      row.enrollment.status === "PENDING" ||
      row.enrollment.status === "PAUSED"
    ) {
      targetEnrollmentIds.add(row.enrollment.id);
    }
  }

  if (targetEnrollmentIds.size === 0) return { enrollmentsStopped: 0 };

  const result = await prisma.clientEmailSequenceEnrollment.updateMany({
    where: {
      id: { in: Array.from(targetEnrollmentIds) },
      clientId,
      status: { in: ["PENDING", "PAUSED"] },
    },
    data: {
      status: "COMPLETED",
      completedAt: new Date(),
    },
  });

  return { enrollmentsStopped: result.count };
}
