import { describe, expect, it } from "vitest";

import {
  classifySequenceDispatchOutcome,
  describeSequenceDispatchOutcome,
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

/**
 * Row 111 finding 1 — the launch banner always said "queued", even once a
 * send had actually gone out via Graph in ~1.2s (docs/ops/SEND-PROOF-2026-08-30.md).
 * `triggerOutboundQueueDrain` is awaited by the dispatcher before it returns,
 * so by the time this banner renders the real `OutboundEmail` rows it just
 * created have very often already reached a terminal status. These two
 * functions turn that real status into the sentence the operator reads,
 * instead of the fixed intake word "queued".
 */
describe("classifySequenceDispatchOutcome", () => {
  it("counts a row already SENT by the time we re-check as sent, not queued", () => {
    const outcome = classifySequenceDispatchOutcome(["SENT"]);
    expect(outcome).toEqual({
      sentImmediately: 1,
      failedImmediately: 0,
      stillPending: 0,
    });
  });

  it("treats DELIVERED the same as SENT — both mean the operator's email left", () => {
    expect(classifySequenceDispatchOutcome(["DELIVERED"]).sentImmediately).toBe(1);
  });

  it("counts a still-QUEUED row (worker has not run yet) as pending, not sent", () => {
    const outcome = classifySequenceDispatchOutcome(["QUEUED"]);
    expect(outcome).toEqual({
      sentImmediately: 0,
      failedImmediately: 0,
      stillPending: 1,
    });
  });

  it("counts a row that failed at dispatch as failed, not queued", () => {
    const outcome = classifySequenceDispatchOutcome(["FAILED"]);
    expect(outcome).toEqual({
      sentImmediately: 0,
      failedImmediately: 1,
      stillPending: 0,
    });
  });

  it("splits a mixed batch into the right buckets", () => {
    const outcome = classifySequenceDispatchOutcome([
      "SENT",
      "SENT",
      "QUEUED",
      "FAILED",
    ]);
    expect(outcome).toEqual({
      sentImmediately: 2,
      failedImmediately: 1,
      stillPending: 1,
    });
  });

  it("an empty batch is all zero", () => {
    expect(classifySequenceDispatchOutcome([])).toEqual({
      sentImmediately: 0,
      failedImmediately: 0,
      stillPending: 0,
    });
  });
});

describe("describeSequenceDispatchOutcome", () => {
  it("says 'sent', not 'queued', once dispatch has already completed", () => {
    const msg = describeSequenceDispatchOutcome("introduction", {
      sentImmediately: 1,
      failedImmediately: 0,
      stillPending: 0,
    });
    expect(msg).toBe("1 introduction sent");
    expect(msg).not.toMatch(/queued/i);
  });

  it("pluralises the category label for more than one", () => {
    const msg = describeSequenceDispatchOutcome("introduction", {
      sentImmediately: 3,
      failedImmediately: 0,
      stillPending: 0,
    });
    expect(msg).toBe("3 introductions sent");
  });

  it("says 'queued — sending shortly' only for rows genuinely not dispatched yet", () => {
    const msg = describeSequenceDispatchOutcome("introduction", {
      sentImmediately: 0,
      failedImmediately: 0,
      stillPending: 1,
    });
    expect(msg).toBe("1 introduction queued — sending shortly");
  });

  it("reports a mixed outcome as separate, honest counts", () => {
    const msg = describeSequenceDispatchOutcome("introduction", {
      sentImmediately: 2,
      failedImmediately: 1,
      stillPending: 1,
    });
    expect(msg).toBe(
      "2 introductions sent · 1 introduction queued — sending shortly · 1 introduction failed to send (see timeline for the reason)",
    );
  });

  it("falls back to the old '0 queued' wording when nothing was queued at all", () => {
    const msg = describeSequenceDispatchOutcome("introduction", {
      sentImmediately: 0,
      failedImmediately: 0,
      stillPending: 0,
    });
    expect(msg).toBe("0 introductions queued");
  });
});
