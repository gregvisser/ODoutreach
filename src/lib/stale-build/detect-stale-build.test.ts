import { describe, expect, it } from "vitest";

import {
  isStaleBuild,
  isStaleBuildInfo,
  STALE_BUILD_POLL_INTERVAL_MS,
} from "./detect-stale-build";

describe("isStaleBuild", () => {
  it("is false when commits match", () => {
    expect(isStaleBuild("abc123", "abc123")).toBe(false);
  });

  it("is true when commits differ", () => {
    expect(isStaleBuild("old-sha", "new-sha")).toBe(true);
  });

  it("is false when either side lacks a commit (cannot compare)", () => {
    expect(isStaleBuild(null, "abc")).toBe(false);
    expect(isStaleBuild("abc", null)).toBe(false);
    expect(isStaleBuild(null, null)).toBe(false);
  });

  it("works with build-info payloads", () => {
    expect(
      isStaleBuildInfo("client", { commit: "server" }),
    ).toBe(true);
    expect(
      isStaleBuildInfo("same", { commit: "same" }),
    ).toBe(false);
  });

  it("polls on a few-minute cadence", () => {
    expect(STALE_BUILD_POLL_INTERVAL_MS).toBeGreaterThanOrEqual(120_000);
    expect(STALE_BUILD_POLL_INTERVAL_MS).toBeLessThanOrEqual(600_000);
  });
});
