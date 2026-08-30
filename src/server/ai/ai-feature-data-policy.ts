import type { AiFeature } from "@/generated/prisma/client";

/**
 * What each AI feature sends, and to whom — read by `metered-call.ts` before
 * any network call is allowed.
 *
 * Same shape as `src/lib/monitoring/sentry-data-collection.ts`, and for the
 * same reason: `AI_FEATURE_DATA_POLICY` is typed `Record<AiFeature, ...>`, so
 * TypeScript itself refuses to compile a seventh feature that has not stated
 * what it sends. A convention ("remember to check for personal data") is
 * retrofitted privacy review with extra steps; a type error is not optional.
 *
 * CR-10 (raised cycle 122, `.bidlow/GRADES.json`): CR-05's Art.28 DPA work
 * covered Sentry, Resend and RocketReach. Anthropic was never assessed, so it
 * is absent from `COVERED_PROCESSORS` below. Whether to pursue that DPA is a
 * commercial decision that stays open — this file only declares what is true
 * today, and today that is: no allowance is recorded for Anthropic.
 *
 * `carriesPersonalData: true` means the call sends a real prospect's own
 * words — their name, address, or something they personally wrote — to the
 * named vendor. Aggregated statistics computed from a client's own send
 * history, a client's own template or campaign copy, and a client's own
 * mailbox identity are NOT a prospect's personal data and are declared false.
 */

export type AiVendor = "ANTHROPIC";

export interface AiFeatureDataPolicyEntry {
  readonly vendor: AiVendor;
  readonly carriesPersonalData: boolean;
  /** One sentence a non-coder can check against what the feature actually builds and sends. */
  readonly whatItSends: string;
}

export const AI_FEATURE_DATA_POLICY: Readonly<Record<AiFeature, AiFeatureDataPolicyEntry>> = {
  REPLY_CLASSIFICATION: {
    vendor: "ANTHROPIC",
    carriesPersonalData: true,
    whatItSends:
      "The prospect's own inbound reply — its subject line and up to 2,000 characters of body text, verbatim.",
  },
  SEQUENCE_DRAFTING: {
    vendor: "ANTHROPIC",
    carriesPersonalData: false,
    whatItSends:
      "The client's own sequence-drafting brief (audience, offer, tone) — no prospect is named or quoted.",
  },
  CAMPAIGN_REVIEW: {
    vendor: "ANTHROPIC",
    carriesPersonalData: false,
    whatItSends:
      "The client's own sequence steps and template copy for one campaign — no prospect is named or quoted.",
  },
  SEND_TIME_ADVICE: {
    vendor: "ANTHROPIC",
    carriesPersonalData: false,
    whatItSends:
      "Aggregated send-and-reply counts by time slot for one client, computed before the model is called — no prospect is named or quoted.",
  },
  REP_PERFORMANCE: {
    vendor: "ANTHROPIC",
    carriesPersonalData: false,
    whatItSends:
      "Aggregated send-and-reply counts by sending mailbox for one client, computed before the model is called — no prospect is named or quoted.",
  },
  TITLE_MESSAGE_FIT: {
    vendor: "ANTHROPIC",
    carriesPersonalData: false,
    whatItSends:
      "Aggregated send-and-reply counts by job-title family and campaign for one client, computed before the model is called — no prospect is named or quoted.",
  },
};

/**
 * Vendors with a recorded Art.28 processor allowance covering prospect
 * personal data. Deliberately empty of `"ANTHROPIC"` — see CR-10 above.
 */
export const COVERED_PROCESSORS: ReadonlySet<AiVendor> = new Set<AiVendor>([]);

/**
 * True when a feature is declared to carry a prospect's personal data to a
 * vendor with no recorded processor allowance for it. `runMeteredAiCall`
 * refuses before any network call — and before any money is spent — when
 * this is true, regardless of whether an API key is configured.
 */
export function isPersonalDataUncovered(feature: AiFeature): boolean {
  const policy = AI_FEATURE_DATA_POLICY[feature];
  return policy.carriesPersonalData && !COVERED_PROCESSORS.has(policy.vendor);
}
