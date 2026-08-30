import "server-only";

import { areAiFeaturesEnabled } from "@/lib/ai/ai-switch";
import {
  computeCostMicroUsd,
  getModelRate,
  RATE_VERSION,
  type TokenUsage,
} from "@/lib/ai/model-catalog";
import { prisma } from "@/lib/db";
import { logger, reportError } from "@/lib/logger";

import { isPersonalDataUncovered } from "./ai-feature-data-policy";

import type { AiFeature } from "@/generated/prisma/client";

/**
 * The ONLY way this application calls a language model.
 *
 * Why a wrapper rather than a convention: the queue's requirement is that model,
 * tokens, cost and client are recorded on EVERY call from the first commit,
 * because "retrofitted metering always under-counts". A convention that says
 * "remember to log usage" is retrofitted metering with extra steps — the first
 * call site that forgets is unbilled for ever, and nobody finds out until an
 * invoice is queried months later.
 *
 * So the ledger write is not something a caller does; it is something a caller
 * cannot avoid. `invoke` hands back its token usage as part of its return type,
 * which means a call that does not report its usage does not COMPILE.
 *
 * Every outcome writes exactly one row, including the outcomes that cost
 * nothing:
 *   * A refusal (switched off, no key, no price) is recorded as REFUSED so that
 *     "off on purpose" is visibly different from "silently stopped working".
 *     This project has shipped six things that reported success and never
 *     fired; a feature that is doing nothing should say so on the ledger.
 *   * A failure is recorded as ERROR, so an outage shows up as a rising error
 *     count rather than as an inexplicably small bill.
 */

/** What `invoke` must hand back: the answer, and what it cost in tokens. */
export interface AiInvokeResult<T> {
  readonly result: T;
  readonly usage: TokenUsage;
}

export interface MeteredAiCallArgs<T> {
  /** Who to bill. Required — there is no house account. */
  readonly client: { readonly id: string; readonly slug: string };
  readonly feature: AiFeature;
  readonly model: string;
  /**
   * Passed in rather than read from the environment here so a test can prove
   * the no-key refusal without mutating process state, and so the key never
   * has more than one reader.
   */
  readonly apiKey: string | undefined;
  /** What this charge is about, for tracing a line on an invoice to a real thing. */
  readonly subject?: { readonly type: string; readonly id: string };
  readonly invoke: () => Promise<AiInvokeResult<T>>;
}

export type MeteredAiCallOutcome<T> =
  | { readonly ok: true; readonly result: T; readonly costMicroUsd: number }
  | { readonly ok: false; readonly reason: string };

/** Truncate a provider error to something safe and useful on a ledger row. */
function outcomeCodeFromError(err: unknown): string {
  const message = err instanceof Error ? err.message : "call_failed";
  return message.slice(0, 200);
}

export async function runMeteredAiCall<T>(
  args: MeteredAiCallArgs<T>,
): Promise<MeteredAiCallOutcome<T>> {
  const { client, feature, model, apiKey, subject, invoke } = args;

  const rate = getModelRate(model);

  /**
   * Write the ledger row.
   *
   * Deliberately never throws into the caller. If the ledger write fails after
   * a PAID call, money has been spent and not recorded — the exact thing this
   * file exists to prevent — so it is reported to the error monitor rather than
   * swallowed. But it is not re-thrown: throwing would abort reply ingestion
   * and the retry would pay for the same call again, turning a lost row into a
   * lost row plus a double charge.
   */
  async function record(row: {
    status: "OK" | "REFUSED" | "ERROR";
    usage: TokenUsage;
    costMicroUsd: number;
    latencyMs: number | null;
    outcomeCode: string | null;
  }): Promise<void> {
    try {
      await prisma.aiUsageEvent.create({
        data: {
          clientId: client.id,
          clientSlugAtCall: client.slug,
          feature,
          status: row.status,
          model,
          inputTokens: row.usage.inputTokens,
          outputTokens: row.usage.outputTokens,
          costMicroUsd: row.costMicroUsd,
          inputRatePerMTokMicroUsd: rate?.inputPerMTokMicroUsd ?? 0,
          outputRatePerMTokMicroUsd: rate?.outputPerMTokMicroUsd ?? 0,
          rateVersion: RATE_VERSION,
          latencyMs: row.latencyMs,
          subjectType: subject?.type ?? null,
          subjectId: subject?.id ?? null,
          outcomeCode: row.outcomeCode,
        },
      });
    } catch (err) {
      reportError(err, {
        scope: "ai.usage-ledger",
        detail: "AI usage row could not be written — spend may be unbilled",
        clientSlug: client.slug,
        feature,
        model,
        costMicroUsd: row.costMicroUsd,
        inputTokens: row.usage.inputTokens,
        outputTokens: row.usage.outputTokens,
      });
    }
  }

  const noUsage: TokenUsage = { inputTokens: 0, outputTokens: 0 };

  async function refuse(code: string): Promise<MeteredAiCallOutcome<T>> {
    await record({
      status: "REFUSED",
      usage: noUsage,
      costMicroUsd: 0,
      latencyMs: null,
      outcomeCode: code,
    });
    return { ok: false, reason: code };
  }

  // Order matters only in that each check must happen before any money is
  // spent. All four fail closed: nothing is called, nothing is charged.
  if (!areAiFeaturesEnabled()) return refuse("ai_features_switched_off");
  if (!apiKey) return refuse("no_api_key");
  if (!rate) return refuse("no_rate_for_model");
  // CR-10: a feature declared to carry a prospect's own personal data may not
  // reach a vendor with no recorded processor allowance for it — regardless of
  // whether an API key happens to be configured. See `ai-feature-data-policy.ts`.
  if (isPersonalDataUncovered(feature)) return refuse("no_processor_allowance");

  const startedAt = Date.now();
  let invoked: AiInvokeResult<T>;
  try {
    invoked = await invoke();
  } catch (err) {
    const code = outcomeCodeFromError(err);
    await record({
      status: "ERROR",
      usage: noUsage,
      costMicroUsd: 0,
      latencyMs: Date.now() - startedAt,
      outcomeCode: code,
    });
    logger.warn({ scope: "ai.call", feature, model, clientSlug: client.slug, code }, "AI call failed");
    return { ok: false, reason: code };
  }

  const costMicroUsd = computeCostMicroUsd(invoked.usage, rate);
  await record({
    status: "OK",
    usage: invoked.usage,
    costMicroUsd,
    latencyMs: Date.now() - startedAt,
    outcomeCode: null,
  });

  return { ok: true, result: invoked.result, costMicroUsd };
}
