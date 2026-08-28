import path from "node:path";

import { defineConfig } from "vitest/config";

/**
 * Integration tests — real Prisma against a real PostgreSQL schema.
 *
 * Separate from `vitest.config.ts` on purpose: `npm test` must stay DB-free and
 * fast (see AGENTS.md), while this suite requires the throwaway e2e database.
 * These cover the `src/server` orchestration that mock-based unit tests cannot
 * cover honestly — a mocked Prisma test mostly asserts the mock.
 *
 * Run locally (same container the e2e suite uses):
 *   docker run -d --name odoutreach-e2e-postgres \
 *     -e POSTGRES_USER=e2e -e POSTGRES_PASSWORD=e2e_local_only \
 *     -e POSTGRES_DB=odoutreach_e2e -p 5434:5432 postgres:16-alpine
 *   npm run db:migrate:e2e
 *   npm run test:integration
 */
const E2E_DATABASE_URL =
  process.env.E2E_DATABASE_URL?.trim() ||
  "postgresql://e2e:e2e_local_only@localhost:5434/odoutreach_e2e?schema=public";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.integration.test.ts"],
    // Every test truncates the shared database, so they must not overlap.
    fileParallelism: false,
    sequence: { concurrent: false },
    poolOptions: { threads: { singleThread: true } },
    testTimeout: 30_000,
    hookTimeout: 30_000,
    env: {
      // `src/lib/db.ts` reads DATABASE_URL at module load — set it before any
      // server module is imported.
      DATABASE_URL: E2E_DATABASE_URL,
      E2E_DATABASE_URL,

      // --- send kill-switches -------------------------------------------------
      // Integration tests exercise the dispatcher. `mock` selects the inert
      // MockEmailProvider (no network); the blank credentials mean that even if
      // a test somehow selected a real transport it would fail closed rather
      // than deliver. Dispatcher specs additionally stub global fetch to throw,
      // so any unmocked network attempt fails loudly instead of sending.
      // --- wall-clock determinism --------------------------------------------
      // Send pacing is ON by default (`MAILBOX_SEND_PACING` unset means on) and
      // releases a mailbox's daily allowance across a 07:00-18:00 UTC window.
      // `sendSequenceStepBatch` reads the REAL clock, so before 07:00 UTC the
      // paced allowance is 0 and every dispatching integration test is held
      // back — J5 failed on `expect(batch.blocked).toEqual([])` with "Held back
      // by send pacing" on PRs #301, #302, #303 and #304 alike, purely because
      // the overnight relay runs between 18:00 and 07:00. Nothing was wrong
      // with the product: in production the queue cron only runs inside that
      // same window, so pacing and the dispatcher agree.
      //
      // These tests exist to prove the JOINS of the send journey, not pacing.
      // Pacing's own behaviour is owned by `src/lib/mailboxes/send-pacing.test.ts`,
      // which drives the clock as an argument and so is deterministic by
      // construction. Pinning the flag off here makes this suite give the same
      // answer at 03:00 as at 13:00.
      MAILBOX_SEND_PACING: "false",

      EMAIL_PROVIDER: "mock",
      RESEND_API_KEY: "",
      MAILBOX_OAUTH_SECRET: "",
      MAILBOX_MICROSOFT_OAUTH_CLIENT_ID: "",
      MAILBOX_MICROSOFT_OAUTH_CLIENT_SECRET: "",
      MAILBOX_GOOGLE_OAUTH_CLIENT_ID: "",
      MAILBOX_GOOGLE_OAUTH_CLIENT_SECRET: "",
    },
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      // Reported separately from the unit suite: this run only exercises the
      // DB-backed orchestration, so a combined percentage would be misleading.
      include: ["src/server/**"],
      exclude: ["**/*.test.ts", "**/*.d.ts", "src/test/**"],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(process.cwd(), "src"),
      "server-only": path.resolve(process.cwd(), "src/test/shims/server-only.ts"),
    },
  },
});
