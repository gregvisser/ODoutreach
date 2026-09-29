import "server-only";

import { revalidatePath } from "next/cache";
import { after } from "next/server";

import {
  buildCampaignReviewInput,
  CAMPAIGN_REVIEW_PROMPT_VERSION,
  CAMPAIGN_REVIEW_SYSTEM_PROMPT,
  CAMPAIGN_REVIEW_TOOL,
  parseCampaignReviewToolUse,
  type CampaignReviewFinding,
  type CampaignReviewInput,
  type CampaignReviewStepInput,
} from "@/lib/ai/campaign-review";
import { AI_MODELS } from "@/lib/ai/model-catalog";
import { onDemandToolCallBudget } from "@/lib/ai/sequence-draft-timing";
import { prisma } from "@/lib/db";
import { TEMPLATE_CATEGORY_LABELS } from "@/lib/email-templates/template-policy";
import { logger } from "@/lib/logger";

import { resolveProductAiApiKey, resolveProductAiModel } from "./ai-provider";
import { callAiToolMessages } from "./anthropic-messages";
import {
  campaignReviewFailureMessage,
  campaignReviewSuccessMessage,
} from "./campaign-review-messages";
import { runMeteredAiCall } from "./metered-call";
import { sanitizeProviderErrorDetail } from "./provider-transport-error";

/**
 * Score and critique one campaign, and record what it cost.
 *
 * WHAT THIS FUNCTION CHANGES ABOUT THE CAMPAIGN: nothing. It reads a sequence
 * and writes one `AiCampaignReview` row. It does not touch the sequence, its
 * steps, its templates, their approval status, its enrollments, or anything the
 * send pipeline reads. That is the point of the feature and it is asserted by
 * test: a review is advice on a screen.
 *
 * In particular it does NOT feed the launch rail. `evaluateSequenceLaunchReadiness`
 * is deterministic and offline, and adding an AI check to it would be a bug in
 * both directions at once — as a blocker it would stop every launch in the
 * product while the API key is unset, and as a pass it would print a machine's
 * opinion next to the button that mails strangers.
 *
 * It also does not retry. A timed-out call may already have been served and
 * billed, so an automatic retry would charge the client twice.
 */

/** A score, a paragraph and a dozen short findings. Caps the output side. */
const MAX_OUTPUT_TOKENS = 2_000;

export type ReviewCampaignResult =
  | {
      readonly ok: true;
      readonly reviewId: string;
      readonly score: number;
      readonly summary: string;
      readonly findings: readonly CampaignReviewFinding[];
      readonly costMicroUsd: number;
    }
  | { readonly ok: false; readonly reason: string };

/**
 * Turn the stored per-step delays into days from launch.
 *
 * `ClientEmailSequenceStep.delayDays` is time after the PREVIOUS step; the
 * model is shown absolute days because "day 25" is what tells it whether a
 * closing email is too late. Day 1 is launch day, matching the drafting
 * cadence. Done in one named function for the same reason it is in
 * `sequence-drafting.ts`: treating the two as interchangeable is an error that
 * reads as correct.
 */
export function stepsToAbsoluteDays(
  delays: readonly number[],
): number[] {
  let running = 1;
  return delays.map((delay, index) => {
    if (index > 0) running += Number.isFinite(delay) ? delay : 0;
    return running;
  });
}

interface LoadedCampaign {
  readonly client: { readonly id: string; readonly slug: string };
  readonly campaign: CampaignReviewInput;
}

/** Read the sequence, its steps and the client brief the review needs. */
async function loadCampaign(args: {
  clientId: string;
  sequenceId: string;
}): Promise<LoadedCampaign | null | "no_steps"> {
  const sequence = await prisma.clientEmailSequence.findFirst({
    // Scoped by clientId as well as id: a review is billed to a client, so
    // reading a sequence that belongs to a different one would put another
    // tenant's copy on this client's invoice.
    where: { id: args.sequenceId, clientId: args.clientId },
    select: {
      id: true,
      name: true,
      client: {
        select: {
          id: true,
          slug: true,
          name: true,
          industry: true,
          deletedAt: true,
          briefTaxonomyLinks: {
            select: { term: { select: { kind: true, displayValue: true } } },
          },
        },
      },
      steps: {
        orderBy: { position: "asc" },
        select: {
          position: true,
          category: true,
          delayDays: true,
          template: { select: { subject: true, content: true } },
        },
      },
    },
  });

  if (!sequence || sequence.client.deletedAt !== null) return null;
  if (sequence.steps.length === 0) return "no_steps";

  const days = stepsToAbsoluteDays(sequence.steps.map((s) => s.delayDays));

  const steps: CampaignReviewStepInput[] = sequence.steps.map((step, index) => ({
    position: index,
    categoryLabel: TEMPLATE_CATEGORY_LABELS[step.category],
    absoluteDay: days[index],
    subject: step.template.subject,
    body: step.template.content,
  }));

  return {
    client: { id: sequence.client.id, slug: sequence.client.slug },
    campaign: {
      clientName: sequence.client.name,
      industry: sequence.client.industry,
      targetJobTitles: sequence.client.briefTaxonomyLinks
        .filter((link) => link.term.kind === "JOB_TITLE")
        .map((link) => link.term.displayValue),
      sequenceName: sequence.name,
      steps,
    },
  };
}

