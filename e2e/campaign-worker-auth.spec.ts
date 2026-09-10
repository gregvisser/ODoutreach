import { test, expect } from "@playwright/test";
test.use({ storageState: { cookies: [], origins: [] } });
test("campaign worker reaches its own authentication without a staff session", async ({ request }) => {
  const response = await request.post("/api/internal/campaign-scheduler/v1", { data: { campaignSchedulerProtocol: 1 }, maxRedirects: 0 });
  // The E2E server leaves the sending secret unset deliberately.
  expect(response.status()).toBe(503);
  expect(await response.json()).toEqual({ error: "Scheduler not configured" });
  expect(response.headers().location).toBeUndefined();
});
test("campaign worker exception does not expose nearby routes", async ({ request }) => {
  const response = await request.post("/api/internal/campaign-scheduler/v1/extra", { maxRedirects: 0 });
  expect(response.status()).toBe(307);
  expect(new URL(response.headers().location, response.url()).pathname).toBe("/sign-in");
});
