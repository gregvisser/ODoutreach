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
