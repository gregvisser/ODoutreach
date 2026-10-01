/**
 * Integration-test database helpers.
 *
 * These tests exercise the real Prisma orchestration in `src/server` against a
 * real PostgreSQL schema — the layer that mock-based unit tests cannot cover
 * honestly, because mocking Prisma mostly asserts the mock.
 *
 * SAFETY: `resetIntegrationDatabase` TRUNCATEs every table. It is guarded by
 * `assertSafeTestDatabase`, the same check the e2e seed uses — a local/CI host
 * AND a database name containing `e2e` or `test`. The guard is imported rather
 * than duplicated so there is exactly one definition of "safe to destroy".
 */
import { Pool } from "pg";

import { assertSafeTestDatabase } from "../../../e2e/safe-database";
import {
  OPENSDOORS_FEATURE_FLAG_DEFAULTS,
  OPENSDOORS_ORGANISATION_ID,
  OPENSDOORS_ORGANISATION_NAME,
  OPENSDOORS_ORGANISATION_SLUG,
} from "@/lib/tenant/organisation";

let pool: Pool | undefined;

/** The database these tests run against. Never falls back to DATABASE_URL blindly. */
export function integrationDatabaseUrl(): string {
  const url = process.env.E2E_DATABASE_URL?.trim() || process.env.DATABASE_URL?.trim();
  assertSafeTestDatabase(url);
  return url as string;
}

function getPool(): Pool {
  if (!pool) {
    pool = new Pool({ connectionString: integrationDatabaseUrl(), max: 4 });
  }
  return pool;
}

/**
 * Empties every table so each test starts from a known state.
 *
 * TRUNCATE ... CASCADE in a single statement sidesteps foreign-key ordering,
 * and is dramatically faster than deleting row by row. `_prisma_migrations` is
 * preserved so the schema stays valid.
 */
export async function resetIntegrationDatabase(): Promise<void> {
  const client = getPool();
  const { rows } = await client.query<{ tablename: string }>(
    `SELECT tablename FROM pg_tables
      WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`,
  );
  if (rows.length === 0) return;

  const tables = rows.map((r) => `"public"."${r.tablename}"`).join(", ");
  await client.query(`TRUNCATE TABLE ${tables} RESTART IDENTITY CASCADE`);

  // Client.organisationId is required and defaults to OpensDoors. Truncate
  // removes that row, so put it back before any test inserts a client.
  if (rows.some((r) => r.tablename === "Organisation")) {
    await client.query(
      `INSERT INTO "Organisation" (
         "id", "name", "slug", "status", "featureFlags", "createdAt", "updatedAt"
       ) VALUES ($1, $2, $3, 'ACTIVE', $4::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       ON CONFLICT ("id") DO NOTHING`,
      [
        OPENSDOORS_ORGANISATION_ID,
        OPENSDOORS_ORGANISATION_NAME,
        OPENSDOORS_ORGANISATION_SLUG,
        JSON.stringify(OPENSDOORS_FEATURE_FLAG_DEFAULTS),
      ],
    );
  }
}

export async function closeIntegrationPool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = undefined;
  }
}
