import { describe, expect, it } from "vitest";

import type { SequenceLaunchCheckResult } from "@/lib/email-sequences/launch-readiness";
import { staffLaunchBlockerLines } from "@/lib/clients/outreach-launch-blockers";

function failCheck(
  id: SequenceLaunchCheckResult["id"],
  detail: string,
): SequenceLaunchCheckResult {
  return {
    id,
    label: id,
    severity: "blocker",
    status: "fail",
    detail,
  };
}

describe("staffLaunchBlockerLines", () => {
  it("surfaces 'Review recipients' detail for pending_email_sendable_recipients", () => {
    const lines = staffLaunchBlockerLines([
      failCheck(
        "pending_email_sendable_recipients",
        "Review recipients to refresh the launch batch.",
      ),
    ]);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/Review recipients/i);
  });

  it("blocker lines do not contain internal status strings", () => {
    const checks: SequenceLaunchCheckResult[] = [
      failCheck("connected_sending_mailbox", "No sending mailbox."),
      failCheck(
        "pending_email_sendable_recipients",
        "No eligible recipients. Check suppressed or missing-email contacts.",
      ),
    ];
    const lines = staffLaunchBlockerLines(checks);
    for (const line of lines) {
      expect(line).not.toMatch(/READY_FOR_REVIEW/);
      expect(line).not.toMatch(/APPROVED/);
      expect(line.toLowerCase()).not.toMatch(/launch batch yet/);
    }
  });
});
