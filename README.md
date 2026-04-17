# OpensDoors Outreach

Internal cold outreach operations platform for **OpensDoors** staff. Multi-tenant by design: every client is an isolated workspace. This product focuses on **outreach execution** — sends, replies, suppression, and reporting — **not** CRM pipelines, deal stages, or lead scoring.

## What the codebase includes

- **Next.js 16** (App Router) + **TypeScript** + **Tailwind CSS v4** + **shadcn/ui**
- **Microsoft Entra ID** authentication via **Auth.js / NextAuth** (MFA enforced in Entra, not in-app). **Microsoft sign-in alone does not grant app access** — the user must have a **`StaffUser`** row (pre-provisioned); first login can **link** `entraObjectId` by matching normalized email. Use **Entra enterprise app assignments** (users/groups), optional **`STAFF_EMAIL_DOMAINS`**, and tenant data access still flows through **`ClientMembership`** and roles.
- **PostgreSQL** via **Prisma 7** + `@prisma/adapter-pg` + `pg`
- **Tenant isolation**: `getAccessibleClientIds` → all list/report queries scoped; `requireClientAccess` on mutations; URL `?client=` filters validated against accessible IDs
- **CSV contact import**: server action, **papaparse**, `ContactImportBatch` + summary JSON, duplicate/invalid skipping, `requireClientAccess` per import
- **Google Sheets suppression sync**: **googleapis** + service account JSON from env; per-`SuppressionSource` sync replaces rows for that source only; `clientId` always from DB; contact flags refreshed after sync
- **Suppression guard**: `evaluateSuppression` / `isAddressSuppressed` + `refreshContactSuppressionFlagsForClient` — use before any send (see below)
- **Staff policy**: optional `STAFF_EMAIL_DOMAINS` env; non-matching users see a blocked screen while signed in
- **Recharts** on dashboard and reporting

## Operations runbooks

- **[Staging rollout & verification](docs/STAGING_ROLLOUT.md)** — preflight, deploy order, post-deploy smoke, webhook registration.
- **[Email operations triage](docs/EMAIL_OPERATIONS_RUNBOOK.md)** — queue stuck, webhooks, retries, replies.

## GitHub & Azure deployment

- **[Deployment checklist](docs/DEPLOYMENT_CHECKLIST.md)** — first commit, GitHub remote, Azure staging, Entra app registration, Resend, verification.
- **[GitHub setup](docs/GITHUB_SETUP.md)** — create repo, `git remote`, first push, CI variables.
- **[Azure staging setup](docs/AZURE_STAGING_SETUP.md)** — App Service + PostgreSQL, env vars, migrations, webhooks, queue drain.

**CI:** `.github/workflows/ci.yml` runs on pushes/PRs to `main` or `master`. The workflow sets **placeholder** `AUTH_*` / Entra-related env vars so `npm run build` succeeds without real Microsoft credentials; production/staging still require a real Entra app registration.

**Scripts (no secrets printed):**

| Command | Purpose |
|---------|---------|
| `npm run staging:preflight` | Required env keys for local profile |
| `npm run staging:preflight -- --staging` | Stricter checks before staging deploy |
| `npm run staging:verify-health -- https://your-host` | `GET /api/health` + optional `queue-status` if `PROCESS_QUEUE_SECRET` is in env |

## Run locally

**Prerequisites:** Node.js 20+, PostgreSQL 14+ (or **Docker** for the bundled local database).

**Optional — Postgres in Docker:** from the repo root, `docker compose up -d` starts PostgreSQL on **host port 5433** (avoids clashing with an existing server on 5432). Point `DATABASE_URL` at `opensdoors` / `opensdoors_outreach` as defined in `docker-compose.yml`.

```bash
cd C:\Bidlowprojects\BidlowClients\Opensdoors\ODoutreach
copy .env.example .env
```

