import { afterEach, describe, expect, it } from "vitest";

import {
  effectiveDailyCap,
  isWarmupRampEnabled,
  warmupDailyCap,
} from "./mailbox-warmup";

/**
 * Warm-up must ramp on SENDING HISTORY, not on how long a mailbox has existed.
 *
 * Google's condition is a history of sending, not an account age:
 *   "Avoid introducing sudden volume spikes if you do not have a history of
 *    sending large volumes."  — https://support.google.com/a/answer/81126
 *
 * The ramp previously anchored on `mailboxAgeDays`, computed from `connectedAt`
 * (else `createdAt`), and its own docstring conceded that "any mailbox already
 * older than the ramp window is unaffected". So a mailbox connected months ago
 * during onboarding, which had never sent a single email, received its FULL
 * daily allowance on its very first send — no ramp at all. That is exactly the
 * mailbox this product creates: connected during setup, launched weeks later.
 *
 * The ramp's SHAPE was never the problem and is unchanged. Only what it counts
 * has changed: days on which the mailbox actually sent.
 */

const FLAG = "MAILBOX_WARMUP_RAMP";
const original = process.env[FLAG];
afterEach(() => {
  if (original === undefined) delete process.env[FLAG];
  else process.env[FLAG] = original;
});

const CONNECTED_LONG_AGO = {
  dailySendCap: 30,
  connectedAt: new Date("2026-02-01T00:00:00Z"),
  createdAt: new Date("2026-01-01T00:00:00Z"),
};

describe("the ramp counts sending days, not calendar days", () => {
  it("THE CASE THAT EXPOSED IT: connected long ago, never sent — still starts at the bottom", () => {
    process.env[FLAG] = "on";
    expect(effectiveDailyCap(CONNECTED_LONG_AGO, 0)).toBe(5);
  });

  it("a brand-new mailbox with no history also starts at the bottom", () => {
    process.env[FLAG] = "on";
    expect(
      effectiveDailyCap(
        {
          dailySendCap: 30,
          connectedAt: new Date("2026-08-24T00:00:00Z"),
          createdAt: new Date("2026-08-24T00:00:00Z"),
        },
        0,
      ),
    ).toBe(5);
  });

  it("steps up only as sending days accumulate", () => {
    process.env[FLAG] = "on";
    expect(effectiveDailyCap(CONNECTED_LONG_AGO, 4)).toBe(5);
    expect(effectiveDailyCap(CONNECTED_LONG_AGO, 5)).toBe(10);
    expect(effectiveDailyCap(CONNECTED_LONG_AGO, 14)).toBe(15);
    expect(effectiveDailyCap(CONNECTED_LONG_AGO, 25)).toBe(30);
  });

  it("never exceeds the mailbox's own configured cap, however long it has sent", () => {
    process.env[FLAG] = "on";
    expect(
      effectiveDailyCap(
        {
          dailySendCap: 12,
          connectedAt: new Date("2026-01-01T00:00:00Z"),
          createdAt: new Date("2026-01-01T00:00:00Z"),
        },
        999,
      ),
    ).toBe(12);
  });

  it("is inert when the flag is off — the configured cap, regardless of history", () => {
    delete process.env[FLAG];
    expect(isWarmupRampEnabled()).toBe(false);
    expect(effectiveDailyCap(CONNECTED_LONG_AGO, 0)).toBe(30);
  });

  it("the pure ramp is unchanged — only what is counted changed", () => {
    // Guards against anyone 'fixing' the anchor by also altering the shape.
    expect(warmupDailyCap(30, 0)).toBe(5);
    expect(warmupDailyCap(30, 5)).toBe(10);
    expect(warmupDailyCap(30, 25)).toBe(30);
  });
});
