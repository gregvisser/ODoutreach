import "server-only";

import { AI_MODELS } from "@/lib/ai/model-catalog";
import {
  buildTrainingAssistantInput,
  parseTrainingAssistantToolUse,
  TRAINING_ASSISTANT_PROMPT_VERSION,
  TRAINING_ASSISTANT_SYSTEM_PROMPT,
  TRAINING_ASSISTANT_TOOL,
} from "@/lib/ai/training-assistant-prompt";
import { getTrainingAssistantChunk } from "@/lib/training/assistant-content";
import { searchTrainingContent } from "@/lib/training/assistant-search";
import { prisma } from "@/lib/db";
import { logger, reportError } from "@/lib/logger";

import { callAnthropicMessages } from "./anthropic-messages";
import { runMeteredAiCall } from "./metered-call";

/**
 * Answer a staff member's "how do I..." question from the app-shell search
 * bar (queue row 149), using ONLY the static training content.
 *
 * WHAT MAKES `carriesPersonalData: false` HONEST. Every source this function
 * reads — `searchTrainingContent` over `TRAINING_ASSISTANT_CHUNKS` — is built
 * from `src/lib/training/modules.ts`, `STAFF_VIDEO_SCRIPTS`,
 * `STAFF_HANDOVER_CHECKLIST` and `staff-handover-guide.ts` and nothing else.
 * This file has no import path to `@/lib/db`'s client/prospect/reply tables
 * beyond the two writes it makes itself (the unanswered-question log, and
 * resolving the `bidlowai` billing client by slug) — neither read is a
 * client's own data.
 *
 * WHO IS BILLED. Not whichever client a staff member happens to be looking
 * at — this is an internal ops tool, so every call is billed to the
 * `bidlowai` workspace regardless of what screen it was opened from.
 *
 * THE ORDER OF OPERATIONS IS THE SAFETY PROPERTY, same as `adviseSendTimes`.
 * The lexical search runs BEFORE any model is called: a question with no
 * matching content costs nothing at all, and there is nothing for the model
 * to invent an answer from because it is never invoked. A citation is
 * re-validated against the matched set after the model answers, so an
 * uncited or fabricated-id answer can never reach a staff member as if it
 * were sourced.
 */

export interface TrainingAssistantCitation {
  readonly label: string;
  readonly href: string;
}

export type AnswerTrainingQuestionResult =
  | {
      readonly ok: true;
      readonly canAnswer: true;
      readonly answer: string;
      readonly citations: readonly TrainingAssistantCitation[];
      readonly costMicroUsd: number;
    }
  | {
      readonly ok: true;
      readonly canAnswer: false;
      /** Set once the question has been logged as unanswered, so a caller can offer a ticket linked to it. */
      readonly unansweredQuestionId: string | null;
    }
  | { readonly ok: false; readonly reason: string };

const BIDLOWAI_CLIENT_SLUG = "bidlowai";

type UnansweredReason =
  | "NO_MATCHING_CONTENT"
  | "MODEL_UNSURE"
  | "AI_CALL_REFUSED"
  | "AI_CALL_ERROR";

/**
 * Best-effort write to the honest backlog of what the training does not
 * cover. Never throws into the caller — a staff member must still get their
 * "I don't know, shall I raise a ticket?" answer even if this insert fails,
 * the same reasoning `metered-call.ts` uses for the usage ledger.
 */
export async function recordUnansweredTrainingQuestion(args: {
  question: string;
  reason: UnansweredReason;
  askedByEmail: string;
}): Promise<string | null> {
  try {
    const row = await prisma.trainingAssistantUnansweredQuestion.create({
      data: {
        question: args.question,
        reason: args.reason,
        askedByEmail: args.askedByEmail,
      },
      select: { id: true },
    });
    return row.id;
  } catch (err) {
    reportError(err, {
      scope: "training-assistant.unanswered-log",
      detail: "Could not log an unanswered training-assistant question",
      reason: args.reason,
    });
    return null;
  }
}

/** Reasons `runMeteredAiCall` refuses a call outright, before any network request. */
const REFUSAL_CODES = new Set([
  "ai_features_switched_off",
  "no_api_key",
  "no_rate_for_model",
  "no_processor_allowance",
]);

const MAX_OUTPUT_TOKENS = 700;