export async function reviewCampaign(args: {
  clientId: string;
  sequenceId: string;
  staffUserId: string;
}): Promise<ReviewCampaignResult> {
  const loaded = await loadCampaign(args);
  if (loaded === null) return { ok: false, reason: "sequence_not_found" };
  if (loaded === "no_steps") return { ok: false, reason: "no_steps" };

  const model = resolveProductAiModel(AI_MODELS.CAMPAIGN_REVIEW);
  const apiKey = resolveProductAiApiKey();
  const budget = onDemandToolCallBudget(model);

  const outcome = await runMeteredAiCall({
    client: loaded.client,
    feature: "CAMPAIGN_REVIEW",
    model,
    apiKey,
    subject: { type: "ClientEmailSequence", id: args.sequenceId },
    invoke: async () => {
      const response = await callAiToolMessages({
        apiKey: apiKey as string,
        workspaceId: process.env.ANTHROPIC_WORKSPACE_ID,
        model,
        system: CAMPAIGN_REVIEW_SYSTEM_PROMPT,
        userText: buildCampaignReviewInput(loaded.campaign),
        maxTokens: MAX_OUTPUT_TOKENS,
        tool: CAMPAIGN_REVIEW_TOOL,
        timeoutMs: budget.timeoutMs,
        reasoningEffort: budget.reasoningEffort,
      });
      return {
        result: parseCampaignReviewToolUse(response.content),
        // Reported even when the answer was unusable: the tokens were spent
        // either way, and an unbilled call is the failure the ledger exists to
        // prevent.
        usage: {
          inputTokens: response.inputTokens,
          outputTokens: response.outputTokens,
        },
      };
    },
  });

  if (!outcome.ok) {
    logger.error(
      {
        scope: "ai.review-campaign",
        clientSlug: loaded.client.slug,
        sequenceId: args.sequenceId,
        providerError: outcome.reason,
      },
      "Campaign review provider call failed",
    );
    return { ok: false, reason: outcome.reason };
  }

  const parsed = outcome.result;
  if (!parsed) {
    logger.warn(
      { scope: "ai.review-campaign", clientSlug: loaded.client.slug },
      "Campaign review returned an unusable answer; nothing was written",
    );
    return { ok: false, reason: "unusable_answer" };
  }

  const review = await prisma.aiCampaignReview.create({
    data: {
      clientId: loaded.client.id,
      sequenceId: args.sequenceId,
      score: parsed.score,
      summary: parsed.summary,
      findings: parsed.findings as unknown as object[],
      model,
      promptVersion: CAMPAIGN_REVIEW_PROMPT_VERSION,
      stepCount: loaded.campaign.steps.length,
      requestedByStaffUserId: args.staffUserId,
    },
    select: { id: true },
  });

  logger.info(
    {
      scope: "ai.review-campaign",
      clientSlug: loaded.client.slug,
      sequenceId: args.sequenceId,
      score: parsed.score,
      findings: parsed.findings.length,
      costMicroUsd: outcome.costMicroUsd,
    },
    "Reviewed a campaign",
  );

  return {
    ok: true,
    reviewId: review.id,
    score: parsed.score,
    summary: parsed.summary,
    findings: parsed.findings,
    costMicroUsd: outcome.costMicroUsd,
  };
}

/**
 * Cheap checks before a review is detached from the browser request.
 * A missing sequence or an empty one must redirect immediately. The model
 * call is the part that outlives the POST.
 */
export async function preflightCampaignReview(args: {
  clientId: string;
  sequenceId: string;
}): Promise<{ ok: true } | { ok: false; reason: "sequence_not_found" | "no_steps" }> {
  const loaded = await loadCampaign(args);
  if (loaded === null) return { ok: false, reason: "sequence_not_found" };
  if (loaded === "no_steps") return { ok: false, reason: "no_steps" };
  return { ok: true };
}

