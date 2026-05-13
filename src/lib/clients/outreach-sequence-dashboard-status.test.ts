import { describe, expect, it } from "vitest";

import type { SequenceLaunchReadiness } from "@/lib/email-sequences/launch-readiness";
import { deriveOutreachDashboardStatusLabel } from "@/lib/clients/outreach-sequence-dashboard-status";

function lr(canLaunch: boolean): SequenceLaunchReadiness {
  return {
    canLaunch,
    checks: [],
    totalWarnings: 0,
    totalBlockers: canLaunch ? 0 : 1,
  };
}

describe("deriveOutreachDashboardStatusLabel", () => {
  it("does not label APPROVED + canLaunch + no sends as Live", () => {
    expect(
      deriveOutreachDashboardStatusLabel({
        status: "APPROVED",
        launchReadiness: lr(true),
        prepCounts: { ready: 0, blocked: 0, suppressed: 0, sent: 0, failed: 0 },
        enrollmentPending: 3,
      }),
    ).toBe("Ready");
  });

  it("labels APPROVED + sending activity as Sending", () => {
    expect(
      deriveOutreachDashboardStatusLabel({
        status: "APPROVED",
        launchReadiness: lr(true),
        prepCounts: { ready: 2, blocked: 0, suppressed: 0, sent: 5, failed: 0 },
        enrollmentPending: 1,
      }),
    ).toBe("Sending");
  });

  it("labels blocked launch readiness as Blocked", () => {
    expect(
      deriveOutreachDashboardStatusLabel({
        status: "APPROVED",
        launchReadiness: lr(false),
        prepCounts: { ready: 1, blocked: 0, suppressed: 0, sent: 0, failed: 0 },
        enrollmentPending: 0,
      }),
    ).toBe("Blocked");
  });
});
