import { describe, expect, it } from "vitest";

import {
  deriveOutreachMetrics,
  formatBounceRate,
  formatRate,
  formatTrackedMetric,
  type RawMetricsCounts,
} from "./outreach-metrics";

function emptyRaw(): RawMetricsCounts {
  return {
    sentWithProof: 0,
    queued: 0,
    sentProofMissing: 0,
    delivered: 0,
    deliveryTracked: true,
    opens: 0,
    opensTracked: false,
    replies: 0,
    repliedEmails: 0,
    unsubscribes: 0,
    bounces: 0,
    failed: 0,
    suppressedOrSkipped: 0,
    totalContacts: 0,
    emailSendable: 0,
  };
}

// PR #136 — evidence-based delivery tracking. Tests below mirror the
// shape that `gatherRawCounts` will produce: deliveryTracked is true only
// when the server has seen at least one delivery (either an OutboundEmail
// row in DELIVERED status or a delivery OutboundProviderEvent).

describe("deriveOutreachMetrics", () => {
  it("returns zero metrics for empty input", () => {
    const m = deriveOutreachMetrics(emptyRaw());
    expect(m.sent).toBe(0);
    expect(m.queued).toBe(0);
    expect(m.replies).toBe(0);
    expect(m.bounces).toBe(0);
    expect(m.failed).toBe(0);
    expect(m.notReached).toBe(0);
    expect(m.replyRate).toBeNull();
    expect(m.bounceRate).toBeNull();
  });

  it("queued count is passed through", () => {
    const raw = { ...emptyRaw(), queued: 18 };
    const m = deriveOutreachMetrics(raw);
    expect(m.queued).toBe(18);
  });

  it("queued rows are not counted as sent", () => {
    const raw = { ...emptyRaw(), queued: 18, sentWithProof: 0 };
    const m = deriveOutreachMetrics(raw);
    expect(m.sent).toBe(0);
    expect(m.queued).toBe(18);
  });

  it("queued rows are not included in notReached", () => {
    const raw = { ...emptyRaw(), queued: 10, failed: 2, bounces: 1, suppressedOrSkipped: 1, sentProofMissing: 0 };
    const m = deriveOutreachMetrics(raw);
    expect(m.notReached).toBe(4);
  });

  it("counts sent only from sentWithProof, not sentProofMissing", () => {
    const raw = { ...emptyRaw(), sentWithProof: 10, sentProofMissing: 3 };
    const m = deriveOutreachMetrics(raw);
    expect(m.sent).toBe(10);
    expect(m.sendProofMissing).toBe(3);
  });

  it("step-send SENT without proof is not counted as sent", () => {
    const raw = { ...emptyRaw(), sentWithProof: 0, sentProofMissing: 5 };
    const m = deriveOutreachMetrics(raw);
    expect(m.sent).toBe(0);
    expect(m.sendProofMissing).toBe(5);
  });

  it("computes replyRate = emails replied to / sent", () => {
    // 12 messages on 12 distinct emails — the ordinary case, where the old
    // and new numerators agree. The rate is unchanged at 12%.
    const raw = {
      ...emptyRaw(),
      sentWithProof: 100,
      replies: 12,
      repliedEmails: 12,
    };
    const m = deriveOutreachMetrics(raw);
    expect(m.replyRate).toBe(12);
  });

  it("computes bounceRate = bounces / sent", () => {
    const raw = { ...emptyRaw(), sentWithProof: 200, bounces: 10 };
    const m = deriveOutreachMetrics(raw);
    expect(m.bounceRate).toBe(5);
  });

  it("computes unsubscribeRate = unsubscribes / sent", () => {
    const raw = { ...emptyRaw(), sentWithProof: 50, unsubscribes: 3 };
    const m = deriveOutreachMetrics(raw);
    expect(m.unsubscribeRate).toBe(6);
  });

  it("avoids divide-by-zero when sent is 0", () => {
    const raw = { ...emptyRaw(), replies: 1, bounces: 1, unsubscribes: 1 };
    const m = deriveOutreachMetrics(raw);
    expect(m.replyRate).toBeNull();
    expect(m.bounceRate).toBeNull();
    expect(m.unsubscribeRate).toBeNull();
  });

  it("shows delivery rate when deliveryTracked", () => {
    const raw = {
      ...emptyRaw(),
      sentWithProof: 100,
      delivered: 90,
      deliveryTracked: true,
    };
    const m = deriveOutreachMetrics(raw);
    expect(m.deliveryTracked).toBe(true);
    expect(m.delivered).toBe(90);
    expect(m.deliveryRate).toBe(90);
  });

  it("shows delivery as 0 when not tracked", () => {
    const raw = {
      ...emptyRaw(),
      sentWithProof: 100,
      delivered: 90,
      deliveryTracked: false,
    };
    const m = deriveOutreachMetrics(raw);
    expect(m.deliveryTracked).toBe(false);
    expect(m.delivered).toBe(0);
    expect(m.deliveryRate).toBeNull();
  });

  it("shows opens as not tracked when opensTracked is false", () => {
    const raw = { ...emptyRaw(), opensTracked: false, opens: 0 };
    const m = deriveOutreachMetrics(raw);
    expect(m.opensTracked).toBe(false);
    expect(m.opens).toBe(0);
    expect(m.openRate).toBeNull();
  });

  it("notReached includes failed + bounced + suppressed + sendProofMissing", () => {
    const raw = {
      ...emptyRaw(),
      failed: 3,
      bounces: 2,
      suppressedOrSkipped: 5,
      sentProofMissing: 4,
    };
    const m = deriveOutreachMetrics(raw);
    expect(m.notReached).toBe(14);
  });

  it("failed count derived correctly", () => {
    const raw = { ...emptyRaw(), failed: 7 };
    const m = deriveOutreachMetrics(raw);
    expect(m.failed).toBe(7);
  });

  it("suppressedOrSkipped count derived correctly", () => {
    const raw = { ...emptyRaw(), suppressedOrSkipped: 11 };
    const m = deriveOutreachMetrics(raw);
    expect(m.suppressedOrSkipped).toBe(11);
  });

  // PR #136 — additional contract tests for the trustworthy reporting
  // dashboard. The goal is to lock in the "Sent only with proof" rule, the
  // evidence-based delivery flag, and the "Opens are not tracked" rule so
  // future refactors cannot silently regress the staff-facing numbers.

  it("PR #136 — sent excludes queued, suppressed and proof-missing", () => {
    const raw = {
      ...emptyRaw(),
      sentWithProof: 7,
      queued: 4,
      suppressedOrSkipped: 2,
      sentProofMissing: 3,
    };
    const m = deriveOutreachMetrics(raw);
    expect(m.sent).toBe(7);
    expect(m.queued).toBe(4);
    expect(m.suppressedOrSkipped).toBe(2);
    expect(m.sendProofMissing).toBe(3);
  });

  it("PR #136 — replyRate uses linked replies over sent with proof", () => {
    const raw = {
      ...emptyRaw(),
      sentWithProof: 80,
      replies: 8,
      repliedEmails: 8,
      // Even if the system has 999 unlinked inbox messages, the metric must
      // never inflate. The server query already filters to linked rows.
    };
    const m = deriveOutreachMetrics(raw);
    expect(m.replies).toBe(8);
    expect(m.replyRate).toBe(10);
  });

  it("PR #136 — bounceRate uses bounces over sent with proof", () => {
    const raw = { ...emptyRaw(), sentWithProof: 50, bounces: 5 };
    const m = deriveOutreachMetrics(raw);
    expect(m.bounceRate).toBe(10);
  });

  it("PR #136 — unsubscribeRate uses used tokens over sent with proof", () => {
    const raw = { ...emptyRaw(), sentWithProof: 200, unsubscribes: 4 };
    const m = deriveOutreachMetrics(raw);
    expect(m.unsubscribeRate).toBe(2);
  });

  it("PR #136 — when deliveryTracked=false, delivery and rate are hidden", () => {
    const raw = {
      ...emptyRaw(),
      sentWithProof: 50,
      delivered: 0,
      deliveryTracked: false,
    };
    const m = deriveOutreachMetrics(raw);
    expect(m.deliveryTracked).toBe(false);
    expect(m.delivered).toBe(0);
    expect(m.deliveryRate).toBeNull();
  });

  it("PR #136 — opens are not tracked anywhere; openRate is null", () => {
    const raw = {
      ...emptyRaw(),
      sentWithProof: 100,
      delivered: 100,
      opens: 0,
      opensTracked: false,
    };
    const m = deriveOutreachMetrics(raw);
    expect(m.opensTracked).toBe(false);
    expect(m.opens).toBe(0);
    expect(m.openRate).toBeNull();
  });

  it("PR #136 — notReached formula = failed + bounces + suppressed + proof missing (no queued)", () => {
    const raw = {
      ...emptyRaw(),
      sentWithProof: 100,
      queued: 25,
      failed: 4,
      bounces: 3,
      suppressedOrSkipped: 2,
      sentProofMissing: 1,
    };
    const m = deriveOutreachMetrics(raw);
    expect(m.notReached).toBe(10);
    expect(m.queued).toBe(25);
  });
});

