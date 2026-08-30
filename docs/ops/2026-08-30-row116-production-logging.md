# Row 116 — production logging and error recording (cycle 142, 2026-08-30)

Written the same day the measurements were taken, against production
(`app-opensdoors-outreach-prod`, resource group `rg-opensdoors-outreach-prod`,
subscription `Azure subscription 1`, `87959659-a56a-4774-ac44-f96b18905ee2`).

## Why this row exists

Cycle 134, fixing row 109 (the Launch button that did nothing), could name two
plausible causes for the failure but could not settle which one actually fired,
because nothing recorded that the request had even happened. This is that gap,
closed to the minimum that makes a future fault explainable — not a general
observability build-out.

## Part 1 — what was actually measured, before anything was changed

### Channel 1: App Service diagnostic logs (application + HTTP)

`az webapp log show --name app-opensdoors-outreach-prod --resource-group rg-opensdoors-outreach-prod`,
run before any change, returned:

```json
"applicationLogs": { "fileSystem": { "level": "Off" }, "azureBlobStorage": { "level": "Off" }, "azureTableStorage": { "level": "Off" } },
"httpLogs": { "fileSystem": { "enabled": false }, "azureBlobStorage": { "enabled": false } },
"detailedErrorMessages": { "enabled": false },
"failedRequestsTracing": { "enabled": false }
```

**Dead.** Every application and HTTP logging channel App Service offers was off.
Cycle 134's characterisation was correct.

`az monitor diagnostic-settings list --resource <app service resource id>`
returned `[]` — no Diagnostic Setting existed to route any App Service log
category anywhere, ever.

### Channel 2: Application Insights

`az monitor app-insights component show --app app-opensdoors-outreach-prod --resource-group rg-opensdoors-outreach-prod`
confirms a component EXISTS (created 2026-04-16, `IngestionMode: LogAnalytics`,
90-day retention on its own setting) and the App Service carries the ARM-level
`hidden-link: /app-insights-resource-id` tag pointing at it. But
`az webapp config appsettings list ... --query "[].name"` (38 settings, names
only) contains no `APPLICATIONINSIGHTS_CONNECTION_STRING` and no
`APPINSIGHTS_INSTRUMENTATIONKEY` — the resource was never actually wired into
the running app.

Querying it directly confirms the practical consequence:

```
union requests, exceptions, traces, pageViews, dependencies, customEvents
| summarize count() by itemType
```
run with `--offset 90d` — **zero rows returned.** Nothing has ever reached this
resource. **Dead, exactly as cycle 134 found it: "wired but has never ingested a
single telemetry item."**

### Channel 3: Sentry

Here the measurement CORRECTS cycle 134's characterisation, and the correction
matters because it changes what this row actually needed to build.

`az webapp config appsettings list` (production, names only) confirms there is
**no Sentry setting of any kind on the App Service** — no `SENTRY_DSN`, no
`SENTRY_AUTH_TOKEN`, nothing. Read in isolation that supports "no Sentry token in
production."