/**
 * Run the review after the server action has responded.
 *
 * The button used to await the model on the POST. That POST was cut at about
 * 30s (the app error screen) or survived only until the 20s provider abort
 * (the unavailable banner). The action now records nothing and returns. This
 * schedules the one existing call. Tests pass `schedule` so they do not need
 * a Next.js request scope.
 */
export function scheduleCampaignReview(
  args: { clientId: string; sequenceId: string; staffUserId: string },
  schedule: (run: () => Promise<void>) => void = (run) => {
    after(() => run());
  },
): void {
  schedule(async () => {
    try {
      await reviewCampaign(args);
    } catch (err) {
      const providerError =
        err instanceof Error ? sanitizeProviderErrorDetail(err.message) : "call_failed";
      logger.error(
        {
          scope: "ai.review-campaign",
          clientId: args.clientId,
          sequenceId: args.sequenceId,
          providerError,
        },
        "Campaign review failed after the response was sent",
      );
    } finally {
      revalidatePath(`/clients/${args.clientId}/outreach`);
    }
  });
}

/** How far a status poll looks behind the click, for app/database clock skew. */
const CAMPAIGN_REVIEW_SINCE_SKEW_MS = 5_000;

export type CampaignReviewAttempt =
  | { readonly state: "pending" }
  | { readonly state: "succeeded"; readonly message: string }
  | { readonly state: "failed"; readonly message: string };

/**
 * What the detached review has done since the click.
 *
 * Reads the usage ledger (written for every outcome, including a provider
 * failure) and the review row. It does not start another model call.
 */
export async function readCampaignReviewAttempt(args: {
  clientId: string;
  sequenceId: string;
  since: Date;
}): Promise<CampaignReviewAttempt> {
  const since = new Date(args.since.getTime() - CAMPAIGN_REVIEW_SINCE_SKEW_MS);
  const usage = await prisma.aiUsageEvent.findFirst({
    where: {
      clientId: args.clientId,
      feature: "CAMPAIGN_REVIEW",
      subjectType: "ClientEmailSequence",
      subjectId: args.sequenceId,
      createdAt: { gte: since },
    },
    orderBy: { createdAt: "desc" },
    select: { status: true, outcomeCode: true },
  });
  if (!usage) return { state: "pending" };
  if (usage.status !== "OK") {
    return {
      state: "failed",
      message: campaignReviewFailureMessage(usage.outcomeCode ?? "call_failed"),
    };
  }
  const review = await prisma.aiCampaignReview.findFirst({
    where: {
      clientId: args.clientId,
      sequenceId: args.sequenceId,
      createdAt: { gte: since },
    },
    orderBy: { createdAt: "desc" },
    select: { score: true, findings: true },
  });
  if (!review) {
    return { state: "failed", message: campaignReviewFailureMessage("unusable_answer") };
  }
  const findingCount = Array.isArray(review.findings) ? review.findings.length : 0;
  return {
    state: "succeeded",
    message: campaignReviewSuccessMessage(review.score, findingCount),
  };
}

export interface StoredCampaignReview {
  readonly id: string;
  readonly score: number;
  readonly summary: string;
  readonly findings: readonly CampaignReviewFinding[];
  readonly stepCount: number;
  readonly promptVersion: string;
  readonly createdAt: Date;
}

/**
 * The most recent review for each of a client's sequences.
 *
 * Read back rather than kept in a flash message so a paid-for critique survives
 * a refresh — buying the same review twice because somebody reloaded the page
 * is exactly the kind of quiet waste the ledger would show and nobody would
 * explain.
 */
export async function loadLatestCampaignReviews(
  clientId: string,
): Promise<Map<string, StoredCampaignReview>> {
  const rows = await prisma.aiCampaignReview.findMany({
    where: { clientId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      sequenceId: true,
      score: true,
      summary: true,
      findings: true,
      stepCount: true,
      promptVersion: true,
      createdAt: true,
    },
  });

  const latest = new Map<string, StoredCampaignReview>();
  for (const row of rows) {
    // Ordered newest first, so the first row seen for a sequence is its latest.
    if (latest.has(row.sequenceId)) continue;
    latest.set(row.sequenceId, {
      id: row.id,
      score: row.score,
      summary: row.summary,
      findings: Array.isArray(row.findings)
        ? (row.findings as unknown as CampaignReviewFinding[])
        : [],
      stepCount: row.stepCount,
      promptVersion: row.promptVersion,
      createdAt: row.createdAt,
    });
  }
  return latest;
}
