import { describe, expect, it } from "vitest";

import {
  deriveOutreachMetrics,
  formatRate,
  formatTrackedMetric,
  type RawMetricsCounts,
} from "./outreach-metrics";

function emptyRaw(): RawMetricsCounts {
  return {
    sentWithProof: 0,
    sentProofMissing: 0,
    delivered: 0,
    deliveryTracked: true,
    opens: 0,
    opensTracked: false,
    replies: 0,
    unsubscribes: 0,
    bounces: 0,
    failed: 0,
    suppressedOrSkipped: 0,
    totalContacts: 0,
    emailSendable: 0,
  };
}

describe("deriveOutreachMetrics", () => {
  it("returns zero metrics for empty input", () => {
    const m = deriveOutreachMetrics(emptyRaw());
    expect(m.sent).toBe(0);
    expect(m.replies).toBe(0);
    expect(m.bounces).toBe(0);
    expect(m.failed).toBe(0);
    expect(m.notReached).toBe(0);
    expect(m.replyRate).toBeNull();
    expect(m.bounceRate).toBeNull();
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

  it("computes replyRate = replies / sent", () => {
    const raw = { ...emptyRaw(), sentWithProof: 100, replies: 12 };
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
});

describe("formatRate", () => {
  it("returns '—' for null", () => {
    expect(formatRate(null)).toBe("—");
  });

  it("formats percentage correctly", () => {
    expect(formatRate(12.5)).toBe("12.5%");
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
