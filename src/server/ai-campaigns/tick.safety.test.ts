import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();
const tick = readFileSync(join(root, "src/server/ai-campaigns/tick.ts"), "utf8");
const control = readFileSync(join(root, "src/server/ai-campaigns/control.ts"), "utf8");
const send = readFileSync(join(root, "src/server/email-sequences/send-introduction.ts"), "utf8");
const route = readFileSync(join(root, "src/app/api/internal/scheduled-outreach/v1/route.ts"), "utf8");

describe("AI campaign safety wiring", () => {
  it("reuses the existing send, harvest, draft, and review paths", () => {
    expect(tick).toContain("sendSequenceStepBatch");
    expect(tick).toContain("applyUniverseHarvest");
    expect(tick).toContain("draftSequenceForClient");
    expect(tick).toContain("reviewCampaign");
    expect(tick).toContain("executeSavedResearchPlan");
    expect(tick).not.toContain("autoPrepareSequenceForLaunch");
    expect(tick).not.toContain("openTracking");
    expect(tick).not.toContain("bypassCooldown: true");
    expect(tick).not.toMatch(/data:\s*\{[^}]*isSuppressed:\s*false/);
    expect(tick).not.toContain("autonomousSendEnabled: true");
  });

  it("does not turn Machine sending on for the client", () => {
    expect(control).not.toContain("autonomousSendEnabled");
    expect(send).toContain("aiCampaignAllowsAutomatedSend");
  });

  it("runs from the existing five-minute advance, after pacing resume", () => {
    expect(route).toContain("tickAiCampaignsForClient");
    expect(route).toContain("resumePacingHeldSends");
    const pacing = route.indexOf("resumePacingHeldSends");
    const ai = route.indexOf("tickAiCampaignsForClient(clientId)");
    expect(pacing).toBeGreaterThan(-1);
    expect(ai).toBeGreaterThan(pacing);
  });
});
