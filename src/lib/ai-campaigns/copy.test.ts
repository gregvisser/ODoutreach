import { describe, expect, it } from "vitest";

import { aiCampaignDecisionMessage, aiCampaignPlanSummary, aiCampaignStageSentence, aiCampaignStatusLabel } from "./copy";
import { decideAiCampaignTick, aiCampaignSnapshot } from "./state-machine";

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
    expect(text).toMatch(/do not open Review recipients/i);
    expect(text).not.toMatch(/launch again/i);
  });

  it("says a solid near-miss was approved without waiting for staff", () => {
    const decision = decideAiCampaignTick(aiCampaignSnapshot({
      status: "REVIEWING",
      reviewScore: 72,
      reviewRounds: 3,
      draftReady: true,
    }));
    expect(decision.type).toBe("approve");
    if (decision.type !== "approve") return;
    const message = aiCampaignDecisionMessage(decision);
    expect(message).toMatch(/scored 72/);
    expect(message).toMatch(/solid writing/);
    expect(message).toMatch(/without waiting for a member of staff/);
    expect(message).not.toMatch(/were not sent|Resume|Review recipients/i);
  });
});
