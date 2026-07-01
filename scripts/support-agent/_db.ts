import "dotenv/config";

/**
 * Shared connection guard for the autonomous support-agent scripts.
 *
 * Support tickets live in the PRODUCTION database (staff raise them at /support
 * in the deployed app). We force the production connection string into
 * DATABASE_URL *before* the Prisma client is imported, so these scripts can
 * never accidentally read or mutate the local dev database.
 *
 * Set SUPPORT_AGENT_DATABASE_URL (preferred) or PRODUCTION_DATABASE_URL to the
 * production Postgres URL. If neither is set, we refuse to run rather than fall
 * back to a plain DATABASE_URL that might point at dev.
 */
const url =
  process.env.SUPPORT_AGENT_DATABASE_URL ?? process.env.PRODUCTION_DATABASE_URL;

if (!url) {
  throw new Error(
    "Refusing to run: set SUPPORT_AGENT_DATABASE_URL (or PRODUCTION_DATABASE_URL) to the production database URL.",
  );
}
process.env.DATABASE_URL = url;

/**
 * Import the app's own Prisma client AFTER DATABASE_URL is set, so it connects
 * to production. `src/lib/db.ts` reads process.env.DATABASE_URL at init time,
 * hence the dynamic import — a static import would initialise the client before
 * the guard above runs.
 */
export async function getPrisma() {
  const mod = await import("../../src/lib/db");
  return mod.prisma;
}
