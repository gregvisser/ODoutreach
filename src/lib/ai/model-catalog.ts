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

/** Models this application is allowed to call. */
export const AI_MODELS = {
  /**
   * Reply classification. Deliberately the cheapest capable model: this runs on
   * every inbound reply, on a 15-minute cron, for every client. The job is a
   * five-way label on a short piece of text — it does not need a frontier
   * model, and picking one would multiply the client's bill for no accuracy.
   */
  REPLY_CLASSIFICATION: "claude-haiku-4-5-20251001",
  /**
   * Sequence drafting. Deliberately the SAME model as classification, and the
   * reason is billing rather than capability: this table is an invoice input,
   * and the one rate it holds is already flagged unverified. Adding a second
   * model would mean entering a second price nobody has checked, doubling the
   * unverified surface of a bill Greg has to defend. Writing five short cold
   * emails from a brief is well within this model; if a future cycle finds the
   * copy wants a larger model, that is a deliberate change made at the same
   * time as a verified price for it.
   */
  SEQUENCE_DRAFTING: "claude-haiku-4-5-20251001",
  /**
   * Campaign review. The SAME model again, for the same billing reason: the one
   * rate in this table is still flagged unverified, and a second model would
   * mean a second unchecked price on the same invoice. Judging five short
   * emails against a stated rubric is well within this model.
   */
  CAMPAIGN_REVIEW: "claude-haiku-4-5-20251001",
} as const;

export type AiModelId = (typeof AI_MODELS)[keyof typeof AI_MODELS];

/**
 * The rate table.
 *
 * !! UNVERIFIED AGAINST THE PUBLISHED PRICE LIST !!
 *
 * These figures were entered on 2026-08-29 by a relay cycle that had no network
 * access to docs.claude.com (WebFetch was denied in that session), so they are
 * from model knowledge and NOT from the live price list. That is exactly the
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
export const RATE_VERSION = "2026-08-29-unverified" as const;

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
 * denied), and cycle 86 could not either — WebFetch and the `claude-api` skill
 * were both denied again. Nothing has been verified, so nothing is listed, and
 * `/settings/ai-spend` says so on its face.
 *
 * TO CLOSE THIS: check the current per-MTok prices at
 * https://docs.claude.com/en/docs/about-claude/pricing, correct `RATES` above
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

const RATES: Readonly<Record<AiModelId, ModelRate>> = {
  // $1.00 / MTok in, $5.00 / MTok out.
  "claude-haiku-4-5-20251001": {
    inputPerMTokMicroUsd: 1_000_000,
    outputPerMTokMicroUsd: 5_000_000,
  },
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
  return RATES[model as AiModelId] ?? null;
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
