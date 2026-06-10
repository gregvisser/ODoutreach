import { describe, expect, it } from "vitest";

import { parseReportDateRange } from "./report-date-range";

describe("parseReportDateRange", () => {
  it("parses the user's example range with an inclusive end day", () => {
    const r = parseReportDateRange("2026-04-23", "2026-06-04");
    expect(r).not.toBeNull();
    expect(r!.gte.toISOString()).toBe("2026-04-23T00:00:00.000Z");
    // 4 June is INCLUDED → upper bound is midnight of 5 June (exclusive).
    expect(r!.lt.toISOString()).toBe("2026-06-05T00:00:00.000Z");
    expect(r!.label).toBe("23 Apr 2026 – 4 Jun 2026");
    expect(r!.fromIso).toBe("2026-04-23");
    expect(r!.toIso).toBe("2026-06-04");
  });

  it("swaps reversed dates instead of returning an empty window", () => {
    const r = parseReportDateRange("2026-06-04", "2026-04-23");
    expect(r!.fromIso).toBe("2026-04-23");
    expect(r!.toIso).toBe("2026-06-04");
  });

  it("supports a single-day range", () => {
    const r = parseReportDateRange("2026-05-01", "2026-05-01");
    expect(r!.gte.toISOString()).toBe("2026-05-01T00:00:00.000Z");
    expect(r!.lt.toISOString()).toBe("2026-05-02T00:00:00.000Z");
  });

  it("returns null when either date is missing or malformed", () => {
    expect(parseReportDateRange(null, "2026-06-04")).toBeNull();
    expect(parseReportDateRange("2026-04-23", undefined)).toBeNull();
    expect(parseReportDateRange("23/04/2026", "2026-06-04")).toBeNull();
    expect(parseReportDateRange("2026-4-23", "2026-06-04")).toBeNull();
    expect(parseReportDateRange("", "")).toBeNull();
  });

  it("rejects calendar-overflow dates rather than silently normalising", () => {
    expect(parseReportDateRange("2026-02-31", "2026-06-04")).toBeNull();
  });
});
