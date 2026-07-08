import { afterEach, describe, expect, it } from "vitest";

import {
  effectiveDailyCap,
  isWarmupRampEnabled,
  mailboxAgeDays,
  warmupDailyCap,
} from "./mailbox-warmup";

const FLAG = "MAILBOX_WARMUP_RAMP";
const original = process.env[FLAG];
afterEach(() => {
  if (original === undefined) delete process.env[FLAG];
  else process.env[FLAG] = original;
});

// Freeze one reference instant so `now` and `daysAgo(...)` share a single clock.
// Reading Date.now() twice (once for `now`, again inside daysAgo) lets a
// millisecond tick between them and floor the computed age down by a whole day,
// which intermittently flaked the ramp assertions in CI.
const NOW_MS = Date.now();
const NOW = new Date(NOW_MS);
function daysAgo(n: number): Date {
  return new Date(NOW_MS - n * 86_400_000);
}

describe("warmupDailyCap (pure ramp)", () => {
  it("starts at the base cap and steps +5 every 5 days up to the steady cap", () => {
    expect(warmupDailyCap(30, 0)).toBe(5); // day 0
    expect(warmupDailyCap(30, 4)).toBe(5); // still week-1 step
    expect(warmupDailyCap(30, 5)).toBe(10);
    expect(warmupDailyCap(30, 10)).toBe(15);
    expect(warmupDailyCap(30, 15)).toBe(20);
    expect(warmupDailyCap(30, 20)).toBe(25);
    expect(warmupDailyCap(30, 25)).toBe(30); // reaches steady ~day 25 (~3.5 weeks)
  });

  it("never exceeds the mailbox's configured steady cap", () => {
    expect(warmupDailyCap(30, 100)).toBe(30);
    expect(warmupDailyCap(20, 100)).toBe(20); // lower custom cap respected
    expect(warmupDailyCap(20, 25)).toBe(20);
  });

  it("clamps odd inputs safely (never returns < 1)", () => {
    expect(warmupDailyCap(30, -3)).toBe(5); // clock skew → treat as day 0
    expect(warmupDailyCap(0, 100)).toBe(1); // steady floored to 1
    expect(warmupDailyCap(30, Number.NaN)).toBe(5);
  });
});

describe("mailboxAgeDays", () => {
  it("anchors to connectedAt when present, else createdAt", () => {
    const now = NOW;
    expect(
      mailboxAgeDays({ connectedAt: daysAgo(7), createdAt: daysAgo(40) }, now),
    ).toBe(7);
    expect(
      mailboxAgeDays({ connectedAt: null, createdAt: daysAgo(12) }, now),
    ).toBe(12);
  });
});

describe("isWarmupRampEnabled", () => {
  it("is off unless the flag is exactly 'on'", () => {
    delete process.env[FLAG];
    expect(isWarmupRampEnabled()).toBe(false);
    process.env[FLAG] = "true";
    expect(isWarmupRampEnabled()).toBe(false);
    process.env[FLAG] = "on";
    expect(isWarmupRampEnabled()).toBe(true);
  });
});

describe("effectiveDailyCap", () => {
  it("returns the configured cap unchanged when the ramp is disabled", () => {
    delete process.env[FLAG];
    const now = NOW;
    expect(
      effectiveDailyCap({ dailySendCap: 30, connectedAt: null, createdAt: now }, now),
    ).toBe(30);
    expect(
      effectiveDailyCap({ dailySendCap: 0, connectedAt: null, createdAt: now }, now),
    ).toBe(30); // falls back to DEFAULT (30) exactly like the prior expression
  });

  it("ramps young mailboxes but leaves warmed mailboxes at their configured cap when enabled", () => {
    process.env[FLAG] = "on";
    const now = NOW;
    expect(
      effectiveDailyCap({ dailySendCap: 30, connectedAt: now, createdAt: now }, now),
    ).toBe(5); // brand new
    expect(
      effectiveDailyCap({ dailySendCap: 30, connectedAt: daysAgo(10), createdAt: daysAgo(40) }, now),
    ).toBe(15);
    expect(
      effectiveDailyCap({ dailySendCap: 30, connectedAt: daysAgo(60), createdAt: daysAgo(90) }, now),
    ).toBe(30); // long-warmed → unaffected
  });
});
