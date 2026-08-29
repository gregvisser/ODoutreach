import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  assessSendTimeEvidence,
  AUTOMATIC_SENDER_UTC_HOURS,
  LOOKBACK_DAYS,
  MIN_QUALIFYING_SLOTS,
  MIN_SLOT_SENDS,
  MIN_TOTAL_REPLIES,
  MIN_TOTAL_SENDS,
  ukLocalSlot,
  weekdayLabel,
  windowReachability,
  type SendOutcome,
} from "./send-time-evidence";

/**
 * Build `count` sends at one instant, `repliedCount` of which got a reply.
 * Kept trivial on purpose — the interesting logic is all in the module.
 */
function sendsAt(iso: string, count: number, repliedCount: number): SendOutcome[] {
  return Array.from({ length: count }, (_, i) => ({
    sentAt: new Date(iso),
    replied: i < repliedCount,
  }));
}

describe("ukLocalSlot — the hour a person in the UK actually saw the email", () => {
  it("reads a winter (GMT) timestamp as the same hour", () => {
    // 2026-01-13 is a Tuesday. GMT, so UK local hour === UTC hour.
    expect(ukLocalSlot(new Date("2026-01-13T09:30:00Z"))).toEqual({
      weekday: 2,
      hour: 9,
    });
  });

  it("shifts a summer (BST) timestamp forward by an hour", () => {
    // 2026-07-14 is a Tuesday. BST, so 09:30 UTC was 10:30 in the UK.
    expect(ukLocalSlot(new Date("2026-07-14T09:30:00Z"))).toEqual({
      weekday: 2,
      hour: 10,
    });
  });

  it("does not read the same clock hour for the same UTC hour in both seasons", () => {
    // The whole reason this function exists. If it ever returns the same slot
    // for these two, someone has replaced it with `getUTCHours()` and every
    // recommendation is an hour out for seven months of the year.
    const winter = ukLocalSlot(new Date("2026-01-13T09:30:00Z"));
    const summer = ukLocalSlot(new Date("2026-07-14T09:30:00Z"));
    expect(summer.hour).toBe(winter.hour + 1);
  });

  it("puts a late-evening BST send on the correct UK weekday", () => {
    // 2026-06-30T23:30Z is Tuesday in UTC but 00:30 WEDNESDAY in the UK.
    expect(ukLocalSlot(new Date("2026-06-30T23:30:00Z"))).toEqual({
      weekday: 3,
      hour: 0,
    });
  });

  it("labels weekdays for a person, Monday first", () => {
    expect(weekdayLabel(1)).toBe("Monday");
    expect(weekdayLabel(5)).toBe("Friday");
    expect(weekdayLabel(0)).toBe("Sunday");
  });
});

