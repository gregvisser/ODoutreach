import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright e2e (BidlowAI Engineering Standard §1.5 — e2e on critical journeys).
 * Point at a running instance with PLAYWRIGHT_BASE_URL (default: local dev server).
 * See e2e/README.md for the authenticated-journey setup.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  // For local runs you can have Playwright boot the app (needs a test DB):
  // webServer: { command: "npm run dev", url: "http://localhost:3000", reuseExistingServer: !process.env.CI },
});