But the DSN is not read from an App Service setting. `deploy-production.yml`'s
build step sets `NEXT_PUBLIC_SENTRY_DSN` as a literal, and Next.js inlines every
`process.env.NEXT_PUBLIC_*` reference at `next build` time —
**in the Node.js server bundle as well as the browser bundle**
(`node_modules/next/dist/docs/01-app/02-guides/environment-variables.md`, "This
will tell Next.js to replace all references to `process.env.NEXT_PUBLIC_...` in
the Node.js environment... It will be inlined into any JavaScript sent to the
browser" — both, not one or the other). `sentry.server.config.ts` and
`sentry.edge.config.ts` both read `process.env.NEXT_PUBLIC_SENTRY_DSN` for
exactly this reason.

Confirmed against what is actually running, not just what the source says it
should do: fetched `/sign-in` from the direct origin
(`app-opensdoors-outreach-prod.azurewebsites.net`) on 2026-08-30, downloaded the
served `main-app-*.js` chunk, and found the literal DSN project id
(`4511767773642832`) baked into the bundle actually served today. This matches
the same finding `sentry-config-wiring.test.ts` recorded on 2026-08-28
(commit `72a11bd`).

`src/instrumentation.ts` wires `onRequestError = Sentry.captureRequestError`,
which Next.js calls for Server Component, Route Handler **and Server Action**
errors alike (`node_modules/next/dist/docs/.../instrumentation.md`,
`context.routeType: 'action'`). So: **Sentry is live in production, for both
client and server errors, and has been since the DSN literal was added to the
build step — it was never actually dead, only unproven, and nothing had ever
exercised `onRequestError` to check.**

### Summary of the measurement

| Channel | Configured? | Ever carried data? |
|---|---|---|
| App Service application logs | No (Off) | No |
| App Service HTTP logs | No (disabled) | No |
| Application Insights | Resource exists, not wired to the app | No — confirmed by a 90-day query returning zero rows |
| Sentry (client + server) | Yes — DSN baked into the build, confirmed in the served bundle | Not previously proven; proven live by this row (Part 3) |

## Part 2 — what was turned on, and why no more than this

**Application Insights was deliberately left disconnected.** Sentry already
captures unhandled exceptions with route context under a tested no-personal-data
policy (`sentry-data-collection.ts`), and the two Azure-native channels below
now cover "server-side application logging retained somewhere readable."
Wiring Application Insights on top would duplicate exception capture and add a
second paid ingestion path for no new capability this row's brief asked for.
It remains available — ARM-linked, currently ingesting nothing, so currently
costing nothing — if request-level performance tracing becomes worth paying for
later.

**What was turned on**, all via `az`, no code deploy required for this half:

1. **A Diagnostic Setting** (`row116-app-service-logs-to-log-analytics`) on the
   App Service, sending `AppServiceConsoleLogs` (stdout/stderr — where the
   existing `src/lib/logger.ts` pino logger already writes structured JSON, per
   its own comment: *"Emits JSON to stdout so Azure / Log Analytics ingests it
   directly"*) and `AppServiceHTTPLogs` (was there even a request — the exact
   question row 109 could not answer) to the workspace already backing the
   Application Insights resource
   (`DefaultWorkspace-87959659-a56a-4774-ac44-f96b18905ee2-WEU`, `PerGB2018`,
   30-day retention).
2. **Filesystem application + web server logging**
   (`az webapp log config --application-logging filesystem --web-server-logging filesystem --level information`),
   free, for live `az webapp log tail` during an active incident (3-day / 100MB
   rolling window — this is the fast, ephemeral half; the Diagnostic Setting
   above is the durable half).

**Code change: `src/lib/logger.ts` now scrubs email addresses.** Once App
Service actually captures this logger's stdout, whatever it has ever been
handed becomes readable by a human for the first time — so before that capture
was turned on, the logger itself was hardened. It previously only redacted
credential-shaped fields (`*.password`, `*.token`, `req.headers.cookie`, …); it
now also strips any email-address-shaped string, anywhere in the logged object
(any nesting depth) or inside a caught error's own `message`/`stack`, via a
`formatters.log` hook and a wrapped `err` serializer. See `src/lib/logger.test.ts`
for the red-first proof, including a case built specifically to catch a future
"logged the whole request object" regression.

## Part 3 — proof it actually arrives (not that a setting was flipped)

This project has nine prior instances of built, wired, reports-success, never
fires. Settings alone do not clear that bar.

**HTTP logs — proven with an exact match.** Hit the direct origin with a unique
cache-buster and queried the destination table for it:

```
curl "https://app-opensdoors-outreach-prod.azurewebsites.net/api/health?row116probe=1788085455"
```

```
AppServiceHTTPLogs | where CsUriQuery contains 'row116probe'
```
→
```json
{ "CsMethod": "GET", "CsUriStem": "/api/health", "CsUriQuery": "row116probe=1788085455", "ScStatus": "200", "TimeGenerated": "2026-08-30T10:24:16.679641Z" }
```
The exact query string this cycle generated, ingested and queryable within
minutes.

**Console logs — proven, with an honest caveat.** The same query against
`AppServiceConsoleLogs` for the same window returned real container stdout —
the platform's own Linux/Node boot banner (`NodeJS Version: v20.20.2`,
`Instance Id: 230ae83a...`), captured when the app restarted after the log
config change:

