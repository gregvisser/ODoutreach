import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { isSendPreflightDedupEnabled } from "./send-preflight-dedup";

const ORIGINAL = process.env.SEND_PREFLIGHT_DEDUP_ENABLED;

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.SEND_PREFLIGHT_DEDUP_ENABLED;
  else process.env.SEND_PREFLIGHT_DEDUP_ENABLED = ORIGINAL;
});

describe("isSendPreflightDedupEnabled", () => {
  it("is OFF when unset (safe default)", () => {
    delete process.env.SEND_PREFLIGHT_DEDUP_ENABLED;
    expect(isSendPreflightDedupEnabled()).toBe(false);
  });

  it("is ON only for 'true' (case- and whitespace-insensitive)", () => {
    process.env.SEND_PREFLIGHT_DEDUP_ENABLED = " TRUE ";
    expect(isSendPreflightDedupEnabled()).toBe(true);
    process.env.SEND_PREFLIGHT_DEDUP_ENABLED = "true";
    expect(isSendPreflightDedupEnabled()).toBe(true);
  });

  it("is OFF for any other value", () => {
    for (const v of ["false", "1", "yes", "", "off"]) {
      process.env.SEND_PREFLIGHT_DEDUP_ENABLED = v;
      expect(isSendPreflightDedupEnabled()).toBe(false);
    }
  });
});
