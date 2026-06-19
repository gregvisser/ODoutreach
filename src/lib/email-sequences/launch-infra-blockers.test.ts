import { describe, expect, it } from "vitest";

import { infraLaunchBlockerReasons } from "./launch-infra-blockers";
import type {
  SequenceLaunchCheckId,
  SequenceLaunchCheckResult,
  SequenceLaunchCheckSeverity,
  SequenceLaunchReadiness,
} from "./launch-readiness";

function failCheck(
  id: SequenceLaunchCheckId,
  severity: SequenceLaunchCheckSeverity,
  detail: string,
): SequenceLaunchCheckResult {
  return { id, label: id, severity, status: "fail", detail };
}

function passCheck(id: SequenceLaunchCheckId): SequenceLaunchCheckResult {
  return { id, label: id, severity: "ok", status: "pass", detail: "" };
}

function readiness(
  checks: SequenceLaunchCheckResult[],
): SequenceLaunchReadiness {
  const totalBlockers = checks.filter(
    (c) => c.status === "fail" && c.severity === "blocker",
  ).length;
  return {
    canLaunch: totalBlockers === 0,
    totalBlockers,
    totalWarnings: checks.filter(
      (c) => c.status === "fail" && c.severity === "warning",
    ).length,
    checks,
  };
}

describe("infraLaunchBlockerReasons", () => {
  it("returns [] for unknown readiness", () => {
    expect(infraLaunchBlockerReasons(null)).toEqual([]);
    expect(infraLaunchBlockerReasons(undefined)).toEqual([]);
  });

  it("surfaces signature / mailbox / capacity / unsubscribe blockers", () => {
    const reasons = infraLaunchBlockerReasons(
      readiness([
        failCheck(
          "sender_signature_configured",
          "blocker",
          "A connected mailbox has no signature.",
        ),
        failCheck(
          "connected_sending_mailbox",
          "blocker",
          "No connected sending mailbox.",
        ),
      ]),
    );
    expect(reasons).toContain("A connected mailbox has no signature.");
    expect(reasons).toContain("No connected sending mailbox.");
    expect(reasons).toHaveLength(2);
  });

  it("ignores non-infra blockers (status/template/recipients are gated by the snapshot)", () => {
    expect(
      infraLaunchBlockerReasons(
        readiness([
          failCheck("sequence_approved", "blocker", "Not approved."),
          failCheck(
            "pending_email_sendable_recipients",
            "blocker",
            "No recipients.",
          ),
        ]),
      ),
    ).toEqual([]);
  });

  it("ignores infra checks that are warnings or passing", () => {
    expect(
      infraLaunchBlockerReasons(
        readiness([
          failCheck("daily_capacity_available", "warning", "Low capacity."),
          passCheck("sender_signature_configured"),
        ]),
      ),
    ).toEqual([]);
  });
});
