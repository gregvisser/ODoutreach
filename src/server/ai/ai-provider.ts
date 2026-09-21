import "server-only";

import { XAI_CHAT_MODELS } from "@/lib/ai/model-catalog";

/**
 * Which vendor backs product AI, and which credentials/models to use.
 *
 * Greg policy: production runs xAI (Grok) only. Anthropic remains behind an
 * explicit `AI_MODEL_PROVIDER=anthropic` rollback path for local/dev.
 *
 * Credential name for xAI: `XAI_API_KEY` only (no alternate env aliases).
 */

export type ProductAiProvider = "xai" | "anthropic";

const PROVIDER_ALIASES: Readonly<Record<string, ProductAiProvider>> = {
  xai: "xai",
  anthropic: "anthropic",
};

/** Default xAI chat model when `XAI_MODEL` is unset. */
export const DEFAULT_XAI_MODEL = XAI_CHAT_MODELS.DEFAULT;

function normalizedProviderEnv(): string | undefined {
  const raw = process.env.AI_MODEL_PROVIDER?.trim().toLowerCase();
  return raw === "" ? undefined : raw;
}

/** Resolve the active product-AI vendor from environment. */
export function resolveProductAiProvider(): ProductAiProvider {
  const forced = normalizedProviderEnv();
  if (forced && forced in PROVIDER_ALIASES) {
    return PROVIDER_ALIASES[forced];
  }
  const xaiKey = process.env.XAI_API_KEY?.trim();
  if (xaiKey && forced !== "anthropic") {
    return "xai";
  }
  return "anthropic";
}

/** API key for the resolved provider. Never log or print this value. */
export function resolveProductAiApiKey(): string | undefined {
  const provider = resolveProductAiProvider();
  if (provider === "xai") {
    const key = process.env.XAI_API_KEY?.trim();
    return key || undefined;
  }
  const key = process.env.ANTHROPIC_API_KEY?.trim();
  return key || undefined;
}

/**
 * Model id sent to the provider and stored on the usage ledger.
 *
 * xAI: one model per deployment (`XAI_MODEL` or default). Anthropic: the
 * per-feature id from `AI_MODELS` (Haiku).
 */
export function resolveProductAiModel(catalogModelId: string): string {
  if (resolveProductAiProvider() === "xai") {
    const fromEnv = process.env.XAI_MODEL?.trim();
    return fromEnv || DEFAULT_XAI_MODEL;
  }
  return catalogModelId;
}

/** Whether the active provider has a non-empty API key (UI + refusal parity). */
export function isProductAiConfigured(): boolean {
  return resolveProductAiApiKey() !== undefined;
}
