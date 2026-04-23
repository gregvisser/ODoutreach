import { describe, expect, it } from "vitest";

import {
  briefLooksFilled,
  computeOnboardingBriefCompletion,
  getClientSenderProfile,
  getLegacyBriefReadinessState,
  LEGACY_BRIEF_READINESS_KEYS,
  mergeBriefIntoFormData,
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

  it("backfills v2 fields from legacy", () => {
    const brief = parseOpensDoorsBrief({
      campaignObjective: "Grow",
      offer: "Audit",
      usps: "Speed",
    });
    expect(brief.valueProposition).toBe("Grow");
    expect(brief.coreOffer).toBe("Audit");
    expect(brief.differentiators).toBe("Speed");
  });
});

describe("getLegacyBriefReadinessState (v1 11 keys)", () => {
  it("returns empty when no readiness fields are set", () => {
    const r = getLegacyBriefReadinessState({});
    expect(r.status).toBe("empty");
    expect(r.totalCount).toBe(LEGACY_BRIEF_READINESS_KEYS.length);
  });

  it("marks ready when all legacy string fields are non-empty", () => {
    const formData = Object.fromEntries(
      LEGACY_BRIEF_READINESS_KEYS.map((k) => [k, "ok"]),
    );
    const r = getLegacyBriefReadinessState(formData);
    expect(r.status).toBe("ready");
    expect(r.missingKeys).toEqual([]);
  });

  it("legacy keys still include emailSignature (historical data only)", () => {
    expect(LEGACY_BRIEF_READINESS_KEYS).toContain("emailSignature");
  });
});

describe("computeOnboardingBriefCompletion (single-arg legacy path)", () => {
  it("uses legacy 11-key gate when no context is passed", () => {
    const r = computeOnboardingBriefCompletion({});
    expect(r.status).toBe("empty");
  });
});

describe("computeOnboardingBriefCompletion (v2 with context)", () => {
  const ctx = {
    client: {
      name: "Test Co",
      website: "https://test.example",
      industry: "HVAC",
      briefBusinessAddress: { line1: "1 St", city: "L", country: "UK" },
      briefMainContact: { firstName: "A", lastName: "B", email: "a@test.example" },
      briefLinkedinUrl: "https://li.co/c",
      briefAssignedAccountManagerId: "m1",
    },
    taxonomyCounts: {
      SERVICE_AREA: 1,
      TARGET_INDUSTRY: 1,
      COMPANY_SIZE: 1,
      JOB_TITLE: 1,
    },
  } as const;

  it("returns ready when v2 checklist is complete", () => {
    const fd = {
      valueProposition: "V",
      coreOffer: "C",
      differentiators: "D",
      exclusions: "E",
      complianceNotes: "Co",
      proofNotes: "P",
      targetGeography: "UK",
      targetCustomerProfile: "P",
    };
    const r = computeOnboardingBriefCompletion(fd, ctx);
    expect(r.status).toBe("ready");
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
  });

  it("returns structured signature from the brief (legacy data)", () => {
    const profile = getClientSenderProfile({
      client: { name: "Acme Ltd" },
      formData: {
        emailSignature: "  Jane\nAcme",
        businessAddress: "1 High St",
      },
    });
    expect(profile.emailSignature).toBe("Jane\nAcme");
  });
});
