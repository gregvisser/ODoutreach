import { expect, it } from "vitest";
import { calendarSendSlotsForDay, calendarSendsPermittedByNow } from "./calendar-send-pacing";
import { planSendingCalendarChange, resolveSendingCalendarDay } from "./sending-calendar";

const calendar = { timeZone: "Europe/London", weekdays: [0, 1, 2, 3, 4, 5, 6], startMinute: 540, endMinute: 1020 };
const input = { mailboxId: "synthetic", at: new Date("2026-09-08T12:00Z"), dailyCap: 30, batchSize: 4 };

it.each(["2026-03-29T12:00Z", "2026-10-25T12:00Z", "2026-09-08T12:00Z"])("keeps deterministic batches inside local hours on %s", date => {
  const at = new Date(date);
  const schedule = calendarSendSlotsForDay(calendar, { ...input, at });
  const day = resolveSendingCalendarDay(calendar, at);
  if (!schedule.ok || !day.ok) throw Error("Expected a valid schedule");
  expect(schedule.slots).toHaveLength(30);
  expect(calendarSendSlotsForDay(calendar, { ...input, at })).toEqual(schedule);
  for (const slot of schedule.slots) expect(day.value.windows.some(window => +slot >= +window.startsAt && +slot < +window.endsAt)).toBe(true);
  const distinct = [...new Set(schedule.slots.map(Number))];
  for (let i = 1; i < distinct.length; i++) expect(distinct[i] - distinct[i - 1]).toBeGreaterThanOrEqual(300_000);
  for (const time of distinct) expect(schedule.slots.filter(slot => +slot === time).length).toBeLessThanOrEqual(4);
});

it.each([0, 1, 5, 10, 30, 5000, NaN])("never schedules above the effective/hard allowance %s", dailyCap => {
  const result = calendarSendSlotsForDay(calendar, { ...input, dailyCap });
  if (!result.ok) throw Error(result.error);
  expect(result.slots.length).toBeLessThanOrEqual(Number.isFinite(dailyCap) ? Math.min(30, dailyCap) : 0);
});

it("does not compress a day's batches into a one-minute window", () => {
  const result = calendarSendSlotsForDay({ ...calendar, endMinute: 541 }, input);
  expect(result.ok && result.slots.length).toBe(4);
});

it.each(["2026-09-08T07:59:59Z", "2026-09-08T16:00:00Z", "2026-09-08T23:00:00Z"])("holds outside working hours at %s", date => {
  expect(calendarSendsPermittedByNow(calendar, { ...input, at: new Date(date) })).toEqual({ ok: true, isOpen: false, permitted: 0 });
});

it("does not reopen the clock-change gap or schedule a batch in it", () => {
  const repeated = { ...calendar, weekdays: [0], startMinute: 90, endMinute: 105 };
  const at = new Date("2026-10-25T00:50Z");
  expect(calendarSendsPermittedByNow(repeated, { ...input, at })).toEqual({ ok: true, isOpen: false, permitted: 0 });
  const result = calendarSendSlotsForDay(repeated, { ...input, at });
  if (!result.ok) throw Error(result.error);
  for (const slot of result.slots) expect(+slot < Date.parse("2026-10-25T00:45Z") || +slot >= Date.parse("2026-10-25T01:30Z")).toBe(true);
});

it.each([
  [null, "Europe/London", "2026-09-08T00:00Z", "2026-09-08T23:00Z"],
  [{ ...calendar, timeZone: "Europe/London" }, "UTC", "2026-09-07T23:00Z", "2026-09-08T00:00Z"],
  [{ ...calendar, timeZone: "Europe/London" }, "Europe/London", "2026-09-07T23:00Z", "2026-09-07T23:00Z"],
])("plans a full-day transition from %j to %s", (current, timeZone, pause, effective) => {
  expect(planSendingCalendarChange(current, { ...calendar, timeZone }, new Date("2026-09-07T12:00Z"))).toEqual({ ok: true, value: { pauseStartsAt: new Date(pause), effectiveAt: new Date(effective) } });
});

it("refuses invalid calendars before scheduling or planning an activation", () => {
  expect(calendarSendSlotsForDay(null, input).ok).toBe(false);
  expect(calendarSendsPermittedByNow({}, input).ok).toBe(false);
  expect(planSendingCalendarChange(null, {}, input.at).ok).toBe(false);
});
