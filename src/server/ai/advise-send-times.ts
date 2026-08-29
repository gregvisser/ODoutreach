import "server-only";

import { AI_MODELS } from "@/lib/ai/model-catalog";
import {
  buildSendTimeAdviceInput,
  parseSendTimeAdviceToolUse,
  SEND_TIME_ADVICE_PROMPT_VERSION,
  SEND_TIME_ADVICE_SYSTEM_PROMPT,
  SEND_TIME_ADVICE_TOOL,
  type RecommendedWindow,
} from "@/lib/ai/send-time-advice";
import {
  assessSendTimeEvidence,
  LOOKBACK_DAYS,
  type SendOutcome,
  type SlotStat,
} from "@/lib/ai/send-time-evidence";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";

import { callAnthropicMessages } from "./anthropic-messages";
import { runMeteredAiCall } from "./metered-call";

/**
 * Advise on when to send for one client, and record what it cost.
 *
 * WHAT THIS FUNCTION CHANGES ABOUT SENDING: nothing. It reads sent mail and
 * linked replies and writes one `AiSendTimeAdvice` row. It does not touch a
 * sequence, a step, a delay, a queue row, a mailbox, or the cron — and it could
 * not schedule anything if it wanted to, because no code in this application
 * decides when mail leaves. That is asserted by test.
 *
 * THE ORDER OF OPERATIONS IS THE SAFETY PROPERTY. The evidence is assessed
 * BEFORE the model is called, so a client with too thin a history costs nothing
 * at all: no request is made, no tokens are spent, and the operator is told
 * which of sends, replies or spread is missing. A "best time to send" drawn from
 * four replies is not a cheap answer, it is a confident wrong one.
 *
 * It also does not retry. A timed-out call may already have been served and
 * billed, so an automatic retry would charge the client twice.
 */

/** A paragraph, three short windows and a few cautions. Caps the output side. */
const MAX_OUTPUT_TOKENS = 1_500;

export type AdviseSendTimesResult =
  | {
      readonly ok: true;
      readonly adviceId: string;
      readonly summary: string;
      readonly windows: readonly RecommendedWindow[];
      readonly cautions: readonly string[];
      readonly evidence: readonly SlotStat[];
      readonly costMicroUsd: number;
    }
  | { readonly ok: false; readonly reason: string };

/**
 * Read this client's sent mail, and whether each one earned a reply.
 *
 * A reply is counted as `linkedOutboundEmailId` pointing at the row — the same
 * linkage the inbox and the reports already use. Unlinked replies exist (Gmail
 * rewrites Message-IDs, so the matcher cannot always be certain) and are
 * deliberately NOT counted here: an unlinked reply has no send time to
 * attribute, and spreading it across slots would invent the pattern we are
 * asking about.
 */
async function loadSendOutcomes(args: {
  clientId: string;
  since: Date;
}): Promise<SendOutcome[]> {
  const rows = await prisma.outboundEmail.findMany({
    where: {
      clientId: args.clientId,
      sentAt: { not: null, gte: args.since },
    },
    select: {
      sentAt: true,
      _count: { select: { inboundReplies: true } },
    },
  });

  return rows.flatMap((row) =>
    row.sentAt === null
      ? []
      : [{ sentAt: row.sentAt, replied: row._count.inboundReplies > 0 }],
  );
}

