import { describe, expect, it } from "vitest";

import { isPublicPath } from "./lib/public-paths";

describe("isPublicPath", () => {
  it("allows public health and build marker endpoints", () => {
    expect(isPublicPath("/api/health")).toBe(true);
    expect(isPublicPath("/api/build-info")).toBe(true);
    expect(isPublicPath("/api/internal/replies/sync")).toBe(true);
  });

  it("allows the cron-driven internal routes so their bearer-token calls are not redirected to sign-in", () => {
    expect(isPublicPath("/api/internal/outbound/process-queue")).toBe(true);
    expect(isPublicPath("/api/internal/sequences/advance")).toBe(true);
    expect(isPublicPath("/api/internal/suppression/sync-all")).toBe(true);
  });

  it("keeps the staff notifications poll behind the session (not public)", () => {
    expect(isPublicPath("/api/notifications/replies")).toBe(false);
  });

  it("keeps application pages protected by default", () => {
    expect(isPublicPath("/clients/example")).toBe(false);
  });
});
