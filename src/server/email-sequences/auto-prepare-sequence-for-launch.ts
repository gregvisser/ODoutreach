import "server-only";

import { prisma } from "@/lib/db";
import { enrollSequenceContacts } from "@/server/email-sequences/enrollments";
import {
  approveSequence,
  markSequenceReadyForReview,
} from "@/server/email-sequences/mutations";
import { planSequenceStepSends } from "@/server/email-sequences/step-sends";

export type AutoPrepareSequenceResult = {
  /** Short human-readable fragments for a flash message (no secrets). */
  parts: string[];
};

function pushPart(parts: string[], msg: string) {
  if (msg.trim().length > 0) parts.push(msg.trim());
}

/**
 * After a sequence is saved with steps, advance it toward launch readiness
 * without sending email or queuing outbound mail:
 *   DRAFT → READY_FOR_REVIEW → APPROVED (when policy allows)
 *   enroll list members
 *   re-plan INTRODUCTION step-send rows (records only)
 *
 * Failures are swallowed per-step so the save still succeeds; messages
 * explain what succeeded vs what still needs attention.
 */
export async function autoPrepareSequenceForLaunch(input: {
  clientId: string;
  sequenceId: string;
  staffUserId: string;
}): Promise<AutoPrepareSequenceResult> {
  const parts: string[] = [];

  const introStep = await prisma.clientEmailSequenceStep.findFirst({
    where: { sequenceId: input.sequenceId, category: "INTRODUCTION" },
    select: { id: true },
  });
  if (!introStep) {
    return { parts };
  }

  let row = await prisma.clientEmailSequence.findUnique({
    where: { id: input.sequenceId },
    select: { id: true, clientId: true, status: true },
  });
  if (!row || row.clientId !== input.clientId || row.status === "ARCHIVED") {
    return { parts };
  }

  if (row.status === "DRAFT") {
    try {
      await markSequenceReadyForReview({
        sequenceId: input.sequenceId,
        clientId: input.clientId,
        staffUserId: input.staffUserId,
      });
      pushPart(parts, "Sequence checks passed");
    } catch (e) {
      pushPart(
        parts,
        e instanceof Error
          ? e.message
          : "Could not finish setup — fix the issues shown below, then save again.",
      );
      return { parts };
    }
  }

  row = await prisma.clientEmailSequence.findUnique({
    where: { id: input.sequenceId },
    select: { id: true, clientId: true, status: true },
  });
  if (!row || row.clientId !== input.clientId) return { parts };

  if (row.status === "READY_FOR_REVIEW") {
    try {
      await approveSequence({
        sequenceId: input.sequenceId,
        clientId: input.clientId,
        staffUserId: input.staffUserId,
      });
      pushPart(parts, "Ready to launch");
    } catch (e) {
      pushPart(
        parts,
        e instanceof Error
          ? e.message
          : "Could not activate for sending — fix the issues below, then save again.",
      );
      return { parts };
    }
  }

  try {
    const summary = await enrollSequenceContacts({
      sequenceId: input.sequenceId,
      clientId: input.clientId,
      staffUserId: input.staffUserId,
    });
    if (summary.inserted > 0) {
      pushPart(
        parts,
        summary.inserted === 1
          ? "1 recipient added to this sequence"
          : `${String(summary.inserted)} recipients added to this sequence`,
      );
    } else if (summary.totalEnrollments > 0) {
      pushPart(parts, "Recipients already prepared for this sequence");
    }
  } catch (e) {
    pushPart(
      parts,
      e instanceof Error
        ? e.message
        : "Recipients could not be prepared automatically — use Review recipients.",
    );
  }

  row = await prisma.clientEmailSequence.findUnique({
    where: { id: input.sequenceId },
    select: { id: true, status: true, clientId: true },
  });
  if (!row || row.clientId !== input.clientId || row.status !== "APPROVED") {
    return { parts };
  }

  const step = await prisma.clientEmailSequenceStep.findFirst({
    where: { sequenceId: input.sequenceId, category: "INTRODUCTION" },
    select: { id: true },
  });
  if (!step) return { parts };

  try {
    await planSequenceStepSends({
      clientId: input.clientId,
      sequenceId: input.sequenceId,
      stepId: step.id,
      staffUserId: input.staffUserId,
    });
    pushPart(parts, "Recipient readiness updated");
  } catch (e) {
    pushPart(
      parts,
      e instanceof Error
        ? e.message
        : "Could not refresh recipient readiness — tap Review recipients.",
    );
  }

  return { parts };
}
