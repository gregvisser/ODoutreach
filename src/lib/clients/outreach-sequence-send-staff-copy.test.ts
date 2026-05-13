import { describe, expect, it } from "vitest";

import {
  humanizeSequenceLaunchDisabledReason,
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
});

describe("sequenceIntroductionBatchLimitCopy", () => {
  it("mentions batch size in plain language", () => {
    const s = sequenceIntroductionBatchLimitCopy(10);
    expect(s).toMatch(/10/);
    expect(s.toLowerCase()).toMatch(/batch/);
  });
});