export async function answerTrainingQuestion(args: {
  question: string;
  askedByEmail: string;
}): Promise<AnswerTrainingQuestionResult> {
  const question = args.question.trim();
  if (!question) return { ok: false, reason: "empty_question" };

  const matches = searchTrainingContent(question);

  if (matches.length === 0) {
    const unansweredQuestionId = await recordUnansweredTrainingQuestion({
      question,
      reason: "NO_MATCHING_CONTENT",
      askedByEmail: args.askedByEmail,
    });
    return { ok: true, canAnswer: false, unansweredQuestionId };
  }

  const client = await prisma.client.findFirst({
    where: { slug: BIDLOWAI_CLIENT_SLUG, deletedAt: null },
    select: { id: true, slug: true },
  });
  if (!client) {
    // Infrastructure fact, not a training gap — logged the same way so the
    // question is not silently lost, but the reason says what actually
    // happened rather than misreporting "no matching content".
    logger.error(
      { scope: "training-assistant", clientSlug: BIDLOWAI_CLIENT_SLUG },
      "bidlowai billing client not found — cannot answer via the model",
    );
    const unansweredQuestionId = await recordUnansweredTrainingQuestion({
      question,
      reason: "AI_CALL_REFUSED",
      askedByEmail: args.askedByEmail,
    });
    return { ok: true, canAnswer: false, unansweredQuestionId };
  }

  const model = AI_MODELS.TRAINING_ASSISTANT;

  const outcome = await runMeteredAiCall({
    client,
    feature: "TRAINING_ASSISTANT",
    model,
    apiKey: process.env.ANTHROPIC_API_KEY,
    subject: { type: "StaffQuestion", id: args.askedByEmail },
    invoke: async () => {
      const response = await callAnthropicMessages({
        apiKey: process.env.ANTHROPIC_API_KEY as string,
        workspaceId: process.env.ANTHROPIC_WORKSPACE_ID,
        model,
        system: TRAINING_ASSISTANT_SYSTEM_PROMPT,
        userText: buildTrainingAssistantInput(question, matches),
        maxTokens: MAX_OUTPUT_TOKENS,
        tool: TRAINING_ASSISTANT_TOOL,
      });
      return {
        result: parseTrainingAssistantToolUse(response.content),
        usage: {
          inputTokens: response.inputTokens,
          outputTokens: response.outputTokens,
        },
      };
    },
  });

  if (!outcome.ok) {
    const reason: UnansweredReason = REFUSAL_CODES.has(outcome.reason)
      ? "AI_CALL_REFUSED"
      : "AI_CALL_ERROR";
    const unansweredQuestionId = await recordUnansweredTrainingQuestion({
      question,
      reason,
      askedByEmail: args.askedByEmail,
    });
    return { ok: true, canAnswer: false, unansweredQuestionId };
  }

  const parsed = outcome.result;

  // Every citation must resolve to a real chunk that was actually retrieved
  // for this question — never trust an id the model invented, and never
  // trust a citation to content it was not shown.
  const matchedIds = new Set(matches.map((m) => m.chunk.id));
  const citations: TrainingAssistantCitation[] = parsed
    ? Array.from(new Set(parsed.citedChunkIds))
        .filter((id) => matchedIds.has(id))
        .map((id) => getTrainingAssistantChunk(id))
        .filter((chunk): chunk is NonNullable<typeof chunk> => chunk !== undefined)
        .map((chunk) => ({ label: chunk.label, href: chunk.href }))
    : [];

  if (!parsed || !parsed.canAnswer || citations.length === 0) {
    const unansweredQuestionId = await recordUnansweredTrainingQuestion({
      question,
      reason: "MODEL_UNSURE",
      askedByEmail: args.askedByEmail,
    });
    return { ok: true, canAnswer: false, unansweredQuestionId };
  }

  logger.info(
    {
      scope: "training-assistant",
      citations: citations.length,
      costMicroUsd: outcome.costMicroUsd,
    },
    "Answered a training-assistant question",
  );

  return {
    ok: true,
    canAnswer: true,
    answer: parsed.answer,
    citations,
    costMicroUsd: outcome.costMicroUsd,
  };
}

/** Prompt version exported for the roundtrip test and any future audit of stored answers. */
export { TRAINING_ASSISTANT_PROMPT_VERSION };
