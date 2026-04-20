import { describe, expect, it } from "vitest";

import type { LaunchReadinessPanelInput } from "./client-launch-state";
import {
  buildClientWorkflowSteps,
  buildLaunchReadinessRows,
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

function basePanel(overrides: Partial<LaunchReadinessPanelInput> = {}): LaunchReadinessPanelInput {
  return {
    ...baseInput({}),
    suppressionLatestSyncAt: null,
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

describe("buildLaunchReadinessRows", () => {
  it("returns seven module rows with stable hrefs", () => {
    const rows = buildLaunchReadinessRows(basePanel({ clientId: "abc" }));
    expect(rows).toHaveLength(7);
    expect(rows.map((r) => r.id).join("|")).toBe(
      "brief|mailboxes|sources|suppression|contacts|outreach|activity",
    );
    expect(rows[0]?.href).toBe("/clients/abc/brief");
    expect(rows[6]?.href).toBe("/clients/abc/activity");
  });

  it("marks suppression as Not configured when no sheet sources", () => {
    const row = buildLaunchReadinessRows(basePanel({ suppressionSheetCount: 0 })).find(
      (r) => r.id === "suppression",
    );
    expect(row?.pillStatus).toBe("not_started");
    expect(row?.metric).toBe("Not configured");
  });

  it("marks suppression as Needs sync when sources exist but never synced", () => {
    const row = buildLaunchReadinessRows(
      basePanel({
        suppressionSheetCount: 1,
        googleSheetsEnvReady: true,
        suppressionLatestSyncAt: null,
      }),
    ).find((r) => r.id === "suppression");
    expect(row?.pillStatus).toBe("needs_attention");
    expect(row?.metric).toBe("Needs sync");
  });

  it("marks mailboxes as Reduced capacity when connected but below recommended pool", () => {
    const row = buildLaunchReadinessRows(
      basePanel({ connectedSendingCount: 3, recommendedMailboxCount: 5 }),
    ).find((r) => r.id === "mailboxes");
    expect(row?.pillStatus).toBe("reduced_capacity");
    expect(row?.metric).toContain("3 connected");
    expect(row?.metric).toContain("/day capacity");
  });

  it("uses Monitoring for activity when governed sends exist", () => {
    const row = buildLaunchReadinessRows(
      basePanel({ latestActivityLabel: "2026-01-01 12:00" }),
    ).find((r) => r.id === "activity");
    expect(row?.pillStatus).toBe("monitoring");
    expect(row?.metric).toBe("Recent sends available");
  });

  it("does not embed env key names in row metrics", () => {
    const rows = buildLaunchReadinessRows(basePanel({ rocketReachEnvReady: true }));
    const blob = JSON.stringify(rows);
    expect(blob).not.toMatch(/ROCKETREACH_API|GOOGLE_SERVICE_ACCOUNT/i);
  });

  it("surfaces approved sequence hint on the outreach row when pilot-ready", () => {
    const row = buildLaunchReadinessRows(
      basePanel({
        outreachPilotRunnable: true,
        approvedSequencesCount: 2,
        approvedIntroductionTemplatesCount: 1,
      }),
    ).find((r) => r.id === "outreach");
    expect(row?.pillStatus).toBe("ready");
    expect(row?.metric).toContain("2 approved sequences");
  });

  it("hints that a sequence is pending approval when introduction templates exist but no approved sequence", () => {
    const row = buildLaunchReadinessRows(
      basePanel({
        outreachPilotRunnable: true,
        approvedSequencesCount: 0,
        approvedIntroductionTemplatesCount: 1,
      }),
    ).find((r) => r.id === "outreach");
    expect(row?.metric).toContain("sequence pending approval");
  });

  it("omits sequence hint entirely when both signals are absent", () => {
    const row = buildLaunchReadinessRows(
      basePanel({ outreachPilotRunnable: true }),
    ).find((r) => r.id === "outreach");
    expect(row?.metric).toBe("Pilot ready");
  });
});
