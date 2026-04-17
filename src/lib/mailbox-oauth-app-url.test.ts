import { describe, expect, it, vi } from "vitest";

describe("getAppBaseUrl", () => {
  it("prefers AUTH_URL", async () => {
    vi.stubEnv("AUTH_URL", "https://example.com/");
    vi.stubEnv("VERCEL_URL", undefined);
    const { getAppBaseUrl } = await import("./mailbox-oauth-app-url");
    expect(getAppBaseUrl()).toBe("https://example.com");
  });
});
