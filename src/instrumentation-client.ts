// This file configures the initialization of Sentry on the client.
// The added config here will be used whenever a users loads a page in their browser.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";

import { SENTRY_DATA_COLLECTION } from "@/lib/monitoring/sentry-data-collection";

Sentry.init({
  // Read from the environment, never hardcoded. A DSN written into the source is
  // a destination `e2e/env.ts` cannot blank, so every CI run and every local
  // `npm run start` shipped browser telemetry into the client's PRODUCTION Sentry
  // project — until its quota ran out and Sentry answered the browser with 429,
  // which reds the screen walk's `console.error` assertion on every retry.
  //
  // An empty or absent DSN disables the SDK entirely; that is how the e2e build
  // stays silent. The reference must stay a literal `process.env.NEXT_PUBLIC_*`
  // so Next.js can inline it at build time — it cannot be routed via a helper.
  // Set for production in `.github/workflows/deploy-production.yml`.
  //
  // Not a secret: a DSN is public by design and ships in the browser bundle. It
  // is env-driven to control WHERE it is switched on, not to conceal it.
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Performance traces only — error events are always captured regardless of this
  // value. It was 1 (100%), which sent seven envelopes per page load and is what
  // exhausted the ingest quota; 10% keeps a representative sample of timings
  // without spending the allowance that error reporting depends on.
  tracesSampleRate: 0.1,
  // Enable logs to be sent to Sentry
  enableLogs: true,

  // Every field set explicitly, and it has to be — supplying this block at all
  // selects the SDK's PERMISSIVE defaults as the base, so anything left unset is
  // ON. See `src/lib/monitoring/sentry-data-collection.ts`.
  dataCollection: SENTRY_DATA_COLLECTION,
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
