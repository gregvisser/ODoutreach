import { afterEach, describe, expect, it, vi } from "vitest";
import { areAiFeaturesEnabled } from "./ai-switch";

afterEach(() => vi.unstubAllEnvs());

describe("Human sending AI boundaries", () => {
  it("leaves training and reply gates independent while outreach defaults off", () => {
    vi.stubEnv("AI_FEATURES", "");
    vi.stubEnv("AI_OUTREACH_FEATURES", "");
    expect(areAiFeaturesEnabled("SEQUENCE_DRAFTING")).toBe(false);
    expect(areAiFeaturesEnabled("TRAINING_ASSISTANT")).toBe(true);
    expect(areAiFeaturesEnabled("REPLY_CLASSIFICATION")).toBe(true);
  });
  it("requires recognised opt-in and honours the global stop", () => {
    vi.stubEnv("AI_FEATURES", "on");
    vi.stubEnv("AI_OUTREACH_FEATURES", "typo");
    expect(areAiFeaturesEnabled("CAMPAIGN_REVIEW")).toBe(false);
    vi.stubEnv("AI_OUTREACH_FEATURES", " ON ");
    expect(areAiFeaturesEnabled("CAMPAIGN_REVIEW")).toBe(true);
    vi.stubEnv("AI_FEATURES", " OFF ");
    expect(areAiFeaturesEnabled("CAMPAIGN_REVIEW")).toBe(false);
    expect(areAiFeaturesEnabled("TRAINING_ASSISTANT")).toBe(false);
  });
});
