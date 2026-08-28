import { describe, expect, it } from "vitest";

import {
  createSheetsReadLimiter,
  isSheetsQuotaError,
} from "./sheets-read-limiter";

/**
 * The verbatim message the live sync returned on 2026-08-28 at 11:18 UTC,
 * for five of thirty-four sheets. Kept exact rather than paraphrased: this
 * module exists to recognise THIS string, and a tidied-up version of it would
 * let the recogniser drift away from what Google actually sends.
 */
const PRODUCTION_QUOTA_MESSAGE =
  "Quota exceeded for quota metric 'Read requests' and limit 'Read requests " +
  "per minute per user' of service 'sheets.googleapis.com' for consumer " +
  "'project_number:452662141668'.";

/** A fake clock: sleeping is the only thing that advances it. */
function fakeTimer() {
  const slept: number[] = [];
  let clock = 0;
  return {
    slept,
    now: () => clock,
    sleep: async (ms: number) => {
      slept.push(ms);
      clock += ms;
    },
  };
}

describe("isSheetsQuotaError", () => {
  it("recognises the message the live sync actually returned", () => {
    expect(isSheetsQuotaError(new Error(PRODUCTION_QUOTA_MESSAGE))).toBe(true);
  });

  it("recognises a 429 that carries no helpful message", () => {
    expect(isSheetsQuotaError({ code: 429, message: "Too Many Requests" })).toBe(
      true,
    );
  });

  it("does NOT treat a bad range as a quota error", () => {
    // This is the failure the whole item is about. Retrying it would waste the
    // backoff on something that will never succeed, and — worse — would make a
    // permanently broken sheet look like a transient blip in the logs.
    expect(
      isSheetsQuotaError(
        new Error("Unable to parse range: Sheet1!A1:Z50000"),
      ),
    ).toBe(false);
  });

  it("does NOT treat a permissions failure as a quota error", () => {
    expect(
      isSheetsQuotaError({ code: 403, message: "The caller does not have permission" }),
    ).toBe(false);
  });
});

describe("createSheetsReadLimiter", () => {
  it("does not delay the first read", async () => {
    const timer = fakeTimer();
    const limit = createSheetsReadLimiter(timer, { minIntervalMs: 1_100 });

    await expect(limit(async () => "first")).resolves.toBe("first");

    expect(timer.slept).toEqual([]);
  });

  it("spaces consecutive reads by the minimum interval", async () => {
    const timer = fakeTimer();
    const limit = createSheetsReadLimiter(timer, { minIntervalMs: 1_100 });

    await limit(async () => "a");
    await limit(async () => "b");
    await limit(async () => "c");

    // Two gaps for three reads. This is the whole fix: thirty-four sheets each
    // making two calls is sixty-eight requests, and Google allows sixty a
    // minute per user.
    expect(timer.slept).toEqual([1_100, 1_100]);
  });

  it("retries a quota error and returns the eventual value", async () => {
    const timer = fakeTimer();
    const limit = createSheetsReadLimiter(timer, {
      minIntervalMs: 0,
      backoffMs: [5_000, 20_000],
    });

    let attempts = 0;
    const value = await limit(async () => {
      attempts += 1;
      if (attempts < 3) throw new Error(PRODUCTION_QUOTA_MESSAGE);
      return "read at last";
    });

    expect(value).toBe("read at last");
    expect(attempts).toBe(3);
    expect(timer.slept).toEqual([5_000, 20_000]);
  });

  it("gives up after the configured attempts and rethrows", async () => {
    const timer = fakeTimer();
    const limit = createSheetsReadLimiter(timer, {
      minIntervalMs: 0,
      backoffMs: [5_000],
    });

    let attempts = 0;
    await expect(
      limit(async () => {
        attempts += 1;
        throw new Error(PRODUCTION_QUOTA_MESSAGE);
      }),
    ).rejects.toThrow(/Quota exceeded/);

    // One retry, not an unbounded loop: a sheet that is genuinely over quota
    // must eventually surface as a failure rather than hold the whole run open.
    expect(attempts).toBe(2);
  });

  it("does not retry an error that is not a quota error", async () => {
    const timer = fakeTimer();
    const limit = createSheetsReadLimiter(timer, {
      minIntervalMs: 0,
      backoffMs: [5_000],
    });

    let attempts = 0;
    await expect(
      limit(async () => {
        attempts += 1;
        throw new Error("Unable to parse range: Sheet1!A1:Z50000");
      }),
    ).rejects.toThrow(/Unable to parse range/);

    expect(attempts).toBe(1);
    expect(timer.slept).toEqual([]);
  });

  it("serialises overlapping reads so the interval still holds", async () => {
    const timer = fakeTimer();
    const limit = createSheetsReadLimiter(timer, { minIntervalMs: 1_100 });

    const order: string[] = [];
    // Fired together, as the sync-all loop would if it ever stopped awaiting.
    await Promise.all([
      limit(async () => {
        order.push("a");
      }),
      limit(async () => {
        order.push("b");
      }),
    ]);

    expect(order).toEqual(["a", "b"]);
    expect(timer.slept).toEqual([1_100]);
  });

  it("keeps pacing after a read throws", async () => {
    const timer = fakeTimer();
    const limit = createSheetsReadLimiter(timer, { minIntervalMs: 1_100 });

    await expect(
      limit(async () => {
        throw new Error("The caller does not have permission");
      }),
    ).rejects.toThrow(/permission/);

    await limit(async () => "next");

    // A failed read still consumed a request against the quota, so the next one
    // waits. Letting a failure reset the pacing is how a run that is already
    // being throttled turns into a burst.
    expect(timer.slept).toEqual([1_100]);
  });
});