describe("formatRate", () => {
  it("returns '—' for null", () => {
    expect(formatRate(null)).toBe("—");
  });

  it("formats percentage correctly", () => {
    expect(formatRate(12.5)).toBe("12.5%");
  });
});

/**
 * Queue item 133, finding 3 — "the bounce rate shows nothing." Production
 * measurement (docs/ops/BOUNCE-RATE-DISPLAY-2026-08-31.md) found the
 * pipeline firing correctly and genuine-zero-bounce clients already showing
 * a real "0%". The one case that read as broken was a client with no sends
 * at all, where `formatRate` returns a bare "—" with no explanation.
 */
describe("formatBounceRate", () => {
  it("says 'No emails sent yet' when nothing has been sent, instead of a bare dash", () => {
    expect(formatBounceRate(null, 0)).toBe("No emails sent yet");
  });

  it("shows a real 0% when mail was sent and none of it bounced", () => {
    expect(formatBounceRate(0, 42)).toBe("0%");
  });

  it("shows the real rate when there are bounces", () => {
    expect(formatBounceRate(12.5, 40)).toBe("12.5%");
  });
});

describe("formatTrackedMetric", () => {
  it("shows 'Not tracked' when not tracked", () => {
    expect(formatTrackedMetric(0, false)).toBe("Not tracked");
  });

  it("shows formatted number when tracked", () => {
    expect(formatTrackedMetric(42, true)).toBe("42");
  });
});

