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
import {
  classifyAiProviderFailure,
  sanitizeProviderErrorDetail,
} from "./provider-transport-error";

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
  /**
   * Client to bill. Null for the training assistant, which is billed to the
   * staff member's organisation and must not be charged to a client slug.
   */
  readonly client: { readonly id: string; readonly slug: string } | null;
  /** Set when `client` is null. Also recorded when the caller already knows it. */
  readonly organisationId?: string | null;
  /** Slug written on the ledger when there is no client. The organisation slug. */
  readonly organisationSlug?: string | null;
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

/**
 * Provider failure text for the ledger and the server log.
 *
 * The transport layer already strips keys from HTTP bodies. This pass covers
 * a throw that still carries one, and caps the length the ledger column keeps.
 */
function outcomeCodeFromError(err: unknown): string {
  const message = err instanceof Error ? err.message : "call_failed";
  const safe = sanitizeProviderErrorDetail(message);
  return safe.length > 0 ? safe : "call_failed";
}

export async function runMeteredAiCall<T>(
  args: MeteredAiCallArgs<T>,
): Promise<MeteredAiCallOutcome<T>> {
  const { client, feature, model, apiKey, subject, invoke } = args;
  const billingSlug = client?.slug ?? args.organisationSlug ?? "organisation";

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
          clientId: client?.id ?? null,
          clientSlugAtCall: billingSlug,
          ...(args.organisationId ? { organisationId: args.organisationId } : {}),
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
        clientSlug: billingSlug,
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
  if (!areAiFeaturesEnabled(feature)) return refuse("ai_features_switched_off");
  if (
    client &&
    (feature === "SEQUENCE_DRAFTING" ||
      feature === "CAMPAIGN_REVIEW" ||
      feature === "SEND_TIME_ADVICE" ||
      feature === "REP_PERFORMANCE" ||
      feature === "TITLE_MESSAGE_FIT")
  ) {
    const { clientFeatureEnabled } = await import("@/server/tenant/feature-gate");
    if (!(await clientFeatureEnabled(client.id, "aiDraftingReview", true))) {
      return refuse("organisation_feature_off");
    }
  }
  if (!apiKey) return refuse("no_api_key");
  if (!rate) return refuse("no_rate_for_model");
  // CR-10: a feature declared to carry a prospect's own personal data may not
  // reach a vendor with no recorded processor allowance for it — regardless of
  // whether an API key happens to be configured. See `ai-feature-data-policy.ts`.
  if (isPersonalDataUncovered(feature)) return refuse("no_processor_allowance");
  const { organisationAiCapBlocks } = await import("@/server/tenant/feature-gate");
  if (
    await organisationAiCapBlocks({
      clientId: client?.id ?? null,
      organisationId: args.organisationId ?? null,
    })
  ) {
    return refuse("organisation_ai_cap");
  }

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
    logger.error(
      {
        scope: "ai.call",
        feature,
        model,
        clientSlug: billingSlug,
        failureClass: classifyAiProviderFailure(code),
        providerError: code,
      },
      "AI provider call failed",
    );
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
