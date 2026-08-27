// This file configures the initialization of Sentry on the server.
// The config you add here will be used whenever the server handles a request.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";

Sentry.init({
  // Env-driven, never hardcoded — see `src/instrumentation-client.ts` for why.
  // Empty or absent disables the SDK, which is how e2e stays silent.
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Performance traces only; error events are always captured. See the client
  // config — 100% sampling is what exhausted the ingest quota.
  tracesSampleRate: 0.1,

  // Enable logs to be sent to Sentry
  enableLogs: true,

  dataCollection: {
    // To disable sending user data and HTTP bodies, uncomment the lines below. For more info visit:
    // https://docs.sentry.io/platforms/javascript/guides/nextjs/configuration/options/#dataCollection
    // userInfo: false,
    // httpBodies: [],
  },
});
