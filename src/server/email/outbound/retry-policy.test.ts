import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  computeNextRetryAt,
  isRetryableSendFailure,
  maxOutboundSendRetries,
} from "./retry-policy";

const DEFAULT_MAX = 5;

describe("maxOutboundSendRetries", () => {
  const original = process.env.MAX_OUTBOUND_SEND_RETRIES;

  beforeEach(() => {
    delete process.env.MAX_OUTBOUND_SEND_RETRIES;
  });

  afterEach(() => {
    if (original === undefined) delete process.env.MAX_OUTBOUND_SEND_RETRIES;
    else process.env.MAX_OUTBOUND_SEND_RETRIES = original;
  });

  it("defaults to 5 when unset", () => {
    expect(maxOutboundSendRetries()).toBe(DEFAULT_MAX);
  });

  it("reads a configured value", () => {
    process.env.MAX_OUTBOUND_SEND_RETRIES = "2";
    expect(maxOutboundSendRetries()).toBe(2);
  });

  it("allows 0 to disable retries entirely", () => {
    process.env.MAX_OUTBOUND_SEND_RETRIES = "0";
    expect(maxOutboundSendRetries()).toBe(0);
  });

  it("tolerates surrounding whitespace", () => {
    process.env.MAX_OUTBOUND_SEND_RETRIES = "  3  ";
    expect(maxOutboundSendRetries()).toBe(3);
  });

  it.each(["", "   "])("falls back to the default for blank value %p", (value) => {
    process.env.MAX_OUTBOUND_SEND_RETRIES = value;
    expect(maxOutboundSendRetries()).toBe(DEFAULT_MAX);
  });

  it("falls back to the default for a non-numeric value", () => {
    process.env.MAX_OUTBOUND_SEND_RETRIES = "unlimited";
    expect(maxOutboundSendRetries()).toBe(DEFAULT_MAX);
  });

  it("falls back to the default for a negative value", () => {
    // A negative cap would otherwise mean "never retry" by accident.
    process.env.MAX_OUTBOUND_SEND_RETRIES = "-1";
    expect(maxOutboundSendRetries()).toBe(DEFAULT_MAX);
  });

  it("takes the leading integer of a trailing-garbage value", () => {
    // Documents parseInt's lenient behaviour rather than pretending it validates.
    process.env.MAX_OUTBOUND_SEND_RETRIES = "4abc";
    expect(maxOutboundSendRetries()).toBe(4);
  });
});

describe("isRetryableSendFailure", () => {
  it("returns false when neither code nor message is supplied", () => {
    expect(isRetryableSendFailure()).toBe(false);
    expect(isRetryableSendFailure(undefined, undefined)).toBe(false);
  });

  it.each(["429", "408", "502", "503", "504"])(
    "retries transient provider status %s",
    (code) => {
      expect(isRetryableSendFailure(code)).toBe(true);
    },
  );

  it.each(["400", "401", "403", "404", "422", "500"])(
    "does not retry non-transient status %s",
    (code) => {
      expect(isRetryableSendFailure(code)).toBe(false);
    },
  );

  it("tolerates whitespace around the code", () => {
    expect(isRetryableSendFailure(" 429 ")).toBe(true);
  });

  it.each([
    "Request timeout",
    "the request timed out",
    "read ECONNRESET",
    "socket hang up",
    "Rate limit exceeded",
  ])("retries transport-style message %p", (message) => {
    expect(isRetryableSendFailure(undefined, message)).toBe(true);
  });

  it("matches retryable messages case-insensitively", () => {
    expect(isRetryableSendFailure(undefined, "TIMED OUT")).toBe(true);
    expect(isRetryableSendFailure(undefined, "ECONNRESET")).toBe(true);
  });

  it("does not retry a permanent rejection message", () => {
    expect(isRetryableSendFailure("422", "recipient address is invalid")).toBe(false);
    expect(isRetryableSendFailure(undefined, "message rejected as spam")).toBe(false);
  });

  it("retries when the message is transient even if the code is not", () => {
    expect(isRetryableSendFailure("500", "upstream timeout")).toBe(true);
  });
});

describe("computeNextRetryAt", () => {
  const from = new Date("2026-03-01T12:00:00.000Z");
  const minutes = (n: number) => n * 60_000;

  it("waits 15 seconds before the first retry", () => {
    expect(computeNextRetryAt(0, from).getTime() - from.getTime()).toBe(15_000);
  });

  it.each([
    [1, 30_000],
    [2, 60_000],
    [3, 120_000],
    [4, 240_000],
    [5, 480_000],
  ])("doubles the delay at retry %i", (retryCount, expected) => {
    expect(computeNextRetryAt(retryCount, from).getTime() - from.getTime()).toBe(expected);
  });

  it("caps the delay at 15 minutes", () => {
    // 15s * 2^6 = 16 min, which exceeds the cap.
    expect(computeNextRetryAt(6, from).getTime() - from.getTime()).toBe(minutes(15));
  });

  it.each([10, 11, 50, 1000])(
    "stays capped at 15 minutes for a high retry count (%i)",
    (retryCount) => {
      expect(computeNextRetryAt(retryCount, from).getTime() - from.getTime()).toBe(
        minutes(15),
      );
    },
  );

  it("never returns a time in the past", () => {
    for (const retryCount of [0, 1, 5, 20]) {
      expect(computeNextRetryAt(retryCount, from).getTime()).toBeGreaterThan(
        from.getTime(),
      );
    }
  });

  it("does not mutate the supplied date", () => {
    const original = from.getTime();
    computeNextRetryAt(3, from);
    expect(from.getTime()).toBe(original);
  });

  it("defaults to the current time when no base is given", () => {
    const before = Date.now();
    const next = computeNextRetryAt(0).getTime();
    expect(next).toBeGreaterThanOrEqual(before + 15_000);
  });
});
