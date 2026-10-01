import "server-only";
import { validateFollowUpScope } from "@/lib/email-sequences/followup-scope";
import { parseCampaignSchedulerSelection } from "@/lib/email-sequences/campaign-scheduler-selection";

import type { ClientEmailTemplateCategory } from "@/generated/prisma/enums";
import { sanitizeJobErrorText } from "@/lib/alerts/job-error-text";
import { prisma } from "@/lib/db";
import { isEmptyAdvanceStep } from "@/lib/email-sequences/advance-step-skip";
import { logger } from "@/lib/logger";
import {
  freshnessDaysToMs,
  resolveAutoFollowUpFreshnessDays,
} from "@/lib/email-sequences/auto-followup-window";
import { getSequenceStepSendConfirmationPhrase } from "@/lib/email-sequences/sequence-send-execution-constants";
import { previousCategoryFor } from "@/lib/email-sequences/sequence-send-execution-policy";
import {
  aiCampaignSequenceHeldFromAutoSend,
  followUpSequenceIds,
  isAiCampaignsEnabled,
} from "@/lib/ai-campaigns/policy";
import { autonomousClientWhereFilter } from "@/lib/safety/autonomous-client-filter";
import { organisationFeaturePermits } from "@/lib/tenant/feature-gate";
import { resolveAutonomousRelayState } from "@/server/safety/autonomous-mode";

