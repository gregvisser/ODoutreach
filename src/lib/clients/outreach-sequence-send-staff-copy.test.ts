import { describe, expect, it } from "vitest";

import {
  humanizeSequenceLaunchDisabledReason,
  LIVE_SEQUENCE_LAUNCH_FOLLOW_HELP,
  LIVE_SEQUENCE_LAUNCH_INTRO_HELP,
  sequenceIntroductionBatchLimitCopy,
} from "@/lib/clients/outreach-sequence-send-staff-copy";

describe("humanizeSequenceLaunchDisabledReason", () => {
  it("maps legacy sequence status phrasing", () => {
    expect(
      humanizeSequenceLaunchDisabledReason("Sequence is READY_FOR_REVIEW, not APPROVED."),
    ).toMatch(/not activated/i);
  });

  it("passes through unknown reasons", () => {
    expect(humanizeSequenceLaunchDisabledReason("Custom internal reason")).toBe(
      "Custom internal reason",
    );
  });

  it("maps no-eligible-recipients phrasing without test-domain list language", () => {
    expect(
      humanizeSequenceLaunchDisabledReason(
        "No eligible recipients are in this launch batch yet — review recipients or check safety rules.",
      ),
    ).toMatch(/review recipients, suppression, or mailbox capacity/i);
    expect(
      humanizeSequenceLaunchDisabledReason(
        "No eligible recipients are in this launch batch yet — review recipients or check safety rules.",
      )!.toLowerCase(),
    ).not.toMatch(/test-domain/);
  });
});

describe("sequenceIntroductionBatchLimitCopy", () => {
  it("describes batch size in plain language without allowlist wording", () => {
    const s = sequenceIntroductionBatchLimitCopy(10);
    expect(s).toMatch(/10/);
    expect(s.toLowerCase()).toMatch(/this launch sends up to/);
    expect(s.toLowerCase()).not.toMatch(/allowlist/);
  });
});

describe("live launch staff copy", () => {
  it("live launch help strings avoid internal-domain wording", () => {
    for (const line of [
      LIVE_SEQUENCE_LAUNCH_INTRO_HELP,
      LIVE_SEQUENCE_LAUNCH_FOLLOW_HELP,
    ]) {
      expect(line.toLowerCase()).not.toMatch(/allowlist/);
      expect(line).not.toMatch(/GOVERNED_TEST_EMAIL_DOMAINS/i);
      expect(line).not.toMatch(/Allowlisted domains/i);
    }
  });
});