/**
 * Queue item 27, defect (8) — the UX walk of 2026-08-26 recorded, on the live
 * /reporting page, "BidlowAI: reply rate 133.3% (3 sent, 4 replies)".
 *
 * A percentage above 100 is not a rounding artefact and not a wording problem.
 * It is the wrong numerator: `replyRate` divided raw InboundReply ROWS by
 * emails SENT. Those are different units. Four reply messages arriving on two
 * of the three emails we sent is a 66.7% reply rate and a message count of 4 —
 * it is not 133% of anything, and a client shown that number learns not to
 * trust the page it is printed on.
 *
 * The message count stays: "4 replies came in" is true and useful. What
 * changes is the rate's numerator — how many of the emails we sent were
 * replied to at least once.
 */
describe("replyRate — a share of emails sent, not a count of messages received", () => {
  it("four messages landing on two of three sent emails is 66.7%, not 133.3%", () => {
    const raw = {
      ...emptyRaw(),
      sentWithProof: 3,
      replies: 4,
      repliedEmails: 2,
    };
    const m = deriveOutreachMetrics(raw);
    // The raw message count is untouched — it was never the wrong number.
    expect(m.replies).toBe(4);
    // 2 of 3 emails got a reply. The shipped code returned 133.3 here.
    expect(m.replyRate).toBe(66.7);
    expect(m.repliedEmails).toBe(2);
  });

  it("cannot exceed 100% no matter how many messages arrive", () => {
    // One email, replied to nine times. The old numerator made this 900%.
    const raw = {
      ...emptyRaw(),
      sentWithProof: 1,
      replies: 9,
      repliedEmails: 1,
    };
    const m = deriveOutreachMetrics(raw);
    expect(m.replies).toBe(9);
    expect(m.replyRate).toBe(100);
  });

  it("is null when nothing was sent, rather than dividing by zero", () => {
    const raw = { ...emptyRaw(), sentWithProof: 0, replies: 2, repliedEmails: 1 };
    expect(deriveOutreachMetrics(raw).replyRate).toBeNull();
  });

  it("reports the ordinary case unchanged — one reply per email is still one rate", () => {
    // The overwhelming majority of real rows: every reply on a distinct email.
    // This case must NOT move, or the fix would be a silent restatement of
    // every historical reply rate in the product.
    const raw = {
      ...emptyRaw(),
      sentWithProof: 200,
      replies: 25,
      repliedEmails: 25,
    };
    expect(deriveOutreachMetrics(raw).replyRate).toBe(12.5);
  });
});
