import { test, expect } from "@playwright/test";
test.use({ storageState: { cookies: [], origins: [] } });

test("the scheduler reaches its own authentication without a browser session", async ({ request }) => {
  // The isolated app blanks worker secrets; a 503 here proves middleware
  // reached the route's own configuration guard instead of redirecting.
  const response = await request.post("/api/internal/scheduled-outreach/v1", {
    data: { schedulerProtocol: 1, phase: "plan" }, maxRedirects: 0,
  });
  expect(response.status()).toBe(503);
  expect(await response.json()).toEqual({ error: "Scheduler not configured" });
  expect(response.headers().location).toBeUndefined();
});
test("nearby scheduler paths still require staff sign-in", async ({ request }) => {
  const response = await request.post("/api/internal/scheduled-outreach/v1/extra", { maxRedirects: 0 });
  expect(response.status()).toBe(307);
  expect(new URL(response.headers().location, response.url()).pathname).toBe("/sign-in");
});
