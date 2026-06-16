import { describe, expect, it } from "vitest";

import {
  REPORT_DETAIL_METRIC_KEYS,
  REPORT_DETAIL_METRICS,
  isReportDetailMetric,
  parseReportDetailMetric,
  reportDetailMetricLabel,
} from "./report-detail-metrics";

describe("report detail metric registry", () => {
  it("every entry's key matches its map key (no copy-paste drift)", () => {
    for (const key of REPORT_DETAIL_METRIC_KEYS) {
      expect(REPORT_DETAIL_METRICS[key].key).toBe(key);
    }
  });

  it("marks state metrics as not windowed and event metrics as windowed", () => {
    // State (right-now) metrics ignore the date range.
    expect(REPORT_DETAIL_METRICS.queued.windowed).toBe(false);
    expect(REPORT_DETAIL_METRICS.suppressed.windowed).toBe(false);
    // Event metrics honour it.
    expect(REPORT_DETAIL_METRICS.sent.windowed).toBe(true);
    expect(REPORT_DETAIL_METRICS.replies.windowed).toBe(true);
    expect(REPORT_DETAIL_METRICS.unsubscribes.windowed).toBe(true);
  });
});

describe("parseReportDetailMetric", () => {
  it("accepts known metric keys", () => {
    expect(parseReportDetailMetric("replies")).toBe("replies");
    expect(parseReportDetailMetric("bounces")).toBe("bounces");
  });

  it("rejects unknown / derived / empty values", () => {
    expect(parseReportDetailMetric("sendProofMissing")).toBeNull();
    expect(parseReportDetailMetric("notReached")).toBeNull();
    expect(parseReportDetailMetric("")).toBeNull();
    expect(parseReportDetailMetric(undefined)).toBeNull();
    expect(parseReportDetailMetric("__proto__")).toBeNull();
  });
});

describe("isReportDetailMetric / label", () => {
  it("guards and labels known keys", () => {
    expect(isReportDetailMetric("opens")).toBe(true);
    expect(isReportDetailMetric("nope")).toBe(false);
    expect(reportDetailMetricLabel("unsubscribes")).toBe("Opt-outs");
  });

  it("falls back to the raw value for unknown keys", () => {
    expect(reportDetailMetricLabel("mystery")).toBe("mystery");
  });
});
