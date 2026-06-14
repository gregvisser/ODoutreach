import { describe, expect, it } from "vitest";

import {
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
