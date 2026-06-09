import { describe, expect, it } from "vitest";

import {
  DEFAULT_AUTO_FOLLOWUP_FRESHNESS_DAYS,
  freshnessDaysToMs,
  isFollowUpTooStaleForAutoSend,
  resolveAutoFollowUpFreshnessDays,
} from "./auto-followup-window";

const DAY = 24 * 60 * 60 * 1000;

describe("resolveAutoFollowUpFreshnessDays", () => {
  it("defaults to 3 days when unset/invalid", () => {
    expect(DEFAULT_AUTO_FOLLOWUP_FRESHNESS_DAYS).toBe(3);
    expect(resolveAutoFollowUpFreshnessDays(undefined)).toBe(3);
    expect(resolveAutoFollowUpFreshnessDays("")).toBe(3);
    expect(resolveAutoFollowUpFreshnessDays("abc")).toBe(3);
    expect(resolveAutoFollowUpFreshnessDays("0")).toBe(3);
    expect(resolveAutoFollowUpFreshnessDays("-5")).toBe(3);
  });

  it("honours a positive override", () => {
    expect(resolveAutoFollowUpFreshnessDays("7")).toBe(7);
    expect(resolveAutoFollowUpFreshnessDays(" 1 ")).toBe(1);
  });
});

describe("isFollowUpTooStaleForAutoSend", () => {
  const prevSentAtMs = Date.parse("2026-06-01T00:00:00.000Z");
  const delayMs = 3 * DAY; // due on 2026-06-04
  const maxOverdueMs = 3 * DAY; // auto-send only within 3 days of becoming due

  it("not stale before the delay has even elapsed (not due yet)", () => {
    const nowMs = Date.parse("2026-06-02T00:00:00.000Z");
    expect(
      isFollowUpTooStaleForAutoSend({ prevSentAtMs, delayMs, nowMs, maxOverdueMs }),
    ).toBe(false);
  });

  it("not stale when freshly due (within the window)", () => {
    const nowMs = Date.parse("2026-06-05T00:00:00.000Z"); // 1 day overdue
    expect(
      isFollowUpTooStaleForAutoSend({ prevSentAtMs, delayMs, nowMs, maxOverdueMs }),
    ).toBe(false);
  });

  it("not stale exactly at the window boundary", () => {
    const nowMs = Date.parse("2026-06-07T00:00:00.000Z"); // exactly 3 days overdue
    expect(
      isFollowUpTooStaleForAutoSend({ prevSentAtMs, delayMs, nowMs, maxOverdueMs }),
    ).toBe(false);
  });

  it("stale once more than the window past due", () => {
    const nowMs = Date.parse("2026-06-08T00:00:00.000Z"); // 4 days overdue
    expect(
      isFollowUpTooStaleForAutoSend({ prevSentAtMs, delayMs, nowMs, maxOverdueMs }),
    ).toBe(true);
  });

  it("very overdue (the backlog-blast case) is stale → waits for manual send", () => {
    const nowMs = Date.parse("2026-07-01T00:00:00.000Z"); // ~4 weeks overdue
    expect(
      isFollowUpTooStaleForAutoSend({ prevSentAtMs, delayMs, nowMs, maxOverdueMs }),
    ).toBe(true);
  });

  it("freshnessDaysToMs converts correctly", () => {
    expect(freshnessDaysToMs(3)).toBe(3 * DAY);
    expect(freshnessDaysToMs(0)).toBe(0);
  });
});
