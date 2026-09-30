import { describe, expect, it } from "vitest";

import { aiCampaignPlanSummary, aiCampaignStageSentence, aiCampaignStatusLabel } from "./copy";

describe("AI campaign copy", () => {
  it("uses plain words for the stage a person sees", () => {
    const text = [
      aiCampaignStatusLabel("RUNNING"),
      aiCampaignStageSentence("RUNNING", null),
      aiCampaignStageSentence("LAUNCHING", null),
      ...aiCampaignPlanSummary({
        targetContactCount: 25,
        creditBudgetTotal: 40,
        creditBudgetPerDay: 8,
        endsAtLabel: null,
        companySizeLabel: null,
      }),
    ].join("\n");
    expect(text).toMatch(/Sending/);
    expect(text).not.toMatch(/cron|idempoten|webhook|payload|enrol/i);
    expect(text).toMatch(/do not launch again|by hand|Open tracking stays off|do-not-contact/i);
    expect(text).not.toMatch(/launch again/i);
  });
});
