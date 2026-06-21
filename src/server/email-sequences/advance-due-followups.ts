import "server-only";

import type { ClientEmailTemplateCategory } from "@/generated/prisma/enums";
import { prisma } from "@/lib/db";
import {
  freshnessDaysToMs,
  resolveAutoFollowUpFreshnessDays,
} from "@/lib/email-sequences/auto-followup-window";
import { getSequenceStepSendConfirmationPhrase } from "@/lib/email-sequences/sequence-send-execution-constants";
import { previousCategoryFor } from "@/lib/email-sequences/sequence-send-execution-policy";

import { sendSequenceStepBatch } from "./send-introduction";
import { planSequenceStepSends } from "./step-sends";

/**
 * Automatic follow-up advancement (the missing scheduler).
 *
 * Operators launch the INTRODUCTION step; everything after that is meant
 * to "just flow" — each follow-up should send on its own once its delay
 * elapses (the product requirement: "the follow-up to also send after
 * the set days and hours"). Nothing previously did that — follow-ups
 * only sent when a human manually staged + launched each step.
 *
 * This runs from the every-5-minutes outbound cron. For every ACTIVE
 * client, APPROVED sequence, and follow-up step whose template is
 * APPROVED and whose prior step has actually sent, it:
 *
 *   1. Stages the follow-up step-send rows (idempotent planner upsert).
 *   2. Dispatches the DUE batch via the SAME dispatcher the manual
 *      "Launch follow-up" button uses (`sendSequenceStepBatch`).
 *
 * Safety — all guaranteed by the existing dispatcher, not re-implemented
 * here:
 *   - Delay guard: `sendSequenceStepBatch` only sends a row whose prior
 *     step is SENT for that enrolment AND whose `delayDays`/`delayHours`
 *     have elapsed since that send. Nothing fires early.
 *   - No double-send: SENT rows / rows already linked to an OutboundEmail
 *     are skipped, and OutboundEmail creation is idempotent — so running
 *     every 5 minutes is safe.
 *   - Suppression + daily mailbox caps + governance are re-checked at
 *     dispatch time.
 *   - A reply or a pause stops further follow-ups (PR #137 reply-stop +
 *     the classifier's PAUSED/EXCLUDED/COMPLETED skip).
 *   - The 10-day workspace cooldown still applies (same-sequence sends
 *     are excluded so a sequence never blocks its own follow-up).
 *
 * One bad step never aborts the rest — each (sequence × step) is wrapped
 * so a single failure is recorded and skipped.
 */

export type AdvanceFollowUpsResult = {
  clientsProcessed: number;
  sequencesProcessed: number;
  stepsProcessed: number;
  followUpsQueued: number;
  /** True when automation was paused by the kill-switch (no work done). */
  paused?: boolean;
  errors: string[];
};

/**
 * Kill-switch. Set SEQUENCE_FOLLOWUP_AUTOSEND to "off" / "false" / "0" in
 * Azure App Service config to instantly pause automatic follow-up sending
 * (e.g. during a mailbox-reconnect incident) without a code deploy. Unset
 * or any other value = enabled (the default behaviour). Manual "Send
 * follow-up now" from the UI is unaffected.
 */
function autoSendPaused(): boolean {
  const v = process.env.SEQUENCE_FOLLOWUP_AUTOSEND?.trim().toLowerCase();
  return v === "off" || v === "false" || v === "0" || v === "no";
}