Fill `DATABASE_URL`, `AUTH_SECRET`, Microsoft Entra app registration values (`AUTH_MICROSOFT_ENTRA_ID_*`), and optionally `STAFF_EMAIL_DOMAINS`, Google JSON, `SEED_ENTRA_OBJECT_ID` (see seed docs).

```bash
npm install
npm run db:migrate:dev
npm run db:seed
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Sign in via `/sign-in`.

### MFA

Configure Conditional Access and authentication methods in the **Microsoft Entra admin center** for your tenant. This app does not render a custom MFA step; Entra enforces your policies on sign-in.

## Migrations and seed

After pulling changes:

```bash
npm run db:migrate:dev
```

Recent migrations include `20260414120000_contact_import_summary`, **`20260415130000_email_operations_backbone`**, **`20260416120000_outbound_queue_lifecycle`**, **`20260417120000_outbound_reliability_hardening`**, **`20260417140000_client_mailbox_identities`** (`ClientMailboxIdentity` — per-client outreach mailboxes and caps), **`20260413163000_staff_entra_object_id`** (`StaffUser.entraObjectId`), and **`20260418100000_staff_user_email_unique`** (unique staff email for first-login linking).

Seed creates demo tenants and memberships. For local Entra sign-in, either set **`SEED_ENTRA_OBJECT_ID`** to your Entra user **object ID (oid)**, or set the seeded row’s **`email`** in `prisma/seed.ts` to your work address (same as Entra `preferred_username`) so the first successful sign-in **links** `entraObjectId` automatically.

## CSV import

1. Go to **Contacts**.
2. Pick a **client workspace** (only clients you can access appear).
3. Upload a `.csv` with a header row.

**Required column:** `email` (aliases: `e-mail`, `work_email`, `email_address`).

**Optional columns:** `first_name`, `last_name`, `full_name` or `name`, `company`, `title`, `domain`, `source` (`CSV_IMPORT` | `MANUAL` | `ROCKETREACH`).

Rows with invalid email are skipped; duplicates (already in DB or repeated in file) are skipped. A `ContactImportBatch` row stores status and a JSON **summary** (counts + sample errors). Imports call `requireClientAccess` and only create contacts for the selected `clientId`.

## Mailbox identities (per client workspace)

On **Clients → [client]**, the **Mailbox identities** card lists outreach mailboxes (Microsoft 365 or Google Workspace) for that tenant. Operators with **ADMIN**, **MANAGER**, or **OPERATOR** staff plus **LEAD**/**CONTRIBUTOR** client membership may add or edit rows; **VIEWER** membership is read-only. There is a hard limit of **five active** identities per client; each mailbox defaults to a **daily send cap of 30** (OpensDoors product rule, enforced when the outbound scheduler consumes this data). This slice stores **connection status** and readiness fields only — OAuth connect flows are not wired yet.

## Suppression sync (Google Sheets)

1. Create a Google Cloud project, enable **Google Sheets API**, create a **service account**, download JSON.
2. Put JSON in `GOOGLE_SERVICE_ACCOUNT_JSON` (string) or `GOOGLE_SERVICE_ACCOUNT_JSON_BASE64`.
3. **Share** each suppression spreadsheet with the service account email (Editor not required; read is enough for our readonly scope).
4. Configure `SuppressionSource` rows (via onboarding or DB): `spreadsheetId`, optional `sheetRange` (default in sync: `Sheet1!A1:Z50000` if unset).
5. Open **Suppression** and click **Sync** on a source.

Sync **deletes** prior rows for that `sourceId` + `clientId`, then inserts parsed emails or domains. It never writes another tenant’s `clientId`. Without Google credentials, sync fails with a clear error state on the source.

## Outbound send pipeline (queue-backed)

Server-only **request** path: `sendEmailToContact` in `src/server/email/send-outbound.ts` (Contacts **Send** action). Flow: `requireClientAccess` → load contact → `evaluateSuppression` → persist `OutboundEmail` as **`QUEUED`** (or `BLOCKED_SUPPRESSION`) → **does not** call the ESP inline.

**Worker / queue:** `processOutboundSendQueue` in `src/server/email/outbound/queue-processor.ts` claims rows with `FOR UPDATE SKIP LOCKED`, sets `PROCESSING`, runs `executeOutboundSend` (provider call + status updates). Retries: transient failures return the row to `QUEUED` with `nextRetryAt` and `retryCount` (cap via `MAX_OUTBOUND_SEND_RETRIES`).

**Drain triggers**

| Mode | How |
|------|-----|
| **Local (default)** | Set `AUTOPROCESS_OUTBOUND_QUEUE=true` — after enqueue, the app runs the processor asynchronously in-process. |
| **Worker script** | `npm run worker:outbound` (or `npm run worker:outbound -- 25`) uses the same processor (needs `DATABASE_URL`). |
| **HTTP** | `POST /api/internal/outbound/process-queue` with `Authorization: Bearer PROCESS_QUEUE_SECRET` and JSON `{ "limit": 10 }`. Set `INTERNAL_APP_URL` when calling from another host. |
| **Dev manual** | `POST /api/dev/process-outbound-queue` with `x-dev-secret: OUTBOUND_DEV_QUEUE_SECRET` (or same Bearer as `PROCESS_QUEUE_SECRET`). |

- **Mock provider (default):** no network; generates a fake `providerMessageId`. Safe for local dev.
- **Resend:** `EMAIL_PROVIDER=resend` and `RESEND_API_KEY`. From: `Client.defaultSenderEmail` → `DEFAULT_OUTBOUND_FROM` → `noreply@opensdoors.local`.

**Provider webhooks (Resend):** `POST /api/webhooks/resend` — Svix-signed; set `RESEND_WEBHOOK_SECRET` from the Resend webhook settings. Events update `OutboundEmail` by `providerMessageId` (globally unique from Resend) and append `OutboundProviderEvent` rows. **Never** matches across tenants incorrectly: the outbound row’s `clientId` is loaded from DB after id lookup.

**Webhook replay:** each delivery is inserted with a unique `dedupeHash` (prefer Svix message id). Replays raise a unique constraint — **outbound state is not applied twice**. Ordering uses `lastProviderEventAt` + conservative rules in `src/server/email/outbound/lifecycle.ts`.

**Send idempotency (limitations honest):** each queue claim increments `sendAttempt` and sets deterministic `providerIdempotencyKey` (`osm_{id}_a{n}`). **Resend** receives `Idempotency-Key`; the **mock** provider derives a stable fake message id from that key. **`SENT` is applied with `updateMany` where `providerMessageId` is still null** so duplicate completion does not double-write. Exact-once delivery at the ESP is **not** guaranteed if the provider ignores idempotency or a crash happens between ESP accept and DB commit — operations should use **Outbound ops** for stale locks and safe retries.

**Sender identity:** `Client.senderIdentityStatus` (`NOT_SET` | `CONFIGURED_UNVERIFIED` | `VERIFIED_READY`) and `defaultSenderEmail`. Resolution in `src/server/email/sender-identity.ts`. Optional env **`ALLOWED_SENDER_EMAIL_DOMAINS`** restricts From domains. Mark **VERIFIED_READY** on the **Outbound ops** page after Resend domain verification.

**Dev: simulate delivery/bounce** (needs `providerMessageId` on the row after send): `POST /api/dev/simulate-provider-event` with JSON `{ "outboundEmailId": "...", "eventType": "email.delivered" }` and `x-dev-secret: OUTBOUND_DEV_PROVIDER_EVENT_SECRET`.

**Dev: duplicate webhook** — `POST /api/dev/simulate-webhook-replay` with JSON `{ "providerMessageId": "<esp id>", "webhookMessageId": "fixed" }` and `x-dev-secret: OUTBOUND_DEV_WEBHOOK_REPLAY_SECRET`; response shows `deduped: true` on second call.

**Outbound operations UI:** `/operations/outbound` — stuck QUEUED, stale PROCESSING, failed rows eligible for **safe requeue** (no provider id), recent provider events (with `dedupeHash` / provider id for log correlation), **release stale locks** (scoped to workspaces you can access), **sender readiness by workspace**, and **mark sender VERIFIED_READY** (after Resend verification).

**Health:** `GET /api/health` — JSON `{ ok, checks.database }` for load balancers; no secrets.

**Queue metrics (authenticated):** `GET /api/internal/outbound/queue-status` with `Authorization: Bearer PROCESS_QUEUE_SECRET` — queue depth, approximate stuck QUEUED, failed counts, provider-event volume last hour, flags for `EMAIL_PROVIDER` / webhook secret configured / autoprocess. Use for cron alerts or on-call dashboards.

Before enqueueing mail to a recipient address (any other code path you add):

1. Call `evaluateSuppression(clientId, email)` from `src/server/outreach/suppression-guard.ts`.
2. If `decision.suppressed === true`, do not enqueue provider work; persist `BLOCKED_SUPPRESSION` (the send action already does this).
3. Optionally refresh contact flags with `refreshContactSuppressionFlagsForClient` after bulk suppression changes (already invoked after CSV import and sheet sync).

**Inbound → REPLIED:** when `ingestInboundForClient` stores a reply with a linked outbound, the outbound can move to status **`REPLIED`** (same tenant only).

## Inbound reply ingestion

- **Webhook:** `POST /api/inbound/email/{inboundIngestToken}` with JSON body (`fromEmail`, optional `toEmail`, `subject`, `snippet`, `providerMessageId`, `inReplyToProviderId`, `receivedAt`). If `INBOUND_WEBHOOK_SECRET` is set, send header `Authorization: Bearer <secret>`. The token is per-row on `Client.inboundIngestToken` (tenant routing only — never guess client from email domain alone).
- **Matching (see `ingestInboundForClient`):** same-tenant outbound lookup by `inReplyToProviderId` → `OutboundEmail.providerMessageId`; else contact match on `fromEmail`. Ambiguous or cross-tenant cases stay unlinked rather than mis-associating.
- **Dev simulate:** `POST /api/dev/simulate-inbound` with header `x-dev-secret: INBOUND_DEV_SIMULATE_SECRET` and JSON including `clientId` (disabled in production unless `ALLOW_DEV_INBOUND_SIMULATE=true`).

## Environment variables

**Required (core):** `DATABASE_URL`, `AUTH_SECRET`, `AUTH_MICROSOFT_ENTRA_ID_ID`, `AUTH_MICROSOFT_ENTRA_ID_SECRET` (and usually `AUTH_MICROSOFT_ENTRA_ID_ISSUER` for single-tenant staff apps).

**Recommended:** `AUTH_URL` (public app URL in staging/prod), `PROCESS_QUEUE_SECRET`, `INTERNAL_APP_URL`, `STAFF_EMAIL_DOMAINS` (if you lock staff by domain).

**Recommended for real email:** `EMAIL_PROVIDER=resend`, `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`.

**Optional product:** Google service account vars (suppression sync), `ROCKETREACH_API_KEY`, `SEED_ENTRA_OBJECT_ID`.

**Outbound tuning:** `DEFAULT_OUTBOUND_FROM`, `ALLOWED_SENDER_EMAIL_DOMAINS`, `AUTOPROCESS_OUTBOUND_QUEUE`, `OUTBOUND_QUEUE_BATCH_SIZE`, `MAX_OUTBOUND_SEND_RETRIES`, `INBOUND_WEBHOOK_SECRET`.

**Dev-only (never enable in production without a deliberate reason):** `OUTBOUND_DEV_*`, `ALLOW_DEV_*`, `INBOUND_DEV_*` — see `.env.example`.

| Variable | Required | Purpose |
|----------|----------|---------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `AUTH_SECRET` | Yes | NextAuth session encryption |
| `AUTH_URL` | Staging/prod | Public origin (e.g. `https://app.example.com`) |
| `AUTH_MICROSOFT_ENTRA_ID_ID` | Yes | Entra app registration client ID |
| `AUTH_MICROSOFT_ENTRA_ID_SECRET` | Yes | Entra client secret |
| `AUTH_MICROSOFT_ENTRA_ID_ISSUER` | Recommended | e.g. `https://login.microsoftonline.com/<tenant-id>/v2.0/` |
| `STAFF_EMAIL_DOMAINS` | No | Comma-separated allowed email domains for staff UI |
| `GOOGLE_SERVICE_ACCOUNT_JSON` or `GOOGLE_SERVICE_ACCOUNT_JSON_BASE64` | No† | Sheets API for suppression sync |
| `ROCKETREACH_API_KEY` | No | Enrichment stub |
| `SEED_ENTRA_OBJECT_ID` | No | Seed script — Entra `oid` for demo `StaffUser` |
| `EMAIL_PROVIDER` | No | `mock` (default) or `resend` |
| `RESEND_API_KEY` | No‡ | Resend API key when `EMAIL_PROVIDER=resend` |
| `ALLOWED_SENDER_EMAIL_DOMAINS` | No | Comma-separated allowed From domains — empty = not enforced |
| `DEFAULT_OUTBOUND_FROM` | No | Fallback From when client has no `defaultSenderEmail` |
| `INBOUND_WEBHOOK_SECRET` | No | If set, required on inbound webhook as `Authorization: Bearer …` |
| `INBOUND_DEV_SIMULATE_SECRET` | No | Secret for `/api/dev/simulate-inbound` |
| `ALLOW_DEV_INBOUND_SIMULATE` | No | Set `true` to allow simulate route in production (avoid unless needed) |
| `AUTOPROCESS_OUTBOUND_QUEUE` | No | `true` = drain send queue in-process after enqueue (**dev only** — see deployment section) |
| `PROCESS_QUEUE_SECRET` | No* | Bearer for `/api/internal/outbound/process-queue` and `/api/internal/outbound/queue-status` |
| `INTERNAL_APP_URL` | No | Origin for HTTP queue drain (e.g. `http://localhost:3000`) |
| `OUTBOUND_QUEUE_BATCH_SIZE` | No | Batch size for drain (default 8) |
| `MAX_OUTBOUND_SEND_RETRIES` | No | Max retries for transient send failures (default 5) |
| `RESEND_WEBHOOK_SECRET` | No | Svix signing secret for `/api/webhooks/resend` |
| `OUTBOUND_DEV_QUEUE_SECRET` | No | `x-dev-secret` for dev process-queue route |
| `ALLOW_DEV_OUTBOUND_QUEUE` | No | Allow dev process-queue in production (avoid) |
| `OUTBOUND_DEV_PROVIDER_EVENT_SECRET` | No | Dev simulate provider lifecycle events |
| `ALLOW_DEV_PROVIDER_SIMULATE` | No | Allow dev provider-event simulate in production (avoid) |
| `OUTBOUND_DEV_WEBHOOK_REPLAY_SECRET` | No | Dev duplicate-webhook simulation |
| `ALLOW_DEV_WEBHOOK_REPLAY` | No | Allow replay route in production (avoid) |

