import { describe, expect, it } from "vitest";

import { buildClientOverviewCallbackPath } from "./client-overview-callback-url";

describe("buildClientOverviewCallbackPath", () => {
  it("includes client id and optional query string", () => {
    expect(buildClientOverviewCallbackPath("c1", {})).toBe("/clients/c1");
    expect(buildClientOverviewCallbackPath("c1", { v: "x" })).toBe("/clients/c1?v=x");
    expect(buildClientOverviewCallbackPath("c1", { v: ["x", "y"] })).toBe("/clients/c1?v=x");
  });
});
