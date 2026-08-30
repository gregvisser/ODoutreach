import "server-only";

import { AI_MODELS } from "@/lib/ai/model-catalog";
import {
  buildClassificationInput,
  CLASSIFICATION_SYSTEM_PROMPT,
  CLASSIFICATION_TOOL,
  parseClassificationToolUse,
} from "@/lib/ai/reply-classification";
import { prisma } from "@/lib/db";
import { logger, reportError } from "@/lib/logger";

import { callAnthropicMessages } from "./anthropic-messages";
import { runMeteredAiCall } from "./metered-call";

/**
 * Label one inbound reply, and record what that cost.
 *
 * The value of this feature is a routing decision: a "yes, happy to talk" that
 * a human sees within minutes is worth more than every open-count feature on
 * the owner's list. So the governing rule throughout is that FAILING TO LABEL
 * IS SAFE and MISLABELLING IS NOT. Every path that cannot produce an answer we
 * trust leaves `classification` NULL, and a NULL reply is shown to a person.
 *
 * What this function deliberately does NOT do:
 *   * It does not send, queue, suppress, unsubscribe or stop anything. An
 *     UNSUBSCRIBE label is a label — the real unsubscribe rail is unchanged and
 *     is not driven from a model's opinion. Acting on a classification is a
 *     separate decision with its own gates.
 *   * It does not retry. A timed-out call may already have been served and
 *     billed, so an automatic retry would double-charge the client.
 */

/** Enough for a label, a number and one sentence. Caps the output side of the bill. */
const MAX_OUTPUT_TOKENS = 200;

export interface ClassifyInboundReplyResult {
  readonly classified: boolean;
  readonly reason?: string;
}

export async function classifyInboundReply(args: {
  replyId: string;
}): Promise<ClassifyInboundReplyResult> {
  const reply = await prisma.inboundReply.findFirst({
    where: { id: args.replyId },
    select: {
      id: true,
      clientId: true,
      subject: true,
      bodyPreview: true,
      snippet: true,
      classification: true,
      client: { select: { id: true, slug: true } },
    },
  });

  // No reply, or no client to bill: there is nobody to charge, so nothing may
  // be spent. Not an error — a reply can be deleted between ingest and here.
  if (!reply || !reply.client) return { classified: false, reason: "reply_not_found" };

  // Already labelled. Guards against a re-run of the sync paying twice for the
  // same reply, which is the cheapest possible way to inflate a client's bill.
  if (reply.classification) return { classified: false, reason: "already_classified" };

  const model = AI_MODELS.REPLY_CLASSIFICATION;
  const userText = buildClassificationInput({
    subject: reply.subject,
    // `bodyPreview` is the fuller text; `snippet` is the provider's short form.
    body: reply.bodyPreview ?? reply.snippet,
  });

  const outcome = await runMeteredAiCall({
    client: { id: reply.client.id, slug: reply.client.slug },
    feature: "REPLY_CLASSIFICATION",
    model,
    apiKey: process.env.ANTHROPIC_API_KEY,
    subject: { type: "InboundReply", id: reply.id },
    invoke: async () => {
      const response = await callAnthropicMessages({
        apiKey: process.env.ANTHROPIC_API_KEY as string,
        workspaceId: process.env.ANTHROPIC_WORKSPACE_ID,
        model,
        system: CLASSIFICATION_SYSTEM_PROMPT,
        userText,
        maxTokens: MAX_OUTPUT_TOKENS,
        tool: CLASSIFICATION_TOOL,
      });
      return {
        result: parseClassificationToolUse(response.content),
        // Reported even when the answer was unusable: we were charged for the
        // tokens either way, and an unbilled call is the failure this whole
        // feature was told to avoid.
        usage: {
          inputTokens: response.inputTokens,
          outputTokens: response.outputTokens,
        },
      };
    },
  });

  if (!outcome.ok) return { classified: false, reason: outcome.reason };

  const parsed = outcome.result;
  if (!parsed) {
    // We paid for this call and it is on the ledger, but the answer was not one
    // we will store. The reply stays unlabelled and a person reads it.
    logger.warn(
      { scope: "ai.classify-reply", replyId: reply.id, clientSlug: reply.client.slug },
      "Reply classification returned an unusable answer; left unclassified",
    );
    return { classified: false, reason: "unusable_answer" };
  }

  await prisma.inboundReply.update({
    where: { id: reply.id },
    data: {
      classification: parsed.label,
      classificationConfidence: parsed.confidence,
      classificationRationale: parsed.rationale || null,
      classificationModel: model,
      classifiedAt: new Date(),
    },
  });

  return { classified: true };
}

/**
 * Classify a reply from inside the ingestion path, where nothing may fail.
 *
 * Ingesting the reply is the job that matters: an unclassified reply is still a
 * reply a person can read, whereas a reply that was never stored is lost. So
 * every failure here — including a database error, which `classifyInboundReply`
 * does NOT catch — is reported and swallowed.
 *
 * This is a genuine swallow and therefore needs its justification stated: the
 * standard forbids silently discarded errors, and this one is not silent. It is
 * logged with the reply id, and the paid-call outcomes it might hide are
 * already on the `AiUsageEvent` ledger as REFUSED or ERROR rows.
 */
export async function classifyInboundReplyQuietly(args: { replyId: string }): Promise<void> {
  try {
    await classifyInboundReply(args);
  } catch (err) {
    reportError(err, {
      scope: "ai.classify-reply",
      detail: "Reply classification failed; the reply is stored and unlabelled",
      replyId: args.replyId,
    });
  }
}
