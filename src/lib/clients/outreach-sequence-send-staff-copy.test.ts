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
        "No eligible recipients yet — review recipients to prepare send rows.",
      ),
    ).toMatch(/review recipients/i);
    expect(
      humanizeSequenceLaunchDisabledReason(
        "No eligible recipients yet — review recipients to prepare send rows.",
      )!.toLowerCase(),
    ).not.toMatch(/test-domain/);
  });

  it("passes through blocked-with-reason messages plainly", () => {
    const msg = '18 recipients blocked: Missing required sender field(s): {{sender_email}}.';
    expect(humanizeSequenceLaunchDisabledReason(msg)).toBe(msg);
  });

  it("maps 'Review recipients to refresh' reason", () => {
    expect(
      humanizeSequenceLaunchDisabledReason(
        "Review recipients to refresh the launch batch.",
      ),
    ).toMatch(/Review recipients to refresh/i);
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
