import { describe, expect, it } from "vitest";
import { summarizeSequenceDelivery } from "./sequence-delivery-summary";
import { deriveOutreachDashboardStatusLabel } from "./outreach-sequence-dashboard-status";

describe("staff delivery status after planner queue handoff", () => {
  it.each([
    ["QUEUED", null, "Queued"],
    ["BLOCKED_SUPPRESSION", null, "Needs attention"],
    ["FAILED", null, "Needs attention"],
    ["SENT", null, "Needs attention"],
    ["SENT", new Date("2026-09-14T09:00:00Z"), "Sent"],
    ["DELIVERED", new Date("2026-09-14T09:00:00Z"), "Sent"],
    ["BOUNCED", new Date("2026-09-14T09:00:00Z"), "Needs attention"],
  ])("planner SENT with outbound %s and timestamp %s displays %s", (status, sentAt, expected) => {
    const delivery = summarizeSequenceDelivery([{status: "SENT", outboundEmail: {status, sentAt}}]);
    expect(deriveOutreachDashboardStatusLabel({status: "APPROVED", launchReadiness: null,
      prepCounts: {ready: 0, blocked: 0, suppressed: 0, failed: 0, sent: 1}, enrollmentPending: 0, delivery,
    })).toBe(expected);
  });

  it("never infers dispatch from a missing linked outbound or missing summary", () => {
    expect(summarizeSequenceDelivery([{status: "SENT", outboundEmail: null}])).toEqual({sent: 0, queued: 0, attention: 1});
    expect(deriveOutreachDashboardStatusLabel({status: "APPROVED", launchReadiness: null,
      prepCounts: {ready: 0, blocked: 0, suppressed: 0, failed: 0, sent: 1}, enrollmentPending: 0,
    })).toBe("Check delivery");
  });

  it("keeps partial failure visible even when other messages sent or remain queued", () => {
    const delivery = summarizeSequenceDelivery([
      {status: "SENT", outboundEmail: {status: "SENT", sentAt: new Date()}},
      {status: "SENT", outboundEmail: {status: "QUEUED", sentAt: null}},
      {status: "SENT", outboundEmail: {status: "BLOCKED_SUPPRESSION", sentAt: null}},
      {status: "READY"},
    ]);
    expect(delivery).toEqual({sent: 1, queued: 1, attention: 1});
    expect(deriveOutreachDashboardStatusLabel({status: "APPROVED", launchReadiness: null,
      prepCounts: {ready: 1, blocked: 0, suppressed: 0, failed: 0, sent: 3}, enrollmentPending: 1, delivery,
    })).toBe("Needs attention");
  });
});
