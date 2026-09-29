import "server-only";

import type { ClientEmailTemplateCategory } from "@/generated/prisma/enums";
import { sanitizeJobErrorText } from "@/lib/alerts/job-error-text";
import { prisma } from "@/lib/db";
import { isPacingAutoResumeRow } from "@/lib/email-sequences/pacing-auto-resume";
import { getSequenceStepSendConfirmationPhrase } from "@/lib/email-sequences/sequence-send-execution-constants";
import { logger } from "@/lib/logger";

import { sendSequenceStepBatch, SequenceStepSendError } from "./send-introduction";

/**
 * How many sequence steps one client tick will re-dispatch. The rest stay
 * READY and the next tick continues them. This bounds the cron, not the cap.
 */
const MAX_STEPS_PER_TICK = 25;

/** Fragments that identify a pacing hold, including copy from before resume. */
const PACING_REASON_FRAGMENTS = [
  "send pacing",
  "sending calendar",
  "sending window",
  "mailbox capacity",
  "at-a-time release",
  "gets its share",
  "shared capacity",
  "sends automatically",
  "will not send on its own",
  "launch this sequence again",
] as const;

export type ResumePacingHoldsResult = {
  stepsProcessed: number;
  resumedQueued: number;
  skippedSteps: string[];
  errors: string[];
};

/**
 * Continue sends a staff launch already deferred for pacing or capacity.
 *
 * This is not a new enrolment and it is not Machine follow-up advancement.
 * It does not require the client's machine-send switch: the launch was the
 * staff action, and the tick only retries rows still READY with a pacing hold.
 * Do-not-contact, suppression, unsubscribe, bounce, reply-stop, pause, and
 * a disconnected mailbox are not selected. The dispatcher re-checks those
 * gates again before anything is queued.
 */
export async function resumePacingHeldSends(input: {
  clientId: string;
}): Promise<ResumePacingHoldsResult> {
  const result: ResumePacingHoldsResult = {
    stepsProcessed: 0,
    resumedQueued: 0,
    skippedSteps: [],
    errors: [],
  };
  if (!input.clientId || input.clientId.length > 200) return result;

  const client = await prisma.client.findFirst({
    where: {
      id: input.clientId,
      deletedAt: null,
      status: { notIn: ["PAUSED", "ARCHIVED"] },
    },
    select: { id: true },
  });
  if (!client) return result;

  const actor = await prisma.staffUser.findFirst({
    where: { role: "ADMIN", isActive: true },
    orderBy: { createdAt: "asc" },
  });
  if (!actor) {
    result.errors.push("No ADMIN staff user available to resume pacing holds.");
    return result;
  }

  const rows = await prisma.clientEmailSequenceStepSend.findMany({
    where: {
      clientId: input.clientId,
      status: "READY",
      outboundEmailId: null,
      OR: PACING_REASON_FRAGMENTS.map((fragment) => ({
        blockedReason: { contains: fragment, mode: "insensitive" as const },
      })),
    },
    select: {
      sequenceId: true,
      stepId: true,
      status: true,
      blockedReason: true,
      outboundEmailId: true,
      step: { select: { category: true } },
    },
    orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
    take: 2000,
  });

  const steps = new Map<string, { sequenceId: string; category: ClientEmailTemplateCategory }>();
  for (const row of rows) {
    if (
      !isPacingAutoResumeRow({
        status: row.status,
        blockedReason: row.blockedReason,
        outboundEmailId: row.outboundEmailId,
      })
    ) {
      continue;
    }
    const category = row.step.category;
    const key = `${row.sequenceId}|${category}`;
    if (!steps.has(key)) {
      steps.set(key, { sequenceId: row.sequenceId, category });
    }
  }

  let processed = 0;
  for (const step of steps.values()) {
    if (processed >= MAX_STEPS_PER_TICK) break;
    processed += 1;
    result.stepsProcessed += 1;
    const label = `${input.clientId}/${step.sequenceId}/${step.category}`;
    try {
      const batch = await sendSequenceStepBatch({
        staff: actor,
        clientId: input.clientId,
        sequenceId: step.sequenceId,
        category: step.category,
        confirmationPhrase: getSequenceStepSendConfirmationPhrase(step.category),
      });
      result.resumedQueued += batch.counts.queued;
    } catch (error) {
      const code = error instanceof SequenceStepSendError ? error.code : undefined;
      const detail = sanitizeJobErrorText(
        error instanceof Error ? error.message : String(error),
      );
      if (code === "NO_READY_ROWS" || code === "NO_MAILBOX_POOL") {
        const line = `${label}: ${
          code === "NO_MAILBOX_POOL"
            ? "sending mailbox is not connected — left held"
            : "already complete or no ready recipients — skipped"
        }`;
        result.skippedSteps.push(line);
        logger.info({ event: "pacing_resume_skip", category: step.category }, line);
        continue;
      }
      const line = `${label}: ${detail}`;
      result.errors.push(line);
      logger.error({ event: "pacing_resume_error", category: step.category }, line);
    }
  }

  return result;
}