```json
{ "TimeGenerated": "2026-08-30T10:22:42.53Z", "ResultDescription": "NodeJS Version   : v20.20.2" }
```

This proves the channel captures real stdout from the running container — not
a config flag with no observed effect. It does **not** yet contain a line
written by `src/lib/logger.ts` (pino), because none of that logger's 8 call
sites (AI-call failures, the Gmail post-send read-back failure path) fired
during this measurement window — this row did not manufacture an AI failure or
a send-pipeline error in production just to produce a cleaner log line, and did
not need to: pino writes to the same stdout stream (fd 1) this measurement just
proved is captured, and `src/lib/logger.test.ts` proves independently what that
JSON looks like once scrubbed. The two facts compose; nothing here claims to
have observed the composition directly.

**Sentry — proven end-to-end in a test, not just "the DSN is present."**
`src/instrumentation.test.ts` calls the real, unmodified `onRequestError` export
with a server-action-shaped error, request and context, against a real Sentry
client (fake-but-valid DSN, `client.on("beforeSendEvent", ...)` intercepting
before the network transport), and asserts: an event was captured; it carries
`contexts.nextjs.request_path` / `route_type: "action"` (enough to say which
route, and — since every route in this app lives under `/clients/<slug>/...` —
which client); and it carries neither the request's session cookie nor its
bearer token. Both halves were proven capable of failing before being left
green: `onRequestError` was temporarily stubbed to a no-op (asserted "no event
was captured"), and `httpHeaders.request` was temporarily flipped to `true` in
`sentry-data-collection.ts` (the bearer token then appeared in the captured
event, red). Both reverted before this commit.

## Part 4 — no-personal-data test, green

`src/lib/logger.test.ts` (5 tests) and `src/instrumentation.test.ts` (1 test),
all green. The logger suite went red three times while being built — a plain
email field, an email inside a caught error's `message`/`stack` (missed on the
first pass because pino serializes `err` and applies `formatters.log` in an
order that let an Error instance slip through untouched — see the comment in
`scrubEmails`), and only turned green once both the merging-object scrub and
the `err`-serializer scrub were in place. That is direct evidence the test was
capable of catching a real defect, not written to already pass.

## Part 5 — cost

Both filesystem channels (application + web server logging) are free — local
instance disk, no ingestion billing.

The Diagnostic Setting bills through the Log Analytics workspace at its
Consumption ("PerGB2018") rate. Queried the Azure Retail Prices API directly
for `westeurope` on 2026-08-30: **Standard Data Analyzed, $2.30/GB** (the
workspace's 30-day retention is within the included period, so no extra
retention charge at current volume).

Estimated monthly ingestion at this app's actual traffic profile — two cron
jobs on a 5- and 15-minute cadence during UK weekday hours, a handful of staff
users, no public/high-volume traffic, and low-frequency application log lines
(8 call sites, firing only on failure) — is on the order of **30–50MB/month**
combined HTTP + console logs. At $2.30/GB that is **under $0.15 (well under
£1) a month**, and even a pessimistic 10x-higher estimate stays under £2/month.
This is comfortably under the "a few pounds a month" threshold this row was
told to flag against, so nothing further was sought or is owed.

## Part 6 — raised, not fixed here

Row 117 added to `.bidlow/relay/QUEUE.md`, above the BLOCKED rows (92, 84, 48):
the Launch journey has no end-to-end test coverage, so row 109's client-side
fix has no automated regression test standing guard against it recurring.

## What this row did not do, deliberately

- Did not wire Application Insights (Part 2).
- Did not score anything — `.bidlow/GRADES.json` untouched, no dimension moved.
- Did not touch the `bidlowai` sequence sitting at Ready:1 / Sent:0 (row 115's).
- Did not touch any other client's configuration or data.
- Did not decide the Anthropic Art.28 DPA question (CR-10) — unrelated to this row.

## Gates

- `npm run lint` — 0
- `npm run typecheck` — 0
- `npm test` — full suite green (see PR CI run for the exact count)
- Merged to `main` via PR, CI green, per this project's branch-protection rule.