† Required for Google suppression sync. ‡ Required when using the Resend provider.

\*Required for HTTP/cron drain and authenticated queue metrics outside `AUTOPROCESS_OUTBOUND_QUEUE`.

## Real vs stubbed

| Area | Status |
|------|--------|
| Tenant-scoped queries + access checks | Implemented |
| CSV import | Implemented |
| Google Sheets suppression sync | Implemented (needs SA + shared sheet) |
| RocketReach | Stub (`src/server/integrations/rocketreach/`) |
| Outbound send + persistence | Implemented (`sendEmailToContact` → `QUEUED`, worker → `SENT` / `FAILED` / retries) |
| Queue | **PostgreSQL**-backed claims (`SKIP LOCKED`), not Redis — suitable for moderate volume; upgrade path to BullMQ/Inngest later |
| ESP provider | **Mock** by default; **Resend** optional via env |
| Resend delivery/bounce webhooks | Implemented (`/api/webhooks/resend` + `OutboundProviderEvent`) |
| Inbound webhook + ingest service | Implemented (`/api/inbound/email/[token]`, `ingestInboundForClient`) |
| Inbound dev simulate | Implemented (gated by secret / env) |
| Reporting snapshots | Seeded / nightly-style aggregates — **plus** live 30d lifecycle counts on Reporting |

