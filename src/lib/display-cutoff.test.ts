import { afterEach, describe, expect, it } from "vitest";
import {
  displayCutoffDateFilter,
  getDisplayDataCutoffAt,
  intersectDisplayWindow,
  displayHistoryLabel,
} from "./display-cutoff";

const original = process.env.DISPLAY_DATA_CUTOFF_AT;

afterEach(() => {
  if (original === undefined) delete process.env.DISPLAY_DATA_CUTOFF_AT;
  else process.env.DISPLAY_DATA_CUTOFF_AT = original;
});

describe("display data cutoff", () => {
  it("keeps legacy all-history behaviour when unset", () => {
    delete process.env.DISPLAY_DATA_CUTOFF_AT;
    expect(getDisplayDataCutoffAt()).toBeNull();
    expect(displayCutoffDateFilter()).toBeUndefined();
  });

  it.each(["not-a-date", "09/16/2026", "2026-02-30T00:00:00.000Z", "2026-09-16T00:00:00"])("fails closed for invalid or ambiguous value %s", value => {
    process.env.DISPLAY_DATA_CUTOFF_AT = value;
    expect(() => getDisplayDataCutoffAt()).toThrow("DISPLAY_DATA_CUTOFF_AT");
  });

  it("includes the exact boundary and excludes the preceding millisecond", () => {
    process.env.DISPLAY_DATA_CUTOFF_AT = "2026-09-15T23:00:00.000Z";
    const filter = displayCutoffDateFilter();
    expect(filter?.gte.getTime()).toBe(new Date("2026-09-15T23:00:00.000Z").getTime());
    expect(new Date("2026-09-15T22:59:59.999Z") >= (filter?.gte ?? new Date(0))).toBe(false);
    expect(displayHistoryLabel()).toContain("16 September 2026");
    expect(displayHistoryLabel()).toContain("00:00");
  });

  it("intersects an explicit window while preserving its exclusive end", () => {
    process.env.DISPLAY_DATA_CUTOFF_AT = "2026-09-15T23:00:00.000Z";
    const result = intersectDisplayWindow({
      gte: new Date("2026-09-01T00:00:00.000Z"),
      lt: new Date("2026-09-20T00:00:00.000Z"),
    });
    expect(result).toEqual({
      gte: new Date("2026-09-15T23:00:00.000Z"),
      lt: new Date("2026-09-20T00:00:00.000Z"),
    });
  });
});
