/**
 * Guard that keeps e2e fixtures away from real data.
 *
 * Kept free of Prisma/pg imports so it can be unit-tested directly — this is the
 * single check standing between a destructive fixture seed and a real database,
 * so it is business logic, not glue.
 */

/** Hostnames that can only be a local machine or a CI service container. */
const ALLOWED_HOSTS = new Set([
  "localhost",
  "127.0.0.1",
  "::1",
  "postgres",
  "db",
]);

/**
 * Throws unless `rawUrl` points at an obvious throwaway test database: a local
 * host AND a database name containing `e2e` or `test`. Both conditions are
 * required — a production database satisfies neither.
 */
export function assertSafeTestDatabase(rawUrl: string | undefined): URL {
  if (!rawUrl || rawUrl.trim().length === 0) {
    throw new Error(
      "E2E_DATABASE_URL is required for the e2e seed — refusing to fall back to DATABASE_URL.",
    );
  }

  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("E2E_DATABASE_URL is not a valid URL.");
  }

  const host = url.hostname.toLowerCase();
  if (!ALLOWED_HOSTS.has(host)) {
    throw new Error(
      `Refusing to seed e2e fixtures against non-local database host "${host}".`,
    );
  }

  const database = url.pathname.replace(/^\//, "").toLowerCase();
  if (!database.includes("e2e") && !database.includes("test")) {
    throw new Error(
      `Refusing to seed e2e fixtures into database "${database}" — the name must contain "e2e" or "test".`,
    );
  }

  return url;
}
