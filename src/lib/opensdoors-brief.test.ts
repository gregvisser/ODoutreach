import { describe, expect, it } from "vitest";

import {
  briefLooksFilled,
  computeOnboardingBriefCompletion,
  getClientSenderProfile,
  mergeBriefIntoFormData,
  ONBOARDING_READINESS_KEYS,
  ONBOARDING_READINESS_LABELS,
  parseOpensDoorsBrief,
} from "./opensdoors-brief";

describe("parseOpensDoorsBrief / mergeBriefIntoFormData", () => {
  it("merges brief fields without dropping legacy keys", () => {
    const merged = mergeBriefIntoFormData(
      { emailSheetId: "abc123", extra: 1 },
      { businessAddress: "1 High St", offer: "Free audit" },
    );
    expect(merged.emailSheetId).toBe("abc123");
    expect(merged.extra).toBe(1);
    expect(merged.businessAddress).toBe("1 High St");
    expect(merged.offer).toBe("Free audit");
  });

  it("detects when brief has content", () => {
    expect(briefLooksFilled({})).toBe(false);
    expect(briefLooksFilled({ offer: "  x  " })).toBe(true);
  });

  it("parses known keys from formData", () => {
    const brief = parseOpensDoorsBrief({
      offer: "Hello",
      unknown: "ignored",
    });
    expect(brief.offer).toBe("Hello");
    expect((brief as Record<string, string>).unknown).toBeUndefined();
  });
});

describe("computeOnboardingBriefCompletion", () => {
  it("returns empty when no readiness fields are set", () => {
    const r = computeOnboardingBriefCompletion({});
    expect(r.status).toBe("empty");
    expect(r.completedCount).toBe(0);
    expect(r.totalCount).toBe(ONBOARDING_READINESS_KEYS.length);
    expect(r.missingKeys.length).toBe(r.totalCount);
    expect(r.percent).toBe(0);
    expect(r.nextRecommendedLabel).toBe(ONBOARDING_READINESS_LABELS.businessAddress);
  });

  it("marks ready when all required fields are non-empty", () => {
    const formData = Object.fromEntries(
      ONBOARDING_READINESS_KEYS.map((k) => [k, "ok"]),
    );
    const r = computeOnboardingBriefCompletion(formData);
    expect(r.status).toBe("ready");
    expect(r.percent).toBe(100);
    expect(r.missingKeys).toEqual([]);
    expect(r.nextRecommendedLabel).toBeNull();
  });

  it("is partial when some fields are missing", () => {
    const r = computeOnboardingBriefCompletion({
      businessAddress: "1 High St",
      offer: "Audit",
    });
    expect(r.status).toBe("partial");
    expect(r.missingLabels.length).toBeGreaterThan(0);
    expect(r.completedCount).toBe(2);
  });

  it("does not treat whitespace-only strings as complete", () => {
    const r = computeOnboardingBriefCompletion({
      businessAddress: "   ",
    });
    expect(r.missingKeys).toContain("businessAddress");
  });

  it("readiness labels contain no secret-like placeholders", () => {
    const labels = Object.values(ONBOARDING_READINESS_LABELS).join(" ");
    expect(labels.toLowerCase()).not.toContain("api");
    expect(labels.toLowerCase()).not.toContain("password");
    expect(labels.toLowerCase()).not.toContain("secret");
  });

  it("includes emailSignature as a readiness field", () => {
    expect(ONBOARDING_READINESS_KEYS).toContain("emailSignature");
    expect(ONBOARDING_READINESS_LABELS.emailSignature).toMatch(/signature/i);
    expect(ONBOARDING_READINESS_LABELS.emailSignature).toContain("{{email_signature}}");
  });
});

describe("getClientSenderProfile", () => {
  it("resolves company name from the client row", () => {
    const profile = getClientSenderProfile({
      client: { name: "Acme Ltd" },
      formData: {},
    });
    expect(profile.senderCompanyName).toBe("Acme Ltd");
    expect(profile.emailSignature).toBe("");
    expect(profile.tradingName).toBeNull();
    expect(profile.businessAddress).toBeNull();
  });

  it("returns structured signature from the brief", () => {
    const profile = getClientSenderProfile({
      client: { name: "Acme Ltd" },
      formData: {
        emailSignature: "  Jane Doe\nHead of Growth\njane@acme.co ",
        tradingName: "Acme Trading Co",
        businessAddress: "1 High St",
      },
    });
    expect(profile.senderCompanyName).toBe("Acme Ltd");
    expect(profile.emailSignature).toBe("Jane Doe\nHead of Growth\njane@acme.co");
    expect(profile.tradingName).toBe("Acme Trading Co");
    expect(profile.businessAddress).toBe("1 High St");
  });

  it("treats whitespace-only brief fields as unset", () => {
    const profile = getClientSenderProfile({
      client: { name: "Acme" },
      formData: {
        emailSignature: "   ",
        tradingName: "   ",
        businessAddress: "\n\t ",
      },
    });
    expect(profile.emailSignature).toBe("");
    expect(profile.tradingName).toBeNull();
    expect(profile.businessAddress).toBeNull();
  });

  it("tolerates malformed formData", () => {
    const profile = getClientSenderProfile({
      client: { name: "Acme" },
      formData: null,
    });
    expect(profile.senderCompanyName).toBe("Acme");
    expect(profile.emailSignature).toBe("");
    expect(profile.tradingName).toBeNull();
  });
});
