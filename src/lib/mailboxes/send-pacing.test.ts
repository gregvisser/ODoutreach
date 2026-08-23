import { describe, expect, it } from "vitest";

import {
  PACING_WINDOW_END_MINUTE,
  PACING_WINDOW_START_MINUTE,
  sendSlotsForDay,
  sendsPermittedByNow,
} from "./send-pacing";

/**
 * Spread a mailbox's daily allowance across the working day instead of emptying
 * it into the first cron run of the morning.
 *
 * WHAT IS SOURCED, AND WHAT IS NOT — this distinction is the whole point, and it
 * is why these tests assert what they assert:
 *
 *   SOURCED. Microsoft enforces a hard limit of 30 messages per MINUTE per
 *   mailbox (learn.microsoft.com, Exchange Online limits). SendGrid's published
 *   guidance is to send at a CONSISTENT rate rather than in bursts. SendGrid
 *   also advises avoiding :00/:15/:30/:45, which are ISP peak times where mail
 *   queues behind everyone else's.
 *
 *   NOT SOURCED. That a fixed cadence is itself a "fingerprint" and gaps must
 *   therefore be randomised. No provider or major ESP says this, and the
 *   published advice points the other way. The jitter here is justified as
 *   HUMAN APPEARANCE and peak-avoidance ONLY. It is deliberately modest, so a
 *   reader can see it is not pretending to be a deliverability control.
 *
 * Determinism matters: the same mailbox on the same day must always produce the
 * same schedule, or the pacing gate would move under a dispatcher that runs
 * every five minutes and the cap would leak.
 */

const DAY = "2026-09-01";
const MB = "mailbox-aaa";

describe("the day's allowance is spread across the working window", () => {
  it("produces exactly one slot per permitted send", () => {
    expect(sendSlotsForDay({ mailboxId: MB, dateKey: DAY, dailyCap: 30 })).toHaveLength(30);
    expect(sendSlotsForDay({ mailboxId: MB, dateKey: DAY, dailyCap: 5 })).toHaveLength(5);
    expect(sendSlotsForDay({ mailboxId: MB, dateKey: DAY, dailyCap: 1 })).toHaveLength(1);
  });

  it("keeps every slot inside working hours", () => {
    for (const cap of [1, 5, 12, 30]) {
      for (const m of sendSlotsForDay({ mailboxId: MB, dateKey: DAY, dailyCap: cap })) {
        expect(m).toBeGreaterThanOrEqual(PACING_WINDOW_START_MINUTE);
        expect(m).toBeLessThanOrEqual(PACING_WINDOW_END_MINUTE);
      }
    }
  });

  it("returns slots in ascending order", () => {
    const slots = sendSlotsForDay({ mailboxId: MB, dateKey: DAY, dailyCap: 30 });
    expect([...slots].sort((a, b) => a - b)).toEqual(slots);
  });

  it("never sends at 03:00 — nothing lands outside the window", () => {
    const slots = sendSlotsForDay({ mailboxId: MB, dateKey: DAY, dailyCap: 30 });
    expect(Math.min(...slots)).toBeGreaterThanOrEqual(7 * 60);
    expect(Math.max(...slots)).toBeLessThanOrEqual(18 * 60);
  });

  it("does not front-load: at 30/day the last slot is in the afternoon", () => {
    const slots = sendSlotsForDay({ mailboxId: MB, dateKey: DAY, dailyCap: 30 });
    // The burst this exists to prevent would put everything before 08:00.
    expect(Math.max(...slots)).toBeGreaterThan(15 * 60);
    const beforeEight = slots.filter((m) => m < 8 * 60).length;
    expect(beforeEight).toBeLessThanOrEqual(4);
  });

  it("keeps a real gap between consecutive sends at full volume", () => {
    const slots = sendSlotsForDay({ mailboxId: MB, dateKey: DAY, dailyCap: 30 });
    const gaps = slots.slice(1).map((m, i) => m - slots[i]);
    // 30 sends over 11 hours is ~22 minutes apart. Nothing should be adjacent —
    // Microsoft's hard ceiling is 30 messages per MINUTE, and a burst sits on it.
    expect(Math.min(...gaps)).toBeGreaterThanOrEqual(5);
  });
});

