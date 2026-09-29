import { describe, expect, it } from "vitest";

import { formatStaffDate, formatStaffDateTime } from "./staff-datetime";

describe("staff dates", () => {
  it("formats UTC parts so server and browser markup match", () => {
    const late = "2026-09-29T23:30:00.000Z";
    expect(formatStaffDate(late)).toBe("29 Sep 2026");
    expect(formatStaffDateTime(late)).toBe("29 Sep 2026, 23:30 UTC");
    expect(formatStaffDateTime(new Date(late))).toBe("29 Sep 2026, 23:30 UTC");
  });

  it("does not invent a date for an empty or unreadable value", () => {
    expect(formatStaffDate(null)).toBe("—");
    expect(formatStaffDateTime("")).toBe("—");
    expect(formatStaffDate("not-a-date")).toBe("—");
  });
});