export async function adviseSendTimes(args: {
  clientId: string;
  staffUserId: string;
  /** Injectable so the evidence window is testable at a fixed point. */
  now?: Date;
}): Promise<AdviseSendTimesResult> {
  const client = await prisma.client.findFirst({
    where: { id: args.clientId, deletedAt: null },
    select: { id: true, slug: true, name: true, industry: true },
  });
  if (!client) return { ok: false, reason: "client_not_found" };

  const now = args.now ?? new Date();
  const since = new Date(now.getTime() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);

  const outcomes = await loadSendOutcomes({ clientId: client.id, since });
  const verdict = assessSendTimeEvidence(outcomes);

  // The gate. Fails closed BEFORE any money is spent: no call, no ledger row for
  // a call that did not happen, and a reason the operator can act on.
  if (!verdict.sufficient) {
    return { ok: false, reason: verdict.reason };
  }

  const model = AI_MODELS.SEND_TIME_ADVICE;

  const outcome = await runMeteredAiCall({
    client: { id: client.id, slug: client.slug },
    feature: "SEND_TIME_ADVICE",
    model,
    apiKey: process.env.ANTHROPIC_API_KEY,
    subject: { type: "Client", id: client.id },
    invoke: async () => {
      const response = await callAnthropicMessages({
        apiKey: process.env.ANTHROPIC_API_KEY as string,
        model,
        system: SEND_TIME_ADVICE_SYSTEM_PROMPT,
        userText: buildSendTimeAdviceInput({
          clientName: client.name,
          industry: client.industry,
          slots: verdict.slots,
          totalSent: verdict.totalSent,
          totalReplied: verdict.totalReplied,
          lookbackDays: LOOKBACK_DAYS,
        }),
        maxTokens: MAX_OUTPUT_TOKENS,
        tool: SEND_TIME_ADVICE_TOOL,
      });
      return {
        result: parseSendTimeAdviceToolUse(response.content),
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

  if (!outcome.ok) return { ok: false, reason: outcome.reason };

  const parsed = outcome.result;
  if (!parsed) {
    logger.warn(
      { scope: "ai.advise-send-times", clientSlug: client.slug },
      "Send-time advice returned an unusable answer; nothing was written",
    );
    return { ok: false, reason: "unusable_answer" };
  }

  const advice = await prisma.aiSendTimeAdvice.create({
    data: {
      clientId: client.id,
      summary: parsed.summary,
      windows: parsed.windows as unknown as object[],
      cautions: parsed.cautions as unknown as string[],
      // Stored with the advice so the panel can print the numbers beside the
      // opinion, and so advice given on a thin history stays auditable once the
      // history has grown past it.
      evidence: verdict.slots as unknown as object[],
      totalSent: verdict.totalSent,
      totalReplied: verdict.totalReplied,
      lookbackDays: LOOKBACK_DAYS,
      model,
      promptVersion: SEND_TIME_ADVICE_PROMPT_VERSION,
      requestedByStaffUserId: args.staffUserId,
    },
    select: { id: true },
  });

  logger.info(
    {
      scope: "ai.advise-send-times",
      clientSlug: client.slug,
      windows: parsed.windows.length,
      totalSent: verdict.totalSent,
      costMicroUsd: outcome.costMicroUsd,
    },
    "Advised on send times",
  );

  return {
    ok: true,
    adviceId: advice.id,
    summary: parsed.summary,
    windows: parsed.windows,
    cautions: parsed.cautions,
    evidence: verdict.slots,
    costMicroUsd: outcome.costMicroUsd,
  };
}

export interface StoredSendTimeAdvice {
  readonly id: string;
  readonly summary: string;
  readonly windows: readonly RecommendedWindow[];
  readonly cautions: readonly string[];
  readonly evidence: readonly SlotStat[];
  readonly totalSent: number;
  readonly totalReplied: number;
  readonly lookbackDays: number;
  readonly promptVersion: string;
  readonly createdAt: Date;
}

/**
 * The most recent advice for a client.
 *
 * Read back rather than kept in a flash message so a paid-for answer survives a
 * refresh — buying the same advice twice because somebody reloaded the page is
 * exactly the kind of quiet waste the ledger would show and nobody could explain.
 */
export async function loadLatestSendTimeAdvice(
  clientId: string,
): Promise<StoredSendTimeAdvice | null> {
  const row = await prisma.aiSendTimeAdvice.findFirst({
    where: { clientId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      summary: true,
      windows: true,
      cautions: true,
      evidence: true,
      totalSent: true,
      totalReplied: true,
      lookbackDays: true,
      promptVersion: true,
      createdAt: true,
    },
  });
  if (!row) return null;

  return {
    id: row.id,
    summary: row.summary,
    windows: Array.isArray(row.windows)
      ? (row.windows as unknown as RecommendedWindow[])
      : [],
    cautions: Array.isArray(row.cautions)
      ? (row.cautions as unknown as string[])
      : [],
    evidence: Array.isArray(row.evidence)
      ? (row.evidence as unknown as SlotStat[])
      : [],
    totalSent: row.totalSent,
    totalReplied: row.totalReplied,
    lookbackDays: row.lookbackDays,
    promptVersion: row.promptVersion,
    createdAt: row.createdAt,
  };
}
