/**
 * Test-environment values shared by `playwright.config.ts` (which passes them to
 * the app under test) and `global-setup.ts` (which mints session cookies).
 *
 * The secret below is NOT a production credential: it exists only to sign
 * session cookies for a throwaway local/CI database, mirroring the placeholder
 * `AUTH_SECRET` already used by `.github/workflows/ci.yml`. Real secrets stay in
 * Azure App Service config and GitHub Secrets.
 */

export const E2E_BASE_URL =
  process.env.PLAYWRIGHT_BASE_URL?.trim() || "http://localhost:3000";

export const E2E_AUTH_SECRET =
  process.env.E2E_AUTH_SECRET?.trim() ||
  "e2e-only-not-a-production-secret-min-32-chars";

export const E2E_DATABASE_URL =
  process.env.E2E_DATABASE_URL?.trim() ||
  "postgresql://e2e:e2e_local_only@localhost:5434/odoutreach_e2e?schema=public";

/**
 * Environment for the app under test.
 *
 * Two jobs: point the app at the throwaway database, and make a real send
 * impossible. Every provider credential is explicitly blanked — Next.js does not
 * override variables already present in `process.env`, so these win over any
 * value in a developer's local `.env`. A test that somehow reached a send path
 * would fail to authenticate rather than deliver mail.
 */
export const E2E_APP_ENV: Record<string, string> = {
  DATABASE_URL: E2E_DATABASE_URL,
  AUTH_SECRET: E2E_AUTH_SECRET,
  AUTH_URL: E2E_BASE_URL,
  NODE_ENV: "production",

  // Compile/runtime placeholders — e2e never performs a real Entra sign-in.
  AUTH_MICROSOFT_ENTRA_ID_ID: "11111111-1111-1111-1111-111111111111",
  AUTH_MICROSOFT_ENTRA_ID_SECRET: "e2e-placeholder-not-a-real-secret",
  AUTH_MICROSOFT_ENTRA_ID_ISSUER:
    "https://login.microsoftonline.com/22222222-2222-2222-2222-222222222222/v2.0/",

  // Empty = no domain filter, so the `.example` fixture addresses are allowed.
  STAFF_EMAIL_DOMAINS: "",

  // Error monitoring off: an empty DSN disables the Sentry SDK outright, so a
  // test run reports nothing into the client's production project. Covers the
  // server and edge SDKs, which read this at runtime. The BROWSER bundle is
  // handled at build time instead — Next.js inlines `NEXT_PUBLIC_*`, so the
  // browser is silent because CI's build never sets the DSN, not because of this
  // line. Guarded by `e2e/no-third-party-telemetry.spec.ts`.
  NEXT_PUBLIC_SENTRY_DSN: "",

  // --- send kill-switches: nothing may leave the machine ---
  EMAIL_PROVIDER: "mock",
  RESEND_API_KEY: "",
  RESEND_WEBHOOK_SECRET: "",
  PROCESS_QUEUE_SECRET: "",
  AUTOPROCESS_OUTBOUND_QUEUE: "false",
  MAILBOX_OAUTH_SECRET: "",
  MAILBOX_MICROSOFT_OAUTH_CLIENT_ID: "",
  MAILBOX_MICROSOFT_OAUTH_CLIENT_SECRET: "",
  MAILBOX_GOOGLE_OAUTH_CLIENT_ID: "",
  MAILBOX_GOOGLE_OAUTH_CLIENT_SECRET: "",
  GOOGLE_SERVICE_ACCOUNT_JSON: "",
  GOOGLE_SERVICE_ACCOUNT_JSON_BASE64: "",
  ROCKETREACH_API_KEY: "",

  // Dev-only simulation routes stay off.
  ALLOW_DEV_OUTBOUND_QUEUE: "false",
  ALLOW_DEV_PROVIDER_SIMULATE: "false",
  ALLOW_DEV_WEBHOOK_REPLAY: "false",
  ALLOW_DEV_INBOUND_SIMULATE: "false",

  // Send pacing (`src/lib/mailboxes/send-pacing.ts`) defaults ON and schedules
  // a mailbox's sends against real wall-clock time-of-day within a
  // 07:00-18:00 UTC window. Left on, a spec that launches a sequence would
  // pass or fail depending on what time it happens to run — flaky for a
  // reason that has nothing to do with the Launch journey itself, and the
  // pacing math already has its own unit coverage (`send-pacing.test.ts`).
  MAILBOX_SEND_PACING: "false",
};
