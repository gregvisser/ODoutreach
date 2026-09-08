import { describe, expect, it } from "vitest";
import { nextSendingCalendarWindow, parseSendingCalendar, resolveSendingCalendarDay, type SendingCalendar } from "./sending-calendar";

const calendar: SendingCalendar = { timeZone: "Europe/London", weekdays: [1, 2, 3, 4, 5], startMinute: 9 * 60, endMinute: 17 * 60 };
function day(at: string, changes: Partial<SendingCalendar> = {}) {
  const result = resolveSendingCalendarDay({ ...calendar, ...changes }, new Date(at));
  if (!result.ok) throw Error(result.error);
  return result.value;
}
function windows(at: string, changes: Partial<SendingCalendar> = {}) {
  return day(at, changes).windows.map(window => [window.startsAt.toISOString(), window.endsAt.toISOString()]);
}

describe("client calendar clock boundaries", () => {
  it.each([
    ["2026-09-08T12:00Z", "2026-09-08T08:00:00.000Z", "2026-09-08T16:00:00.000Z"],
    ["2026-12-08T12:00Z", "2026-12-08T09:00:00.000Z", "2026-12-08T17:00:00.000Z"],
  ])("keeps London 09:00–17:00 local on %s", (at, start, end) => {
    expect(windows(at)).toEqual([[start, end]]);
  });

  it.each([
    ["2026-03-29T12:00Z", 23, "2026-03-29T00:00:00.000Z", "2026-03-29T23:00:00.000Z"],
    ["2026-10-25T12:00Z", 25, "2026-10-24T23:00:00.000Z", "2026-10-26T00:00:00.000Z"],
  ])("uses the whole %s local day without an assumed 24 hours", (at, hours, start, end) => {
    const result = day(at, { weekdays: [0], startMinute: 0, endMinute: 1440 });
    expect(result.startsAt.toISOString()).toBe(start);
    expect(result.endsAt.toISOString()).toBe(end);
    expect(+result.endsAt - +result.startsAt).toBe(Number(hours) * 3_600_000);
    expect(result.windows).toEqual([{ startsAt: result.startsAt, endsAt: result.endsAt }]);
  });

  it("does not invent missing spring minutes", () => {
    expect(windows("2026-03-29T12:00Z", { weekdays: [0], startMinute: 90, endMinute: 120 })).toEqual([]);
    expect(windows("2026-03-29T12:00Z", { weekdays: [0], startMinute: 90, endMinute: 150 }))
      .toEqual([["2026-03-29T01:00:00.000Z", "2026-03-29T01:30:00.000Z"]]);
  });

  it("keeps both repeated autumn intervals inside one allowance day", () => {
    expect(windows("2026-10-25T12:00Z", { weekdays: [0], startMinute: 90, endMinute: 105 })).toEqual([
      ["2026-10-25T00:30:00.000Z", "2026-10-25T00:45:00.000Z"],
      ["2026-10-25T01:30:00.000Z", "2026-10-25T01:45:00.000Z"],
    ]);
    expect(day("2026-10-25T00:35Z").localDate).toBe(day("2026-10-25T01:35Z").localDate);
    expect(day("2026-10-25T00:35Z").startsAt).toEqual(day("2026-10-25T01:35Z").startsAt);
  });

  it("uses the local weekday and fractional timezone, not the UTC weekday", () => {
    const result = day("2026-09-07T19:00Z", { timeZone: "Asia/Kathmandu", weekdays: [2], startMinute: 0, endMinute: 60 });
    expect(result.localDate).toBe("2026-09-08");
    expect(result.windows).toEqual([{ startsAt: new Date("2026-09-07T18:15Z"), endsAt: new Date("2026-09-07T19:15Z") }]);
  });

  it("handles a half-hour daylight-saving change", () => {
    const result = day("2026-10-04T03:00Z", { timeZone: "Australia/Lord_Howe", weekdays: [0], startMinute: 0, endMinute: 1440 });
    expect(+result.endsAt - +result.startsAt).toBe(23.5 * 3_600_000);
  });

  it("handles a repeated half hour without widening the selected clock interval", () => {
    expect(windows("2026-04-05T03:00Z", { timeZone: "Australia/Lord_Howe", weekdays: [0], startMinute: 105, endMinute: 120 })).toEqual([
      ["2026-04-04T14:45:00.000Z", "2026-04-04T15:00:00.000Z"],
      ["2026-04-04T15:15:00.000Z", "2026-04-04T15:30:00.000Z"],
    ]);
  });

  it("does not change a western client's allowance day at UTC midnight", () => {
    const changes = { timeZone: "America/Los_Angeles", weekdays: [1], startMinute: 17 * 60, endMinute: 23 * 60 };
    const before = day("2026-09-07T23:59Z", changes);
    const after = day("2026-09-08T00:01Z", changes);
    expect(after).toEqual(before);
    expect(after.localDate).toBe("2026-09-07");
    expect(after.windows).toEqual([{ startsAt: new Date("2026-09-08T00:00Z"), endsAt: new Date("2026-09-08T06:00Z") }]);
  });

  it("waits until Monday after the exclusive Friday closing time", () => {
    const result = nextSendingCalendarWindow(calendar, new Date("2026-09-11T16:00Z"));
    expect(result).toEqual({ ok: true, value: { startsAt: new Date("2026-09-14T08:00Z"), endsAt: new Date("2026-09-14T16:00Z") } });
  });

  it("finds the second autumn interval without reopening its closed gap", () => {
    const result = nextSendingCalendarWindow({ ...calendar, weekdays: [0], startMinute: 90, endMinute: 105 }, new Date("2026-10-25T00:45Z"));
    expect(result).toEqual({ ok: true, value: { startsAt: new Date("2026-10-25T01:30Z"), endsAt: new Date("2026-10-25T01:45Z") } });
  });

  it("finds the following week when this week's entire interval does not exist", () => {
    const result = nextSendingCalendarWindow({ ...calendar, weekdays: [0], startMinute: 90, endMinute: 120 }, new Date("2026-03-29T00:00Z"));
    expect(result).toEqual({ ok: true, value: { startsAt: new Date("2026-04-05T00:30Z"), endsAt: new Date("2026-04-05T01:00Z") } });
  });

  it("does not expose mutable cached Date objects", () => {
    const first = day("2026-09-08T12:00Z");
    first.startsAt.setUTCFullYear(2000);
    first.windows[0].endsAt.setUTCFullYear(2000);
    expect(day("2026-09-08T12:00Z").startsAt.getUTCFullYear()).toBe(2026);
    expect(day("2026-09-08T12:00Z").windows[0].endsAt.getUTCFullYear()).toBe(2026);
  });
});

it.each([null, {}, { ...calendar, timeZone: "Invalid/Zone" }, { ...calendar, timeZone: "+01:00" },
  { ...calendar, weekdays: [] }, { ...calendar, weekdays: [1, 1] }, { ...calendar, weekdays: [7] },
  { ...calendar, startMinute: 1080, endMinute: 420 }, { ...calendar, startMinute: NaN },
  { ...calendar, endMinute: 1441 }, { ...calendar, startMinute: 1.5 },
])("refuses invalid calendar %j", value => {
  expect(parseSendingCalendar(value).ok).toBe(false);
  expect(resolveSendingCalendarDay(value, new Date("2026-09-08T12:00Z")).ok).toBe(false);
});

it("refuses an invalid instant", () => {
  expect(resolveSendingCalendarDay(calendar, new Date(NaN)).ok).toBe(false);
});