import { sendSequenceStepBatch, SequenceStepSendError } from "./send-introduction";
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
  /** Already-complete or empty steps. Logged, and not a failed run. */
  skippedSteps: string[];
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
  /** Optional finite campaign selection; requires an explicit client. */
  sequenceIds?: string[];
  /** Internal callback receives only IDs newly queued by this batch. */
  onQueued?: (clientId: string, outboundEmailIds: string[]) => Promise<void>;
}): Promise<AdvanceFollowUpsResult> {
  validateFollowUpScope(opts);
  const result: AdvanceFollowUpsResult = {
    clientsProcessed: 0,
    sequencesProcessed: 0,
    stepsProcessed: 0,
    followUpsQueued: 0,
    skippedSteps: [],
    errors: [],
  };

  // The older scheduled endpoints also call this function. A server selection
  // is a ceiling for all automatic advancement, not just the new timer.
  const selected = parseCampaignSchedulerSelection(process.env.CAMPAIGN_SCHEDULER_SELECTION);
  if (selected) {
    if (opts?.clientId && opts.clientId !== selected.clientId) return result;
    const sequenceIds = opts?.sequenceIds
      ? opts.sequenceIds.filter(id => selected.sequenceIds.includes(id))
      : selected.sequenceIds;
    if (sequenceIds.length === 0) return result;
    opts = { ...opts, clientId: selected.clientId, sequenceIds };
  }

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

  // The existing planner needs an active staff identity. This is operational
  // attribution only: queued emails have explicit automation provenance and
  // no human staffUserId, and still require the client's machine-send consent.
  const actor = await prisma.staffUser.findFirst({
    where: { role: "ADMIN", isActive: true },
    orderBy: { createdAt: "asc" },
  });
  if (!actor) {
    result.errors.push(
      "No ADMIN staff user available to run automated follow-ups.",
    );
    return result;
  }

  // The coding relay allowlist is an additional operational restriction.
  // Client consent below applies even when that relay is not running.
  const relayClientFilter = autonomousClientWhereFilter(resolveAutonomousRelayState());

  const aiRows = isAiCampaignsEnabled()
    ? await prisma.aiOutreachCampaign.findMany({
        where: {
          status: { in: ["RUNNING", "LAUNCHING"] },
          sequenceId: { not: null },
          ...(opts?.clientId ? { clientId: opts.clientId } : {}),
        },
        select: { clientId: true, sequenceId: true },
      })
    : [];
  const aiSequenceIdsByClient = new Map<string, string[]>();
  for (const row of aiRows) {
    if (!row.sequenceId) continue;
    const list = aiSequenceIdsByClient.get(row.clientId) ?? [];
    list.push(row.sequenceId);
    aiSequenceIdsByClient.set(row.clientId, list);
  }
  const aiClientIds = [...aiSequenceIdsByClient.keys()];
  const killSwitchOn = isAiCampaignsEnabled();
  const campaignRows = await prisma.aiOutreachCampaign.findMany({
    where: {
      sequenceId: { not: null },
      ...(opts?.clientId ? { clientId: opts.clientId } : {}),
    },
    select: { sequenceId: true, status: true },
  });
  const heldSequenceIds = new Set(
    campaignRows
      .filter(
        (row) =>
          row.sequenceId !== null &&
          aiCampaignSequenceHeldFromAutoSend({ killSwitchOn, status: row.status }),
      )
      .map((row) => row.sequenceId as string),
  );

  const clients = await prisma.client.findMany({
    where: {
      status: "ACTIVE",
      // F2: a soft-deleted workspace stops advancing follow-ups (read-side; no rows mutated).
      deletedAt: null,
      ...(opts?.clientId ? { id: opts.clientId } : {}),
      ...relayClientFilter,
      // Machine sending still advances every approved sequence. A client that
      // is not on Machine sending only advances sequences owned by a running
      // AI campaign, and only while AI_CAMPAIGNS_ENABLED is on.
      OR: [
        { autonomousSendEnabled: true },
        ...(aiClientIds.length > 0 ? [{ id: { in: aiClientIds } }] : []),
      ],
    },
    select: {
      id: true,
      autonomousSendEnabled: true,
      organisation: { select: { status: true, featureFlags: true } },
    },
  });

  for (const client of clients) {
    const followUpsOn =
      client.organisation == null
        ? true
        : organisationFeaturePermits(client.organisation, "followUps", true);
    if (!followUpsOn) continue;
    const machineCeiling =
      client.organisation == null
        ? true
        : organisationFeaturePermits(client.organisation, "machineSending", true);
    result.clientsProcessed += 1;
    const sequenceIds = followUpSequenceIds({
      machineSend: client.autonomousSendEnabled === true && machineCeiling,
      requestedSequenceIds: opts?.sequenceIds ?? null,
      aiRunningSequenceIds: aiSequenceIdsByClient.get(client.id) ?? [],
    });
    const visibleSequenceIds = sequenceIds
      ? sequenceIds.filter((id) => !heldSequenceIds.has(id))
      : null;
    if (visibleSequenceIds && visibleSequenceIds.length === 0) continue;

    const sequences = await prisma.clientEmailSequence.findMany({
      where: {
        clientId: client.id,
        status: "APPROVED",
        ...(visibleSequenceIds
          ? { id: { in: [...visibleSequenceIds] } }
          : heldSequenceIds.size > 0
            ? { id: { notIn: [...heldSequenceIds] } }
            : {}),
      },
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
            initiatedByAutomation: true,
          });
          result.followUpsQueued += batch.counts.queued;
          if (opts?.onQueued && batch.queued.length > 0) {
            await opts.onQueued(client.id, batch.queued.map(row => row.outboundEmailId));
          }
        } catch (e) {
          const code = e instanceof SequenceStepSendError ? e.code : undefined;
          const detail = sanitizeJobErrorText(
            e instanceof Error ? e.message : String(e),
          );
          const line = `${client.id}/${seq.id}/${category}: ${
            isEmptyAdvanceStep(code)
              ? "already complete or no ready recipients — skipped"
              : detail
          }`;
          if (isEmptyAdvanceStep(code)) {
            result.skippedSteps.push(line);
            logger.info({ event: "sequence_advance_skip", category }, line);
          } else {
            result.errors.push(line);
            logger.error({ event: "sequence_advance_error", category }, line);
          }
          // continue — one failing step must not stop the rest
        }
      }
    }
  }

  return result;
}
