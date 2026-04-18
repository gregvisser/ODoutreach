import { describe, expect, it } from "vitest";

import { addUtcDays, utcDateKeyForInstant } from "./sending-window";

describe("utcDateKeyForInstant", () => {
  it("returns YYYY-MM-DD in UTC", () => {
    const d = new Date("2026-04-18T23:30:00.000Z");
    expect(utcDateKeyForInstant(d)).toBe("2026-04-18");
  });

  it("rolls the calendar at UTC midnight", () => {
    const d = new Date("2026-04-19T00:00:00.000Z");
    expect(utcDateKeyForInstant(d)).toBe("2026-04-19");
  });
});

describe("addUtcDays", () => {
  it("advances to the next UTC day for window reset tests", () => {
    const d = new Date("2026-04-18T12:00:00.000Z");
    const next = addUtcDays(d, 1);
    expect(utcDateKeyForInstant(next)).toBe("2026-04-19");
  });
});
