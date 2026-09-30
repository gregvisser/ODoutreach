import { describe, expect, it } from "vitest";

import { AI_CAMPAIGN_CONFIRMATION_PHRASE } from "./policy";
import {
  aiCampaignDraftFromForm,
  aiCampaignDraftSchema,
  formatClientBriefPrefill,
  proposeAudienceFromBrief,
  splitAudienceLines,
} from "./audience";

const valid = {
  brief: "Contact facilities managers and offer a planned maintenance visit.",
  jobTitles: ["Facilities Manager"],
  countries: ["United Kingdom"],
  industries: ["Agriculture"],
  seniorities: ["Director"],
  companySizeMin: null,
  companySizeMax: null,
  targetContactCount: 10,
  creditBudgetTotal: 20,
  creditBudgetPerDay: 5,
  endsAt: null,
  confirmationPhrase: AI_CAMPAIGN_CONFIRMATION_PHRASE,
};

describe("AI campaign draft", () => {
  it("accepts a complete draft", () => {
    expect(aiCampaignDraftSchema.safeParse(valid).success).toBe(true);
  });

  it("refuses a wrong confirmation phrase, an unknown industry, and a daily budget above the total", () => {
    expect(aiCampaignDraftSchema.safeParse({ ...valid, confirmationPhrase: "go" }).success).toBe(false);
    expect(aiCampaignDraftSchema.safeParse({ ...valid, industries: ["Not A Real Industry"] }).success).toBe(false);
    expect(aiCampaignDraftSchema.safeParse({ ...valid, creditBudgetPerDay: 50, creditBudgetTotal: 10 }).success).toBe(false);
  });
});

describe("audience suggestion", () => {
  it("reads industries and countries that are written in the brief", () => {
    const suggestion = proposeAudienceFromBrief({
      briefText: "We sell into Agriculture in the United Kingdom.",
      knownJobTitles: ["Facilities Manager"],
      knownIndustries: [],
      rocketReachIndustries: ["Agriculture", "Dairy"],
    });
    expect(suggestion.industries).toContain("Agriculture");
    expect(suggestion.countries).toContain("United Kingdom");
    expect(suggestion.jobTitles).toEqual(["Facilities Manager"]);
  });

  it("keeps the saved brief text for the form", () => {
    const text = formatClientBriefPrefill({
      clientName: "Northwind",
      industry: "Facilities",
      notes: "Offer a maintenance contract.",
      serviceAreas: ["Planned maintenance"],
      targetIndustries: ["Agriculture"],
      targetJobTitles: ["Facilities Manager"],
      companySizes: ["50-200"],
    });
    expect(text).toContain("Northwind");
    expect(text).toContain("Facilities Manager");
    expect(text).toContain("Who to contact and the offer:");
  });

  it("splits lines without keeping duplicates", () => {
    expect(splitAudienceLines("Director\n director, Manager")).toEqual(["Director", "Manager"]);
  });
});

describe("AI campaign form", () => {
  const now = new Date("2026-09-30T12:00:00.000Z");
  const fields = {
    brief: valid.brief,
    jobTitles: "Facilities Manager",
    countries: "United Kingdom",
    industries: "Agriculture",
    seniorities: "",
    companySizeMin: "",
    companySizeMax: "",
    targetContactCount: "10",
    creditBudgetTotal: "20",
    creditBudgetPerDay: "5",
    endsAt: "",
    confirmationPhrase: AI_CAMPAIGN_CONFIRMATION_PHRASE,
  };

  it("accepts a typed confirmation and a future end date", () => {
    const parsed = aiCampaignDraftFromForm({ ...fields, endsAt: "2026-10-02" }, now);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.draft.endsAt?.toISOString()).toBe("2026-10-02T23:59:59.999Z");
  });

  it("refuses a past end date and a phrase that is not exact", () => {
    expect(aiCampaignDraftFromForm({ ...fields, endsAt: "2026-09-01" }, now)).toMatchObject({ ok: false });
    expect(aiCampaignDraftFromForm({ ...fields, confirmationPhrase: "start ai campaign" }, now).ok).toBe(false);
  });
});
