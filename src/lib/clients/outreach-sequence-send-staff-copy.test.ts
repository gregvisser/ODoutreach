import { describe, expect, it } from "vitest";

import {
  humanizeSequenceLaunchDisabledReason,
  LIVE_SEQUENCE_LAUNCH_FOLLOW_HELP,
  LIVE_SEQUENCE_LAUNCH_INTRO_HELP,
  sequenceIntroductionBatchLimitCopy,
  STALE_RECIPIENTS_CLIENT_NOW_LIVE_COPY,
  STALE_RECIPIENTS_CLIENT_NOW_LIVE_REASON,
} from "@/lib/clients/outreach-sequence-send-staff-copy";

describe("humanizeSequenceLaunchDisabledReason", () => {
  it("maps legacy sequence status phrasing", () => {
    expect(
      humanizeSequenceLaunchDisabledReason("Sequence is READY_FOR_REVIEW, not APPROVED."),
    ).toMatch(/not activated/i);
  });

  it("maps the now-live stale-recipients marker to a refresh prompt, NOT the onboarding copy", () => {
    const out = humanizeSequenceLaunchDisabledReason(
      STALE_RECIPIENTS_CLIENT_NOW_LIVE_REASON,
    );
    expect(out).toBe(STALE_RECIPIENTS_CLIENT_NOW_LIVE_COPY);
    expect(out).toMatch(/Review recipients/i);
    // Must not send the operator back to onboarding — the client is live.
    expect(out).not.toMatch(/isn't live|onboarding/i);
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

  it("maps 'Review recipients to refresh' reason to plain English", () => {
    const out = humanizeSequenceLaunchDisabledReason(
      "Review recipients to refresh the launch batch.",
    );
    expect(out).toMatch(/Review recipients/i);
    expect(out).not.toMatch(/launch batch/i);
    expect(out).toMatch(/another sequence|suppressed|missing an email/i);
  });
});

describe("sequenceIntroductionBatchLimitCopy", () => {
  it("describes batch size in plain language without allowlist wording", () => {
    const s = sequenceIntroductionBatchLimitCopy(30);
    expect(s).toMatch(/30/);
    expect(s.toLowerCase()).toMatch(/this launch sends up to/);
    expect(s.toLowerCase()).not.toMatch(/allowlist/);
  });

  it("defaults to SEQUENCE_INTRODUCTION_BATCH_CAP (30) when hardCap is 0", () => {
    const s = sequenceIntroductionBatchLimitCopy(0);
    expect(s).toMatch(/30/);
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