describe("it is deterministic, or the pacing gate leaks", () => {
  it("the same mailbox on the same day always gets the same schedule", () => {
    const a = sendSlotsForDay({ mailboxId: MB, dateKey: DAY, dailyCap: 30 });
    const b = sendSlotsForDay({ mailboxId: MB, dateKey: DAY, dailyCap: 30 });
    expect(a).toEqual(b);
  });

  it("two mailboxes do not march in step", () => {
    const a = sendSlotsForDay({ mailboxId: "mailbox-aaa", dateKey: DAY, dailyCap: 30 });
    const b = sendSlotsForDay({ mailboxId: "mailbox-bbb", dateKey: DAY, dailyCap: 30 });
    expect(a).not.toEqual(b);
  });

  it("the same mailbox differs from day to day", () => {
    const a = sendSlotsForDay({ mailboxId: MB, dateKey: "2026-09-01", dailyCap: 30 });
    const b = sendSlotsForDay({ mailboxId: MB, dateKey: "2026-09-02", dailyCap: 30 });
    expect(a).not.toEqual(b);
  });
});

describe("it avoids the ISP peak marks (SendGrid)", () => {
  it("no slot lands exactly on :00, :15, :30 or :45", () => {
    const peaks = new Set([0, 15, 30, 45]);
    for (const mb of ["mailbox-aaa", "mailbox-bbb", "mailbox-ccc", "mailbox-ddd"]) {
      for (const cap of [5, 15, 30]) {
        for (const m of sendSlotsForDay({ mailboxId: mb, dateKey: DAY, dailyCap: cap })) {
          expect(peaks.has(m % 60)).toBe(false);
        }
      }
    }
  });
});

describe("sendsPermittedByNow gates the dispatcher", () => {
  const opts = { mailboxId: MB, dateKey: DAY, dailyCap: 30 };

  it("permits nothing before the window opens", () => {
    expect(sendsPermittedByNow({ ...opts, nowMinuteOfDay: 6 * 60 })).toBe(0);
  });

  it("permits the whole allowance once the window has closed", () => {
    expect(sendsPermittedByNow({ ...opts, nowMinuteOfDay: 23 * 60 })).toBe(30);
  });

  it("permits roughly half the allowance by the middle of the day", () => {
    const mid = sendsPermittedByNow({ ...opts, nowMinuteOfDay: 12 * 60 + 30 });
    expect(mid).toBeGreaterThan(10);
    expect(mid).toBeLessThan(22);
  });

  it("never decreases as the day goes on", () => {
    let prev = 0;
    for (let m = 0; m <= 24 * 60; m += 5) {
      const n = sendsPermittedByNow({ ...opts, nowMinuteOfDay: m });
      expect(n).toBeGreaterThanOrEqual(prev);
      prev = n;
    }
    expect(prev).toBe(30);
  });

  it("never exceeds the daily cap", () => {
    for (let m = 0; m <= 24 * 60; m += 15) {
      expect(sendsPermittedByNow({ ...opts, nowMinuteOfDay: m })).toBeLessThanOrEqual(30);
    }
  });

  it("at 5/day the pacing barely bites — the cap is the binding constraint", () => {
    // Greg's point: this matters at 30, not at 5. By late morning a 5/day
    // mailbox should already be allowed most of its allowance.
    const n = sendsPermittedByNow({
      mailboxId: MB,
      dateKey: DAY,
      dailyCap: 5,
      nowMinuteOfDay: 14 * 60,
    });
    expect(n).toBeGreaterThanOrEqual(3);
  });

  it("a zero or negative cap permits nothing", () => {
    expect(sendsPermittedByNow({ ...opts, dailyCap: 0, nowMinuteOfDay: 12 * 60 })).toBe(0);
    expect(sendsPermittedByNow({ ...opts, dailyCap: -5, nowMinuteOfDay: 12 * 60 })).toBe(0);
  });
});
