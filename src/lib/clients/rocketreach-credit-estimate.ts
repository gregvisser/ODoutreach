import { ROCKETREACH_MAX_IMPORT } from "@/lib/clients/rocketreach-import-cap";

/**
 * Worst-case credits for one staff click or one plan run.
 * RocketReach search is free. A lookup spends 1 credit only when contact
 * details come back. People we already know are skipped before that call.
 */
export function rocketReachClickCostEstimate(maxResults: number): {
  maxCredits: number;
  headline: string;
  detail: string;
} {
  const requested = Number.isFinite(maxResults) ? Math.trunc(maxResults) : ROCKETREACH_MAX_IMPORT;
  const maxCredits = Math.min(ROCKETREACH_MAX_IMPORT, Math.max(0, requested));
  return {
    maxCredits,
    headline: `This click can use up to ${String(maxCredits)} RocketReach credit${maxCredits === 1 ? "" : "s"}.`,
    detail:
      "Search is free. Each profile lookup that returns contact details uses 1 credit. People already in Universe or this client are skipped before a lookup, so the spend can be lower. Opening this page does not use credits.",
  };
}