## Scripts

| Command | Purpose |
|--------|---------|
| `npm run dev` | Dev server (Turbopack) |
| `npm run build` | Production build |
| `npm run start` | Production server |
| `npm run db:generate` | Prisma generate |
| `npm run db:migrate:dev` | Dev migrations |
| `npm run db:migrate` | `prisma migrate deploy` |
| `npm run db:seed` | Seed |
| `npm run worker:outbound` | Drain outbound send queue once (CLI; pass optional batch size) |

**Cron-friendly drain (production)**

```bash
curl -sS -X POST -H "Authorization: Bearer $PROCESS_QUEUE_SECRET" -H "Content-Type: application/json" \
  -d '{"limit":25}' "https://your-host/api/internal/outbound/process-queue"
```

**Monitoring**

```bash
curl -sS "https://your-host/api/health"
curl -sS -H "Authorization: Bearer $PROCESS_QUEUE_SECRET" "https://your-host/api/internal/outbound/queue-status"
```

## Staging and production deployment

Step-by-step checklist: **[docs/STAGING_ROLLOUT.md](docs/STAGING_ROLLOUT.md)**. Triage: **[docs/EMAIL_OPERATIONS_RUNBOOK.md](docs/EMAIL_OPERATIONS_RUNBOOK.md)**.

