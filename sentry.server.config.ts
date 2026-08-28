// This file configures the initialization of Sentry on the server.
// The config you add here will be used whenever the server handles a request.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";

import { SENTRY_DATA_COLLECTION } from "@/lib/monitoring/sentry-data-collection";

Sentry.init({
  // Env-driven, never hardcoded — see `src/instrumentation-client.ts` for why.
  // Empty or absent disables the SDK, which is how e2e stays silent.
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Performance traces only; error events are always captured. See the client
  // config — 100% sampling is what exhausted the ingest quota.
  tracesSampleRate: 0.1,

  // Enable logs to be sent to Sentry
  enableLogs: true,

  // Every field set explicitly, and it has to be — supplying this block at all
  // selects the SDK's PERMISSIVE defaults as the base, so anything left unset is
  // ON. See `src/lib/monitoring/sentry-data-collection.ts`.
  dataCollection: SENTRY_DATA_COLLECTION,
});
