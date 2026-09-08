import { test, expect } from "@playwright/test";

test.use({ storageState: { cookies: [], origins: [] } });

test("company-sheet worker reaches its own authentication without a staff session", async ({ request }) => {
  const response = await request.post("/api/internal/company-name-sheets/v1", {
    data: { protocol: 1, planOnly: true }, maxRedirects: 0,
  });
  // E2E deliberately leaves PROCESS_QUEUE_SECRET blank as an outbound kill-switch.
  // Reaching this response proves the real middleware did not redirect to login.
  expect(response.status()).toBe(503);
  expect(await response.json()).toEqual({ error: "Company sheet sync not configured" });
  expect(response.headers().location).toBeUndefined();
});

test("nearby company-sheet paths still require a staff session", async ({ request }) => {
  const response = await request.post("/api/internal/company-name-sheets/v1/extra", { maxRedirects: 0 });
  expect(response.status()).toBe(307);
  expect(new URL(response.headers().location, response.url()).pathname).toBe("/sign-in");
});
