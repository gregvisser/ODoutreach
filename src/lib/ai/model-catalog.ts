/**
 * What each AI model costs, and how a call is turned into money.
 *
 * Greg invoices OpensDoors for API usage, so this file is a BILLING input, not
 * a convenience. Two rules follow from that, and both are load-bearing:
 *
 * 1. TOKENS ARE THE GROUND TRUTH; COST IS DERIVED.
 *    Every usage row stores the raw token counts AND the exact rates that were
 *    applied, so a wrong rate is a bookkeeping correction (recompute from the
 *    stored tokens) rather than lost revenue. The queue's warning that
 *    "retrofitted metering always under-counts" is really a warning about
 *    losing the tokens; those are captured from the first call.
 *
 * 2. MONEY IS INTEGER MICRO-USD, NEVER A FLOAT.
 *    A millionth of a dollar is small enough that rounding is irrelevant to an
 *    invoice and large enough that Int never overflows at our volumes
 *    (2^31 micro-USD is ~$2,147). Floats would drift across a month of
 *    summing, and an invoice that does not reconcile is worse than no invoice.
 *
 * The rate table is versioned. Changing a price means adding a NEW version and
 * leaving the old rows alone: historical calls must keep costing what they
 * cost, or last month's invoice changes retrospectively.
 */

/**
 * xAI Grok model ids that may appear in `XAI_MODEL` (or the built-in default).
 * Ids must match https://api.x.ai (see docs.x.ai/models). Each canonical id
 * must have a row in `XAI_RATES` — an unpriced model is refused.
 */
export const XAI_CHAT_MODELS = {
  /** Default when `XAI_MODEL` is unset and provider is xAI. */
  DEFAULT: "grok-4.6",
  GROK_4_6: "grok-4.6",
  GROK_4_7: "grok-4.7",
  GROK_4_FAST: "grok-4-fast-non-reasoning",
  GROK_4_20_NON_REASONING: "grok-4.20-0309-non-reasoning",
} as const;

export type XaiChatModelId = (typeof XAI_CHAT_MODELS)[keyof typeof XAI_CHAT_MODELS];

const XAI_CANONICAL_MODEL_IDS: ReadonlySet<string> = new Set(Object.values(XAI_CHAT_MODELS));

/**
 * Legacy / typo ids from early Azure config or the pre-2026-09 catalog. Mapped to
 * a priced canonical id before metering and before the chat/completions request.
 */
const XAI_MODEL_ID_ALIASES: Readonly<Record<string, XaiChatModelId>> = {
  "grok-4-6": "grok-4.6",
  "grok-4-0709": "grok-4.6",
};

/**
 * Resolve `XAI_MODEL` (or any xAI id string) to the canonical api.x.ai model id.
 * Returns null when the string is not a known canonical id or alias.
 */
export function resolveXaiChatModelId(model: string): XaiChatModelId | null {
  const trimmed = model.trim();
  const aliased = XAI_MODEL_ID_ALIASES[trimmed];
  if (aliased) {
    return aliased;
  }
  if (XAI_CANONICAL_MODEL_IDS.has(trimmed)) {
    return trimmed as XaiChatModelId;
  }
  return null;
}


/**
 * The rate table.
 *
 * !! UNVERIFIED AGAINST THE PUBLISHED PRICE LIST !!
 *
 * The first figures were entered on 2026-08-29 by a relay cycle that had no
 * network access to the vendor price list (WebFetch was denied in that
 * session), so they were from model knowledge and NOT from the live price list. That is exactly the
 * "from memory" failure the engineering standard forbids for anything that
 * gates a real-world action — and issuing an invoice is one.
 *
 * WHY THAT IS SAFE TO SHIP ANYWAY, and what is owed:
 *   * Every `AiUsageEvent` stores `inputTokens`, `outputTokens` and the two
 *     rates actually applied, plus this `version` string. If these numbers are
 *     wrong, every affected row can be recomputed exactly, because the tokens —
 *     the part that cannot be reconstructed later — are recorded correctly.
 *   * `RATES_VERIFIED` is false, and the spend screen says so on its face
 *     rather than presenting an unverified total as fact.
 *
 * TO CLOSE THIS: check the current per-MTok prices, correct the figures below
 * if they differ, add a NEW version entry, set `RATES_VERIFIED` true, and
 * recompute `costMicroUsd` for rows carrying the old version.
 */
export const RATE_VERSION = "2026-09-21-unverified" as const;

/**
 * False until a human has checked the numbers above against the published price
 * list. Read by the UI so an unverified total is never shown as a fact.
 */
export const RATES_VERIFIED = false;

