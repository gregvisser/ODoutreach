import { describe, expect, it } from "vitest";

import { createBuildInfo } from "./build-info";

describe("createBuildInfo", () => {
  it("returns only non-secret build metadata", () => {
    const info = createBuildInfo({
      npm_package_version: "1.2.3",
      NODE_ENV: "production",
      GITHUB_SHA: "abcdef123456",
      BUILD_TIMESTAMP: "2026-05-06T02:00:00.000Z",
      SECRET_VALUE: "do-not-include",
    });

    expect(info).toEqual({
      service: "opensdoors-outreach",
      version: "1.2.3",
      nodeEnv: "production",
      commit: "abcdef123456",
      buildTimestamp: "2026-05-06T02:00:00.000Z",
    });
    expect(JSON.stringify(info)).not.toContain("do-not-include");
  });

  it("uses nulls when deployment metadata is unavailable", () => {
    expect(createBuildInfo({})).toEqual({
      service: "opensdoors-outreach",
      version: null,
      nodeEnv: null,
      commit: null,
      buildTimestamp: null,
    });
  });
});
