import { describe, expect, it } from "vitest";

import {
  buildClientWorkflowSteps,
  deriveLaunchStageLabel,
} from "./client-launch-state";
import { computeOnboardingBriefCompletion } from "./opensdoors-brief";

const emptyBrief = computeOnboardingBriefCompletion({});
const readyBrief = computeOnboardingBriefCompletion(
  Object.fromEntries(
    [
      "businessAddress",
      "targetGeography",
      "targetCustomerProfile",
      "usps",
      "offer",
      "exclusions",
      "campaignObjective",
      "senderIdentityNotes",
      "mailboxSetupNotes",
      "sequenceNotes",
    ].map((k) => [k, "x"]),
  ),
);

function baseInput(overrides: Partial<Parameters<typeof deriveLaunchStageLabel>[0]>) {
  return {
    clientId: "c1",
    brief: emptyBrief,
    connectedSendingCount: 0,
    recommendedMailboxCount: 5,
    suppressionSheetCount: 0,
    googleSheetsEnvReady: true,
    contactsTotal: 0,
    contactsEligible: 0,
    contactsSuppressedCount: 0,
    rocketReachEnvReady: false,
    outreachPilotRunnable: false,
    latestActivityLabel: null,
    ...overrides,
  };
}

describe("deriveLaunchStageLabel", () => {
  it("returns Pilot-ready when brief ready and pilot can run", () => {
    expect(
      deriveLaunchStageLabel(
        baseInput({
          brief: readyBrief,
          outreachPilotRunnable: true,
        }),
      ),
    ).toBe("Pilot-ready");
  });

  it("returns Brief not started when brief empty", () => {
    expect(deriveLaunchStageLabel(baseInput({}))).toBe("Brief not started");
  });
});

describe("buildClientWorkflowSteps", () => {
  it("returns seven steps with client-scoped hrefs", () => {
    const steps = buildClientWorkflowSteps(baseInput({ clientId: "abc" }));
    expect(steps).toHaveLength(7);
    expect(steps[0]?.href).toBe("/clients/abc/brief");
    expect(steps.map((s) => s.label).join("|")).toContain("Sources");
  });

  it("does not embed env key names in steps", () => {
    const steps = buildClientWorkflowSteps(
      baseInput({ rocketReachEnvReady: true, clientId: "x" }),
    );
    const blob = JSON.stringify(steps);
    expect(blob).not.toMatch(/ROCKETREACH_API|GOOGLE_SERVICE_ACCOUNT/i);
  });
});
