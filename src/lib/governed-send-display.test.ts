import { describe, expect, it } from "vitest";

import { shortenIdempotencyKey } from "./governed-send-display";

describe("shortenIdempotencyKey", () => {
  it("returns null for empty input", () => {
    expect(shortenIdempotencyKey(null)).toBeNull();
    expect(shortenIdempotencyKey(undefined)).toBeNull();
    expect(shortenIdempotencyKey("")).toBeNull();
  });

  it("shortens governedTest:client:uuid style keys to last 8 of uuid", () => {
    const k =
      "governedTest:cmo2zipl90000ggo8c9j4ysfn:c89f12e6-38ed-41f4-b1aa-075db7430058";
    expect(shortenIdempotencyKey(k)).toBe("…b7430058");
  });

  it("falls back for short strings", () => {
    expect(shortenIdempotencyKey("abc")).toBe("abc");
  });

  it("truncates long opaque strings", () => {
    const long = "x".repeat(40);
    expect(shortenIdempotencyKey(long)).toBe(`…${"x".repeat(12)}`);
  });
});
