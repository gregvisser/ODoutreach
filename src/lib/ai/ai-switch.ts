import type { AiFeature } from "@/generated/prisma/client";

const OFF_VALUES = new Set(["off", "false", "0", "no", "disabled"]);
const ON_VALUES = new Set(["on", "true", "1", "yes", "enabled"]);

/** Optional outreach assistance is not part of the Human sending release. */
const OUTREACH_FEATURES = new Set<AiFeature>([
  "SEQUENCE_DRAFTING", "CAMPAIGN_REVIEW", "SEND_TIME_ADVICE",
  "REP_PERFORMANCE", "TITLE_MESSAGE_FIT",
]);

/** Global stop plus explicit opt-in for optional outreach AI.
 * Reply processing and training assistance retain their existing gates.
 */
export function areAiFeaturesEnabled(feature?: AiFeature): boolean {
  const raw = process.env.AI_FEATURES;
  if (raw !== undefined && OFF_VALUES.has(raw.trim().toLowerCase())) return false;
  if (feature && OUTREACH_FEATURES.has(feature)) {
    return ON_VALUES.has((process.env.AI_OUTREACH_FEATURES ?? "").trim().toLowerCase());
  }
  return true;
}
