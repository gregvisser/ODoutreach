import "server-only";

import { resolveXaiChatModelId, XAI_CHAT_MODELS } from "@/lib/ai/model-catalog";

/**
 * Credentials and model for product AI.
 *
 * Greg policy: product AI is xAI (Grok) only. There is no second vendor and
 * no provider switch. Credential name: `XAI_API_KEY` only (no aliases).
 */

/** Default xAI chat model when `XAI_MODEL` is unset. */
export const DEFAULT_XAI_MODEL = XAI_CHAT_MODELS.DEFAULT;

/** xAI API key. Never log or print this value. */
export function resolveProductAiApiKey(): string | undefined {
  const key = process.env.XAI_API_KEY?.trim();
  return key || undefined;
}

/**
 * Model id sent to xAI and stored on the usage ledger: one model per
 * deployment (`XAI_MODEL`, aliases resolved, or the default).
 */
export function resolveProductAiModel(): string {
  const fromEnv = process.env.XAI_MODEL?.trim();
  const raw = fromEnv || DEFAULT_XAI_MODEL;
  return resolveXaiChatModelId(raw) ?? raw;
}

/** Whether `XAI_API_KEY` is set (UI + refusal parity). */
export function isProductAiConfigured(): boolean {
  return resolveProductAiApiKey() !== undefined;
}