/**
 * Rate versions that HAVE been checked against the published price list.
 *
 * Deliberately a list of versions rather than a single boolean, because the
 * ledger is historical: once a corrected price list ships, last month's rows
 * still carry the old version and must still be flagged as unverified, while
 * this month's are trustworthy. A screen that showed one flag for everything
 * would go green the moment the CURRENT rates were checked and quietly imply
 * the old invoices had been checked too.
 *
 * EMPTY ON PURPOSE. Cycle 85 could not reach the published prices (WebFetch
 * denied), and cycle 86 could not either. Nothing has been verified, so nothing is listed, and
 * `/settings/ai-spend` says so on its face.
 *
 * TO CLOSE THIS: check the current per-MTok prices at
 * https://docs.x.ai/docs/models, correct `RATES` above
 * if they differ (adding a NEW `RATE_VERSION` if they do), then add the
 * verified version string here and set `RATES_VERIFIED` true.
 */
const VERIFIED_RATE_VERSIONS: ReadonlySet<string> = new Set<string>();

/**
 * Whether the figures behind a ledger row can be quoted to a customer.
 *
 * Unknown versions are unverified. That direction matters: an unrecognised
 * string is a rate list nobody remembers checking, and treating it as sound is
 * how a guessed price reaches an invoice.
 */
export function isRateVersionVerified(version: string): boolean {
  return VERIFIED_RATE_VERSIONS.has(version);
}

/** Price per million tokens, in micro-USD. $1.00 / MTok === 1_000_000. */
export interface ModelRate {
  readonly inputPerMTokMicroUsd: number;
  readonly outputPerMTokMicroUsd: number;
}

/**
 * xAI rates — micro-USD per MTok. grok-4.6 / grok-4.7 / grok-4.20-* figures from
 * docs.x.ai/models (standard under-200k prompt tier, 2026-09-21). grok-4-fast-non-reasoning
 * still uses the prior placeholder row (not on that table); ledger stores tokens for recompute.
 */
const XAI_RATES: Readonly<Record<XaiChatModelId, ModelRate>> = {
  "grok-4.6": {
    inputPerMTokMicroUsd: 2_000_000,
    outputPerMTokMicroUsd: 6_000_000,
  },
  "grok-4.7": {
    inputPerMTokMicroUsd: 2_000_000,
    outputPerMTokMicroUsd: 6_000_000,
  },
  "grok-4-fast-non-reasoning": {
    inputPerMTokMicroUsd: 500_000,
    outputPerMTokMicroUsd: 1_500_000,
  },
  "grok-4.20-0309-non-reasoning": {
    inputPerMTokMicroUsd: 1_250_000,
    outputPerMTokMicroUsd: 2_500_000,
  },
};

const RATES: Readonly<Record<string, ModelRate>> = {
  ...XAI_RATES,
};

/**
 * Look up the rate for a model.
 *
 * Returns null for a model we hold no price for. Callers must treat that as a
 * REFUSAL to make the call, not as "assume it is free": a call whose cost
 * cannot be computed is a call that cannot be invoiced, which is the precise
 * failure this whole file exists to prevent. `meterAiCall` enforces that.
 */
export function getModelRate(model: string): ModelRate | null {
  const xaiCanonical = resolveXaiChatModelId(model);
  if (xaiCanonical) {
    return RATES[xaiCanonical] ?? null;
  }
  return RATES[model] ?? null;
}

/** Token counts as reported by the API for a single call. */
export interface TokenUsage {
  readonly inputTokens: number;
  readonly outputTokens: number;
}

/**
 * Cost of one call, in integer micro-USD.
 *
 * Rounds half-up at the micro-dollar. Rounding DOWN would systematically
 * under-bill across thousands of small classification calls, which is the
 * direction of error that costs Greg money, so it is the one to avoid.
 */
export function computeCostMicroUsd(usage: TokenUsage, rate: ModelRate): number {
  const input = (usage.inputTokens * rate.inputPerMTokMicroUsd) / 1_000_000;
  const output = (usage.outputTokens * rate.outputPerMTokMicroUsd) / 1_000_000;
  return Math.round(input + output);
}

/**
 * Render micro-USD as a currency string for the screen.
 *
 * Shows enough decimal places that a single cheap call does not display as
 * "$0.00" — staff reading a spend page need to see that a call happened and
 * cost something, otherwise the meter looks broken.
 */
export function formatMicroUsd(microUsd: number): string {
  const dollars = microUsd / 1_000_000;
  if (microUsd !== 0 && Math.abs(dollars) < 0.01) {
    return `$${dollars.toFixed(6)}`;
  }
  return `$${dollars.toFixed(2)}`;
}
