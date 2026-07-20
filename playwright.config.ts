import { defineConfig, devices } from "@playwright/test";

import { E2E_APP_ENV, E2E_BASE_URL } from "./e2e/env";

/**
 * Playwright e2e (BidlowAI Engineering Standard §1.5 — e2e on critical journeys).
 *
 * `globalSetup` seeds a throwaway database and mints next-auth session cookies —
 * see `e2e/global-setup.ts`. The app under test is started with `E2E_APP_ENV`,
 * which points it at that database and blanks every provider credential so a
 * real send is impossible.
 *
 * Run locally:
 *   docker run -d --name odoutreach-e2e-postgres \
 *     -e POSTGRES_USER=e2e -e POSTGRES_PASSWORD=e2e_local_only \
 *     -e POSTGRES_DB=odoutreach_e2e -p 5434:5432 postgres:16-alpine
 *   E2E_DATABASE_URL=... npx prisma migrate deploy
 *   npm run build && npm run test:e2e
 */
export default defineConfig({
  testDir: "./e2e",
  // Only `.spec.ts` — `e2e/*.test.ts` belongs to vitest (e.g. the seed's
  // safe-database guard), and Playwright's default testMatch would claim it.
  testMatch: "**/*.spec.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  globalSetup: "./e2e/global-setup.ts",
  use: {
    baseURL: E2E_BASE_URL,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // Production build, matching what CI and Azure actually run.
    command: "npm run start",
    url: E2E_BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: E2E_APP_ENV,
  },
});
