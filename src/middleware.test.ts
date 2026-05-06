import { describe, expect, it } from "vitest";

import { isPublicPath } from "./lib/public-paths";

describe("isPublicPath", () => {
  it("allows public health and build marker endpoints", () => {
    expect(isPublicPath("/api/health")).toBe(true);
    expect(isPublicPath("/api/build-info")).toBe(true);
    expect(isPublicPath("/api/internal/replies/sync")).toBe(true);
  });

  it("keeps application pages protected by default", () => {
    expect(isPublicPath("/clients/example")).toBe(false);
  });
});
