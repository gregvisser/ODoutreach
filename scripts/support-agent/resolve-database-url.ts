/**
 * Production-ticket connection choice for support-agent CLIs.
 *
 * Tickets live in production. A bare DATABASE_URL is not accepted: that value
 * is often the local docker Postgres, and these scripts must not silently
 * read or mutate it.
 */
export function resolveSupportAgentDatabaseUrl(
  env: Record<string, string | undefined> = process.env,
): string {
  const url = env.SUPPORT_AGENT_DATABASE_URL ?? env.PRODUCTION_DATABASE_URL;
  if (!url) {
    throw new Error(
      "Refusing to run: set SUPPORT_AGENT_DATABASE_URL (or PRODUCTION_DATABASE_URL) to the production database URL.",
    );
  }
  return url;
}
