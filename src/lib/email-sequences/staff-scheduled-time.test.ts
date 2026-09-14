import { expect, it } from "vitest";
import { isValidStaffScheduledTime, ukScheduledTimeToIso } from "./staff-scheduled-time";

it("converts labelled UK time consistently in summer and winter", () => {
  expect(ukScheduledTimeToIso("2026-09-14T14:30")).toBe("2026-09-14T13:30:00.000Z");
  expect(ukScheduledTimeToIso("2026-12-14T14:30")).toBe("2026-12-14T14:30:00.000Z");
});
it.each(["", "not-a-date", "2026-02-30T14:00", "2026-03-29T01:30", "2026-09-14T24:30"])("rejects invalid or nonexistent UK wall time %s", value => {
  expect(ukScheduledTimeToIso(value)).toBeNull();
});
it("requires a future time within the bounded scheduling window", () => {
  const now = new Date("2026-09-14T10:00:00Z");
  expect(isValidStaffScheduledTime("2026-09-14T11:00:00Z", now)).toBe(true);
  expect(isValidStaffScheduledTime("2026-09-14T10:00:00Z", now)).toBe(false);
  expect(isValidStaffScheduledTime("2026-11-14T11:00:00Z", now)).toBe(false);
  expect(isValidStaffScheduledTime("2026-09-14T11:00:00", now)).toBe(false);
});
