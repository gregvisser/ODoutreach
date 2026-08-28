import { afterEach, describe, expect, it } from "vitest";

import {
  DEFAULT_SEND_BATCH_SIZE,
  isSendPacingEnabled,
  MAX_SEND_BATCH_SIZE,
  pacedAllowanceForMailbox,
  PACING_WINDOW_END_MINUTE,
  PACING_WINDOW_START_MINUTE,
  resolveSendBatchSize,
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

/** The distinct minutes-of-day a schedule fires on, ascending. One per batch. */
function distinctSendMinutes(slots: number[]): number[] {
  return [...new Set(slots)].sort((a, b) => a - b);
}

/** How many sends land on each distinct minute, in schedule order. */
function batchSizes(slots: number[]): number[] {
  return distinctSendMinutes(slots).map(
    (m) => slots.filter((s) => s === m).length,
  );
}

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

  it("keeps a real gap between consecutive BATCHES at full volume", () => {
    // Was: a gap between every individual send. The promise to the client is a
    // small group at a time, so the gap now belongs BETWEEN groups. Within a
    // group there is deliberately no gap — that is what "4 at a time" means.
    const slots = sendSlotsForDay({ mailboxId: MB, dateKey: DAY, dailyCap: 30 });
    const minutes = distinctSendMinutes(slots);
    const gaps = minutes.slice(1).map((m, i) => m - minutes[i]);
    // Microsoft's hard ceiling is 30 messages per MINUTE; a group of four in one
    // minute is nowhere near it, but two groups landing together would defeat
    // the spread this exists to create.
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

/**
 * FOUR AT A TIME, WITH GAPS.
 *
 * This is what was actually promised to the client, and what a steady one-every-
 * 22-minutes drip is NOT. A person clears a handful of emails, then does
 * something else for an hour. The batch is the human-appearance argument; the
 * gap between batches is the spread argument. Both are JUDGEMENT, stated as such
 * — no provider publishes a batch size.
 */
describe("sends go out in batches, not one at a time", () => {
  it("a batch of 4 fires 4 sends on the same minute", () => {
    const slots = sendSlotsForDay({
      mailboxId: MB,
      dateKey: DAY,
      dailyCap: 12,
      batchSize: 4,
    });
    expect(slots).toHaveLength(12);
    expect(distinctSendMinutes(slots)).toHaveLength(3);
    expect(batchSizes(slots)).toEqual([4, 4, 4]);
  });

  it("four at a time is the default when no client has configured a size", () => {
    expect(DEFAULT_SEND_BATCH_SIZE).toBe(4);
    const slots = sendSlotsForDay({ mailboxId: MB, dateKey: DAY, dailyCap: 12 });
    expect(batchSizes(slots)).toEqual([4, 4, 4]);
  });

  it("the last batch of the day carries the remainder, and nothing is lost", () => {
    // 10 at 4-a-time is 4 + 4 + 2, not 4 + 4 + 4 with two sends invented.
    const slots = sendSlotsForDay({
      mailboxId: MB,
      dateKey: DAY,
      dailyCap: 10,
      batchSize: 4,
    });
    expect(slots).toHaveLength(10);
    expect(batchSizes(slots)).toEqual([4, 4, 2]);
  });

  it("keeps a real gap between batches, and spreads them across the day", () => {
    const slots = sendSlotsForDay({
      mailboxId: MB,
      dateKey: DAY,
      dailyCap: 30,
      batchSize: 4,
    });
    const minutes = distinctSendMinutes(slots);
    // 30 at 4-a-time is 8 batches across 11 hours — over an hour apart.
    expect(minutes).toHaveLength(8);
    const gaps = minutes.slice(1).map((m, i) => m - minutes[i]);
    expect(Math.min(...gaps)).toBeGreaterThanOrEqual(30);
    expect(Math.max(...minutes)).toBeGreaterThan(15 * 60);
  });

  it("a batch size of 1 is the old one-at-a-time drip, unchanged", () => {
    const slots = sendSlotsForDay({
      mailboxId: MB,
      dateKey: DAY,
      dailyCap: 30,
      batchSize: 1,
    });
    expect(distinctSendMinutes(slots)).toHaveLength(30);
    const gaps = slots.slice(1).map((m, i) => m - slots[i]);
    expect(Math.min(...gaps)).toBeGreaterThanOrEqual(5);
  });

  it("batches still avoid the ISP peak marks", () => {
    const peaks = new Set([0, 15, 30, 45]);
    for (const mb of ["mailbox-aaa", "mailbox-bbb", "mailbox-ccc"]) {
      for (const size of [2, 4, 6]) {
        for (const m of sendSlotsForDay({
          mailboxId: mb,
          dateKey: DAY,
          dailyCap: 30,
          batchSize: size,
        })) {
          expect(peaks.has(m % 60)).toBe(false);
        }
      }
    }
  });

  it("batching never raises the allowance — the cap is still the ceiling", () => {
    for (const size of [1, 4, 10, 30]) {
      const slots = sendSlotsForDay({
        mailboxId: MB,
        dateKey: DAY,
        dailyCap: 12,
        batchSize: size,
      });
      expect(slots).toHaveLength(12);
      for (let m = 0; m <= 24 * 60; m += 15) {
        expect(
          sendsPermittedByNow({
            mailboxId: MB,
            dateKey: DAY,
            dailyCap: 12,
            batchSize: size,
            nowMinuteOfDay: m,
          }),
        ).toBeLessThanOrEqual(12);
      }
    }
  });

  it("releases a whole batch at once, then holds until the next one is due", () => {
    // The behaviour a non-coder can check: at the moment the first batch is due
    // the mailbox is allowed 4, not 1, and it stays at 4 until the second batch.
    const opts = { mailboxId: MB, dateKey: DAY, dailyCap: 30, batchSize: 4 };
    const minutes = distinctSendMinutes(sendSlotsForDay(opts));
    const first = minutes[0]!;
    const second = minutes[1]!;
    expect(sendsPermittedByNow({ ...opts, nowMinuteOfDay: first - 1 })).toBe(0);
    expect(sendsPermittedByNow({ ...opts, nowMinuteOfDay: first })).toBe(4);
    expect(sendsPermittedByNow({ ...opts, nowMinuteOfDay: second - 1 })).toBe(4);
    expect(sendsPermittedByNow({ ...opts, nowMinuteOfDay: second })).toBe(8);
  });

  it("nothing is stranded — the full allowance is released once the window shuts", () => {
    expect(
      sendsPermittedByNow({
        mailboxId: MB,
        dateKey: DAY,
        dailyCap: 30,
        batchSize: 4,
        nowMinuteOfDay: 23 * 60,
      }),
    ).toBe(30);
  });
});

/**
 * The batch size is a PER-CLIENT setting (`Client.sendBatchSize`), so the value
 * arriving here is whatever is in the database — including null for every client
 * that predates the column. Every one of those cases has to land somewhere sane,
 * because this number decides how much real email leaves at once.
 */
describe("resolveSendBatchSize — a per-client number out of the database", () => {
  it("falls back to four when the client has not set one", () => {
    expect(resolveSendBatchSize(null)).toBe(DEFAULT_SEND_BATCH_SIZE);
    expect(resolveSendBatchSize(undefined)).toBe(DEFAULT_SEND_BATCH_SIZE);
  });

  it("uses the client's own size when set", () => {
    expect(resolveSendBatchSize(1)).toBe(1);
    expect(resolveSendBatchSize(6)).toBe(6);
  });

  it("refuses to let a bad value open the taps", () => {
    expect(resolveSendBatchSize(0)).toBe(1);
    expect(resolveSendBatchSize(-4)).toBe(1);
    expect(resolveSendBatchSize(9999)).toBe(MAX_SEND_BATCH_SIZE);
    expect(resolveSendBatchSize(Number.NaN)).toBe(DEFAULT_SEND_BATCH_SIZE);
    expect(resolveSendBatchSize(Number.POSITIVE_INFINITY)).toBe(
      MAX_SEND_BATCH_SIZE,
    );
    expect(resolveSendBatchSize(4.9)).toBe(4);
  });
});

/**
 * IT IS ON. This is the half of the item that matters most.
 *
 * Pacing shipped default-OFF, `MAILBOX_SEND_PACING` was never set in
 * production, and so it never ran once. These assertions exist so that state
 * cannot come back silently: unset must mean ON.
 */
describe("pacing is on unless somebody deliberately turns it off", () => {
  const ORIGINAL = process.env.MAILBOX_SEND_PACING;
  afterEach(() => {
    if (ORIGINAL === undefined) delete process.env.MAILBOX_SEND_PACING;
    else process.env.MAILBOX_SEND_PACING = ORIGINAL;
  });

  it("is ON when the flag is unset — the default nobody has to remember", () => {
    delete process.env.MAILBOX_SEND_PACING;
    expect(isSendPacingEnabled()).toBe(true);
  });

  it("is ON when the flag is set but empty, as in .env.example", () => {
    process.env.MAILBOX_SEND_PACING = "";
    expect(isSendPacingEnabled()).toBe(true);
    process.env.MAILBOX_SEND_PACING = "   ";
    expect(isSendPacingEnabled()).toBe(true);
  });

  it("can still be switched off deliberately", () => {
    for (const off of ["false", "FALSE", "off", "0", "no"]) {
      process.env.MAILBOX_SEND_PACING = off;
      expect(isSendPacingEnabled()).toBe(false);
    }
  });
});

/**
 * `pacedAllowanceForMailbox` is the gate both send paths call. It is the one
 * place that decides how much real email may leave right now.
 */
describe("pacedAllowanceForMailbox — the gate the dispatcher calls", () => {
  const ORIGINAL = process.env.MAILBOX_SEND_PACING;
  afterEach(() => {
    if (ORIGINAL === undefined) delete process.env.MAILBOX_SEND_PACING;
    else process.env.MAILBOX_SEND_PACING = ORIGINAL;
  });

  /** 09:00 UTC on the fixture day — mid-morning, inside the send window. */
  const AT = new Date("2026-09-01T09:00:00Z");

  it("holds back most of a 30/day cap mid-morning, in whole batches", () => {
    delete process.env.MAILBOX_SEND_PACING;
    const allowed = pacedAllowanceForMailbox({
      mailboxId: MB,
      dailyCap: 30,
      batchSize: 4,
      at: AT,
    });
    expect(allowed).toBeLessThan(30);
    expect(allowed % 4).toBe(0);
  });

  it("never raises the cap, at any hour of any day", () => {
    delete process.env.MAILBOX_SEND_PACING;
    for (let hour = 0; hour < 24; hour += 1) {
      const at = new Date(Date.UTC(2026, 8, 1, hour, 0, 0));
      expect(
        pacedAllowanceForMailbox({
          mailboxId: MB,
          dailyCap: 30,
          batchSize: 4,
          at,
        }),
      ).toBeLessThanOrEqual(30);
    }
  });

  it("yields the whole cap when pacing is switched off", () => {
    process.env.MAILBOX_SEND_PACING = "false";
    expect(
      pacedAllowanceForMailbox({
        mailboxId: MB,
        dailyCap: 30,
        batchSize: 4,
        at: AT,
      }),
    ).toBe(30);
  });

  it("a client that has set no batch size still gets paced, at four", () => {
    delete process.env.MAILBOX_SEND_PACING;
    expect(
      pacedAllowanceForMailbox({
        mailboxId: MB,
        dailyCap: 30,
        batchSize: null,
        at: AT,
      }),
    ).toBe(
      pacedAllowanceForMailbox({
        mailboxId: MB,
        dailyCap: 30,
        batchSize: DEFAULT_SEND_BATCH_SIZE,
        at: AT,
      }),
    );
  });
});
