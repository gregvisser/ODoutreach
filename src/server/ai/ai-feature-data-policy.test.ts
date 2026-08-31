import { describe, expect, it } from "vitest";

import {
  AI_FEATURE_DATA_POLICY,
  COVERED_PROCESSORS,
  isPersonalDataUncovered,
} from "./ai-feature-data-policy";

/**
 * The six features shipped in row 80 (28-29 August) plus TRAINING_ASSISTANT
 * (row 149, 31 August). If an eighth is added without an entry here,
 * `AI_FEATURE_DATA_POLICY`'s `Record<AiFeature, ...>` type fails to compile —
 * this list is a readable mirror of that guarantee, not a substitute for it.
 */
const ALL_FEATURES = [
  "REPLY_CLASSIFICATION",
  "SEQUENCE_DRAFTING",
  "CAMPAIGN_REVIEW",
  "SEND_TIME_ADVICE",
  "REP_PERFORMANCE",
  "TITLE_MESSAGE_FIT",
  "TRAINING_ASSISTANT",
] as const;

describe("AI_FEATURE_DATA_POLICY", () => {
  it("declares every shipped feature — nothing inherits silence", () => {
    expect(Object.keys(AI_FEATURE_DATA_POLICY).sort()).toEqual([...ALL_FEATURES].sort());
  });

  it("is the ONLY feature declared to carry a prospect's own personal data — REPLY_CLASSIFICATION", () => {
    const personalDataFeatures = ALL_FEATURES.filter(
      (feature) => AI_FEATURE_DATA_POLICY[feature].carriesPersonalData,
    );
    expect(personalDataFeatures).toEqual(["REPLY_CLASSIFICATION"]);
  });

  it("declares the other six as carrying aggregated statistics or the client's own content, not a prospect's", () => {
    const nonPersonalDataFeatures = ALL_FEATURES.filter(
      (feature) => feature !== "REPLY_CLASSIFICATION",
    );
    for (const feature of nonPersonalDataFeatures) {
      expect(AI_FEATURE_DATA_POLICY[feature].carriesPersonalData).toBe(false);
    }
  });

  it("names Anthropic as the vendor for every feature — the only model provider this codebase calls", () => {
    for (const feature of ALL_FEATURES) {
      expect(AI_FEATURE_DATA_POLICY[feature].vendor).toBe("ANTHROPIC");
    }
  });
});

describe("COVERED_PROCESSORS (CR-10)", () => {
  it("does not cover Anthropic — no Art.28 allowance has been recorded for it", () => {
    expect(COVERED_PROCESSORS.has("ANTHROPIC")).toBe(false);
  });
});

describe("isPersonalDataUncovered", () => {
  it("is true for REPLY_CLASSIFICATION today, because it carries personal data to an uncovered vendor", () => {
    expect(isPersonalDataUncovered("REPLY_CLASSIFICATION")).toBe(true);
  });

  it("is false for the other six features today", () => {
    const nonPersonalDataFeatures = ALL_FEATURES.filter(
      (feature) => feature !== "REPLY_CLASSIFICATION",
    );
    for (const feature of nonPersonalDataFeatures) {
      expect(isPersonalDataUncovered(feature)).toBe(false);
    }
  });
});