describe("assessSendTimeEvidence — refuses to guess from too little data", () => {
  it("refuses an empty history rather than returning an empty table", () => {
    const verdict = assessSendTimeEvidence([]);
    expect(verdict.sufficient).toBe(false);
  });

  it("refuses when there are not enough sends in total", () => {
    // Plenty of replies, nowhere near enough sends.
    const verdict = assessSendTimeEvidence(sendsAt("2026-07-14T09:30:00Z", 30, 25));
    expect(verdict.sufficient).toBe(false);
    if (verdict.sufficient) throw new Error("unreachable");
    expect(verdict.reason).toContain("sends");
  });

  it("refuses when almost nobody replied, however much was sent", () => {
    // A reply rate this thin cannot tell one hour from another; a "best time"
    // drawn from two replies is astrology with a percentage sign on it.
    const verdict = assessSendTimeEvidence([
      ...sendsAt("2026-07-13T09:30:00Z", 400, 1),
      ...sendsAt("2026-07-14T10:30:00Z", 400, 1),
      ...sendsAt("2026-07-15T11:30:00Z", 400, 1),
    ]);
    expect(verdict.sufficient).toBe(false);
    if (verdict.sufficient) throw new Error("unreachable");
    expect(verdict.reason).toContain("replies");
  });

  it("refuses when everything was sent in one or two slots", () => {
    // Comparing times needs more than one time. One slot is not a comparison.
    const verdict = assessSendTimeEvidence(sendsAt("2026-07-14T09:30:00Z", 500, 60));
    expect(verdict.sufficient).toBe(false);
    if (verdict.sufficient) throw new Error("unreachable");
    expect(verdict.reason).toContain("times of day");
  });

  it("accepts a history with real volume spread across several slots", () => {
    const verdict = assessSendTimeEvidence([
      ...sendsAt("2026-07-13T08:30:00Z", 100, 12),
      ...sendsAt("2026-07-14T09:30:00Z", 100, 4),
      ...sendsAt("2026-07-15T10:30:00Z", 100, 9),
      ...sendsAt("2026-07-16T13:30:00Z", 100, 6),
    ]);
    expect(verdict.sufficient).toBe(true);
    if (!verdict.sufficient) throw new Error("unreachable");
    expect(verdict.totalSent).toBe(400);
    expect(verdict.totalReplied).toBe(31);
    expect(verdict.slots).toHaveLength(4);
  });

  it("DROPS thin slots instead of showing them, because a model would recommend them", () => {
    // The 3-send slot below has a 100% reply rate. It is noise, and a model
    // shown "100%" will recommend it over an honest 12% built on 100 sends.
    // It must never reach the prompt.
    const verdict = assessSendTimeEvidence([
      ...sendsAt("2026-07-13T08:30:00Z", 100, 12),
      ...sendsAt("2026-07-14T09:30:00Z", 100, 4),
      ...sendsAt("2026-07-15T10:30:00Z", 100, 9),
      ...sendsAt("2026-07-16T13:30:00Z", 100, 6),
      ...sendsAt("2026-07-17T16:30:00Z", 3, 3),
    ]);
    expect(verdict.sufficient).toBe(true);
    if (!verdict.sufficient) throw new Error("unreachable");
    expect(verdict.slots).toHaveLength(4);
    expect(verdict.slots.some((s) => s.hour === 17)).toBe(false);
    // ...and the dropped slot is not quietly counted in the headline totals
    // either, or the table would not add up to what is shown above it.
    expect(verdict.totalSent).toBe(400);
  });

  it("computes a reply rate per slot, rounded for a screen", () => {
    const verdict = assessSendTimeEvidence([
      ...sendsAt("2026-07-13T08:30:00Z", 100, 12),
      ...sendsAt("2026-07-14T09:30:00Z", 100, 4),
      ...sendsAt("2026-07-15T10:30:00Z", 100, 9),
      ...sendsAt("2026-07-16T13:30:00Z", 100, 6),
    ]);
    if (!verdict.sufficient) throw new Error("unreachable");
    const best = verdict.slots.find((s) => s.weekday === 1);
    expect(best?.replyRatePercent).toBe(12);
  });

  it("orders slots best-first so the table reads as an answer", () => {
    const verdict = assessSendTimeEvidence([
      ...sendsAt("2026-07-13T08:30:00Z", 100, 12),
      ...sendsAt("2026-07-14T09:30:00Z", 100, 4),
      ...sendsAt("2026-07-15T10:30:00Z", 100, 9),
      ...sendsAt("2026-07-16T13:30:00Z", 100, 6),
    ]);
    if (!verdict.sufficient) throw new Error("unreachable");
    const rates = verdict.slots.map((s) => s.replyRatePercent);
    expect(rates).toEqual([...rates].sort((a, b) => b - a));
  });

  it("groups sends made at the same UK time on the same weekday", () => {
    // Two different weeks, same Monday 09:00 UK slot: one row, not two.
    const verdict = assessSendTimeEvidence([
      ...sendsAt("2026-07-06T08:30:00Z", 60, 6),
      ...sendsAt("2026-07-13T08:30:00Z", 60, 6),
      ...sendsAt("2026-07-14T09:30:00Z", 100, 4),
      ...sendsAt("2026-07-15T10:30:00Z", 100, 9),
      ...sendsAt("2026-07-16T13:30:00Z", 100, 6),
    ]);
    if (!verdict.sufficient) throw new Error("unreachable");
    const mondays = verdict.slots.filter((s) => s.weekday === 1 && s.hour === 9);
    expect(mondays).toHaveLength(1);
    expect(mondays[0]?.sent).toBe(120);
  });

  it("the thresholds are real numbers, not zero", () => {
    // A gate whose thresholds are all 0 passes everything and reads as a gate.
    expect(MIN_TOTAL_SENDS).toBeGreaterThan(0);
    expect(MIN_TOTAL_REPLIES).toBeGreaterThan(0);
    expect(MIN_SLOT_SENDS).toBeGreaterThan(0);
    expect(MIN_QUALIFYING_SLOTS).toBeGreaterThan(1);
    expect(LOOKBACK_DAYS).toBeGreaterThan(0);
  });
});

describe("windowReachability — can the automatic sender actually reach this time?", () => {
  it("marks a mid-morning weekday window reachable all year", () => {
    expect(windowReachability(2, 10, 12)).toBe("always");
  });

  it("marks a weekend window unreachable", () => {
    // The cron is Monday-Friday. A "best time" of Saturday is advice the
    // automatic sender can never take.
    expect(windowReachability(6, 10, 12)).toBe("never");
    expect(windowReachability(0, 10, 12)).toBe("never");
  });

  it("marks the middle of the night unreachable", () => {
    expect(windowReachability(2, 2, 4)).toBe("never");
  });

  it("marks 07:00 UK as winter-only, because the cron is in UTC", () => {
    // The cron fires on UTC hours. In BST the first firing is 08:00 UK, so a
    // 07:00 recommendation is reachable in winter and impossible in summer.
    // Nobody works this out by hand, which is exactly why it is computed.
    expect(windowReachability(2, 7, 8)).toBe("winter_only");
  });

  it("marks 19:00 UK as summer-only, for the mirror-image reason", () => {
    expect(windowReachability(2, 19, 20)).toBe("summer_only");
  });

  it("is driven by the REAL cron, not a hand-copied number", () => {
    // If someone edits the cron schedule, this test goes red rather than the
    // product quietly telling operators that an unreachable hour is reachable.
    const workflow = readFileSync(
      path.join(process.cwd(), ".github/workflows/process-outbound-queue.yml"),
      "utf8",
    );
    const match = /cron:\s*"\*\/\d+\s+(\d+)-(\d+)\s+\*\s+\*\s+1-5"/.exec(workflow);
    expect(match).not.toBeNull();
    expect(AUTOMATIC_SENDER_UTC_HOURS.first).toBe(Number(match?.[1]));
    expect(AUTOMATIC_SENDER_UTC_HOURS.last).toBe(Number(match?.[2]));
  });
});