export async function advanceDueSequenceFollowUps(opts?: {
  /** Restrict to one client (e.g. for a targeted re-run / test). */
  clientId?: string;
}): Promise<AdvanceFollowUpsResult> {
  const result: AdvanceFollowUpsResult = {
    clientsProcessed: 0,
    sequencesProcessed: 0,
    stepsProcessed: 0,
    followUpsQueued: 0,
    errors: [],
  };

  if (autoSendPaused()) {
    return { ...result, paused: true };
  }

  // Freshness window: only AUTO-send follow-ups that became due recently
  // (default 3 days, tunable via SEQUENCE_FOLLOWUP_AUTOSEND_MAX_OVERDUE_DAYS).
  // More-overdue follow-ups stay READY for a manual "Send now" so resuming
  // automation never blasts a backlog. The manual launch path is unbounded.
  const autoSendMaxOverdueMs = freshnessDaysToMs(
    resolveAutoFollowUpFreshnessDays(
      process.env.SEQUENCE_FOLLOWUP_AUTOSEND_MAX_OVERDUE_DAYS,
    ),
  );

  // System actor. An ADMIN has global client access, which satisfies the
  // dispatcher's `requireClientAccess` for every tenant and attributes
  // the automated send in the audit log. The sole-admin model means there
  // is always exactly one obvious actor.
  const actor = await prisma.staffUser.findFirst({
    where: { role: "ADMIN" },
    orderBy: { createdAt: "asc" },
  });
  if (!actor) {
    result.errors.push(
      "No ADMIN staff user available to run automated follow-ups.",
    );
    return result;
  }

  const clients = await prisma.client.findMany({
    where: {
      status: "ACTIVE",
      // F2: a soft-deleted workspace stops advancing follow-ups (read-side; no rows mutated).
      deletedAt: null,
      ...(opts?.clientId ? { id: opts.clientId } : {}),
    },
    select: { id: true },
  });

  for (const client of clients) {
    result.clientsProcessed += 1;

    const sequences = await prisma.clientEmailSequence.findMany({
      where: { clientId: client.id, status: "APPROVED" },
      select: {
        id: true,
        steps: {
          where: { category: { not: "INTRODUCTION" } },
          orderBy: { position: "asc" },
          select: {
            id: true,
            category: true,
            template: { select: { status: true } },
          },
        },
      },
    });

    for (const seq of sequences) {
      if (seq.steps.length === 0) continue;
      result.sequencesProcessed += 1;

      for (const step of seq.steps) {
        const category = step.category as ClientEmailTemplateCategory;

        // Skip steps whose template isn't approved — the dispatcher would
        // only mark every row blocked, so there is nothing to send.
        if (step.template?.status !== "APPROVED") continue;

        // Skip if the prior step has not sent for anyone — no enrolment
        // can possibly be due for this follow-up yet. Cheap guard that
        // avoids planning/dispatch churn on sequences still on the intro.
        const prevCategory = previousCategoryFor(category);
        if (prevCategory !== null) {
          const priorSentCount =
            await prisma.clientEmailSequenceStepSend.count({
              where: {
                clientId: client.id,
                sequenceId: seq.id,
                status: "SENT",
                step: { category: prevCategory },
              },
            });
          if (priorSentCount === 0) continue;
        }

        result.stepsProcessed += 1;

        try {
          // 1) Stage the follow-up rows (idempotent; never overwrites
          //    SENT/FAILED). This is the piece that was missing — without
          //    it the follow-up step has no rows to dispatch.
          await planSequenceStepSends({
            clientId: client.id,
            sequenceId: seq.id,
            stepId: step.id,
            staffUserId: actor.id,
          });

          // 2) Dispatch the due batch. The dispatcher's prior-step + delay
          //    guard means only recipients whose delay has elapsed send.
          const batch = await sendSequenceStepBatch({
            staff: actor,
            clientId: client.id,
            sequenceId: seq.id,
            category,
            confirmationPhrase: getSequenceStepSendConfirmationPhrase(category),
            autoSendMaxOverdueMs,
          });
          result.followUpsQueued += batch.counts.queued;
        } catch (e) {
          result.errors.push(
            `${client.id}/${seq.id}/${category}: ${
              e instanceof Error ? e.message : String(e)
            }`,
          );
          // continue — one failing step must not stop the rest
        }
      }
    }
  }

  return result;
}
