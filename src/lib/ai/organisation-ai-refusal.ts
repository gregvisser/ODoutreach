/**
 * Staff copy for organisation-level AI refusals. Pure, so the AI campaign
 * state machine (lib) and the server-side failure messages share one wording.
 */

/** Refusal code recorded when an organisation's monthly AI spend cap is reached. */
export const ORGANISATION_AI_CAP_CODE = "organisation_ai_cap";

/** Staff copy when this organisation's own monthly AI spend cap is reached. */
export const ORGANISATION_AI_CAP_MESSAGE =
  "Your organisation has reached its AI spending limit for this month, so AI features are paused. Nothing was run and nothing was charged. They resume automatically on the 1st of next month (UTC), or sooner if Bidlow raises the limit.";

/** Staff copy when the platform has switched AI drafting off for this organisation. */
export const ORGANISATION_AI_FEATURE_OFF_MESSAGE =
  "AI drafting and review are switched off for your organisation. Nothing was run and nothing was charged. Ask Bidlow to switch them back on.";

/** Organisation-level refusals, or null for anything else. */
export function describeOrganisationAiRefusal(reason: string): string | null {
  if (reason === ORGANISATION_AI_CAP_CODE) return ORGANISATION_AI_CAP_MESSAGE;
  if (reason === "organisation_feature_off") return ORGANISATION_AI_FEATURE_OFF_MESSAGE;
  return null;
}