**Recommended production shape**

| Concern | Recommendation |
|--------|------------------|
| App process | `npm run build` then `npm run start` (or your platform’s Node runner) |
| Database | `npm run db:migrate` (`prisma migrate deploy`) in CI/CD before traffic |
| Outbound queue | **Turn off** `AUTOPROCESS_OUTBOUND_QUEUE` (omit or `false`). Use a **cron** or **separate worker** to drain continuously. |
| Drain methods | (1) `POST /api/internal/outbound/process-queue` with Bearer `PROCESS_QUEUE_SECRET` and JSON `{"limit":20}` — from cron every 1–5 minutes or a tight loop on a small VM; (2) `npm run worker:outbound -- 25` on a systemd timer / Windows Task Scheduler. |
| Load balancer | Point health checks to `GET /api/health` (200 when DB is reachable) |
| Secrets | Separate `PROCESS_QUEUE_SECRET` and Resend keys per environment (staging vs prod) |

**Resend: register webhooks (real delivery/bounce updates)**

1. In [Resend](https://resend.com) → **Webhooks** → **Add endpoint**.
2. **URL:** `https://<your-deployment-host>/api/webhooks/resend` (staging: use your staging hostname; local: use **ngrok** or similar — Resend requires a public HTTPS URL).
3. Subscribe to email events you care about (at minimum: sent/delivery/bounce/failed — match what `applyNormalizedEmailEvent` handles; see `src/server/email/outbound/lifecycle.ts`).
4. Copy the **Signing secret** (Svix) into `RESEND_WEBHOOK_SECRET` in that environment’s env vars.
5. Deploy; send a test mail; confirm **Recent provider events** on `/operations/outbound` shows rows with `dedupeHash` and correct `providerMessageId`.

**Staging-safe replay check (no duplicate state)**

- Prefer Resend’s dashboard “redeliver” on a single webhook if available, **or**
- `POST /api/dev/simulate-webhook-replay` on a **staging** host with `ALLOW_DEV_WEBHOOK_REPLAY=true` and `OUTBOUND_DEV_WEBHOOK_REPLAY_SECRET` (never enable casually in prod).

---

## Staging smoke test (end-to-end)

Use a **staging** database and Resend **sandbox/test** domain as appropriate.

1. **Sender ready** — Set `Client.defaultSenderEmail`, verify domain/sender in Resend, then **Mark VERIFIED_READY** on `/operations/outbound?client=<id>`. Confirm `/clients/<id>` sender panel shows **Ready** (or expected warnings for mock).
2. **Enqueue** — Contacts → **Send** on a non-suppressed contact → row appears as `QUEUED` / `REQUESTED` in Activity.
3. **Worker processes** — With `AUTOPROCESS_OUTBOUND_QUEUE=false`, call `POST .../process-queue` with `PROCESS_QUEUE_SECRET` **or** run `npm run worker:outbound` until the row reaches `SENT` and has `providerMessageId`.
4. **Provider accepts** — Resend dashboard shows the message; API logs clean. If `ALLOWED_SENDER_EMAIL_DOMAINS` is set, domain must match.
5. **Webhook updates status** — Resend fires to `/api/webhooks/resend`; Activity / outbound detail shows `DELIVERED` (or bounce) and `/operations/outbound` lists the event with provider id + `dedupeHash`.
6. **Replay is harmless** — Redeliver the same webhook or use the staging replay route; second delivery does not corrupt lifecycle (dedupe); flags show **replay** where applicable.
7. **Reply linkage** — `POST /api/dev/simulate-inbound` (staging with secret) or real inbound with `inReplyToProviderId` = outbound `providerMessageId`; outbound can move to `REPLIED` when linked (same tenant).
8. **Operations page** — `/operations/outbound` reflects stuck/stale/failed lists and recent events consistent with the DB.

---

## Local smoke test (queue + send + webhook + reply)

1. In `.env`: `AUTOPROCESS_OUTBOUND_QUEUE=true`, `INBOUND_DEV_SIMULATE_SECRET`, `OUTBOUND_DEV_QUEUE_SECRET`, `OUTBOUND_DEV_PROVIDER_EVENT_SECRET` (any long random strings for dev).
2. `npm run dev`, sign in as staff with access to a seeded client.
3. **Contacts** → **Send** on a non-suppressed contact → banner **queued** → **Activity** should show `QUEUED` / `PROCESSING` then **`SENT`** (if autoprocess runs) or run `npm run worker:outbound` or:

```powershell
Invoke-RestMethod -Uri "http://localhost:3000/api/dev/process-outbound-queue" -Method POST -Headers @{ "x-dev-secret" = $env:OUTBOUND_DEV_QUEUE_SECRET; "Content-Type" = "application/json" } -Body '{"limit":15}'
```

4. **Simulate delivery** (after row has `providerMessageId`):

```powershell
$body = @{ outboundEmailId = "<id>"; eventType = "email.delivered" } | ConvertTo-Json
Invoke-RestMethod -Uri "http://localhost:3000/api/dev/simulate-provider-event" -Method POST -Headers @{ "x-dev-secret" = $env:OUTBOUND_DEV_PROVIDER_EVENT_SECRET; "Content-Type" = "application/json" } -Body $body
```

5. **Inbound reply** — same as before: `POST /api/dev/simulate-inbound` with `inReplyToProviderId` = outbound `providerMessageId`; outbound can move to **`REPLIED`** when linked.

## License

Private — OpensDoors internal use.
