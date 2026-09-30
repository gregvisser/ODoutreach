import { describe, expect, it } from "vitest";

import { aiCampaignDecisionMessage, aiCampaignPlanSummary, aiCampaignStageSentence, aiCampaignStatusLabel } from "./copy";
import { aiCampaignScoreReleaseMessage } from "./policy";

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

  it("records a below-line score as a send, not a stop", () => {
    const released = aiCampaignDecisionMessage({
      type: "approve",
      qualityNote: aiCampaignScoreReleaseMessage(72, 3),
    });
    expect(released).toMatch(/scored 72 after 3 checks/);
    expect(released).toMatch(/sending continues/);
    expect(released).not.toMatch(/were not sent/);
    expect(aiCampaignDecisionMessage({ type: "approve" })).toMatch(/passed the check/);
  });
});
