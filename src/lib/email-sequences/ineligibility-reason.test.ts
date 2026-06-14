import { describe, expect, it } from "vitest";

import {
  breakdownFromReasons,
  emptyIneligibilityBreakdown,
  formatIneligibilityReason,
  totalIneligible,
} from "./ineligibility-reason";

describe("formatIneligibilityReason", () => {
  it("produces the itemised reason from the brief's example", () => {
    const reason = formatIneligibilityReason({
      breakdown: {
        ...emptyIneligibilityBreakdown(),
        cooldown: 480,
        suppressed: 15,
        bounced: 5,
      },
      eligible: 0,
    });
    expect(reason).toBe(
      "480 in cooldown, 15 unsubscribed / do-not-contact, 5 hard-bounced → 0 eligible to send right now.",
    );
  });

  it("only lists non-zero buckets", () => {
    const reason = formatIneligibilityReason({
      breakdown: { ...emptyIneligibilityBreakdown(), cooldown: 12 },
      eligible: 3,
    });
    expect(reason).toBe("12 in cooldown → 3 eligible to send right now.");
  });

  it("returns null when nothing is ineligible (caller falls back)", () => {
    expect(
      formatIneligibilityReason({
        breakdown: emptyIneligibilityBreakdown(),
        eligible: 50,
      }),
    ).toBeNull();
  });

  it("includes missing-email and already-enrolled buckets", () => {
    const reason = formatIneligibilityReason({
      breakdown: {
        ...emptyIneligibilityBreakdown(),
        missingEmail: 4,
        alreadyEnrolled: 2,
        other: 1,
      },
      eligible: 0,
    });
    expect(reason).toBe(
      "4 missing an email, 2 already in a sequence, 1 blocked → 0 eligible to send right now.",
    );
  });
});

describe("totalIneligible", () => {
  it("sums all buckets", () => {
    expect(
      totalIneligible({
        cooldown: 480,
        suppressed: 15,
        bounced: 5,
        missingEmail: 4,
        alreadyEnrolled: 2,
        other: 1,
      }),
    ).toBe(507);
  });
});

describe("breakdownFromReasons", () => {
  it("buckets the brief's old-CSV scenario into the itemised reason", () => {
    const reasons = [
      ...Array<string>(480).fill("skipped_client_outreach_cooldown"),
      ...Array<string>(15).fill("blocked_suppressed"),
      ...Array<string>(5).fill("blocked_recent_bounce"),
    ];
    const { breakdown, eligible } = breakdownFromReasons(reasons);
    expect(eligible).toBe(0);
    expect(breakdown.cooldown).toBe(480);
    expect(breakdown.suppressed).toBe(15);
    expect(breakdown.bounced).toBe(5);
    expect(formatIneligibilityReason({ breakdown, eligible })).toBe(
      "480 in cooldown, 15 unsubscribed / do-not-contact, 5 hard-bounced → 0 eligible to send right now.",
    );
  });

  it("counts 'ready' as eligible and groups enrollment-skips + other", () => {
    const { breakdown, eligible } = breakdownFromReasons([
      "ready",
      "ready",
      "blocked_missing_email",
      "skipped_enrollment_completed",
      "skipped_enrollment_paused",
      "blocked_template_not_approved",
    ]);
    expect(eligible).toBe(2);
    expect(breakdown.missingEmail).toBe(1);
    expect(breakdown.alreadyEnrolled).toBe(2);
    expect(breakdown.other).toBe(1);
  });
});
