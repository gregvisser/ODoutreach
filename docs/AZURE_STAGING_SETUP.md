# Azure staging — recommended layout

**CLI prerequisite:** run `az login` and `az account set --subscription <id>` before any `az` commands; without an authenticated session, create resources from the Portal using the same settings below.

```bash
# After login — confirm account and default subscription
az account show --query "{name:name, id:id, user:user.name}" -o table
az group list -o table
```

Practical target for **first hosted staging** of this Next.js + PostgreSQL app. Infra is created in Azure Portal / CLI — not by this repo.

## Microsoft Entra — exact staging redirect URI

Add this **Web** redirect URI to the Entra app registration (Authentication → Platform configurations → Web):

```text
https://<staging-host>/api/auth/callback/microsoft-entra-id
```

Replace `<staging-host>` with your real hostname, e.g. `myapp.azurewebsites.net` or `staging.opensdoors.example`. **No trailing slash** after the path.

- **Sign-out URL** is optional for this app pattern; Auth.js handles session end in-app.
- **SPA** redirect URIs are **not** required — this is a server-side OAuth callback (Auth.js / NextAuth).
- Set **`AUTH_URL`** in App Service to **`https://<staging-host>`** (same origin as the redirect URI). Mismatches break OAuth redirects.

### Clerk → Entra (this repo)

There is **no Clerk** in this codebase anymore. Staging needs **only** Entra app registration values (`AUTH_MICROSOFT_ENTRA_ID_*`, `AUTH_SECRET`, `AUTH_URL`). Do **not** configure Clerk keys. Staff access is enforced in-app via **`StaffUser`** + optional **`STAFF_EMAIL_DOMAINS`** — provision users in the DB (or seed) as for local; MFA remains in Entra.

## Recommended architecture

| Layer | Azure service | Role |
|-------|----------------|------|
| App | **Azure App Service** (Linux, Node 20 LTS) | Runs `next start` after `next build` |
| Database | **Azure Database for PostgreSQL – Flexible Server** | `DATABASE_URL` for Prisma |
| Secrets | **App Service configuration** (or **Key Vault** references) | Env vars; no secrets in git |
| HTTPS | App Service default certificate + custom domain (optional) | Public URL for **Entra redirect URIs** + **Resend webhooks** |

**Webhook requirement:** Resend must reach `https://<your-app>.azurewebsites.net/api/webhooks/resend` (or your custom domain). Plan DNS + HTTPS before end-to-end email proof.

## App Service settings (high level)

- **Stack:** Node 20 LTS  
- **Startup command:** `npm run start` (see `package.json`; build runs in deployment pipeline or Oryx build step).  
- **Build:** Prefer **GitHub Actions → deploy to App Service** or **Azure DevOps**, or local `npm run build` + deploy artifact — do **not** run dev server in Azure.

### Application settings — secrets vs configuration

| Name | Kind | Notes |
|------|------|--------|
| `DATABASE_URL` | **Secret** | PostgreSQL connection string; use **SSL** (`sslmode=require` or Azure’s connection string format). |
| `AUTH_SECRET` | **Secret** | Random string (e.g. `openssl rand -base64 32`); encrypts cookies/JWT. |
| `AUTH_MICROSOFT_ENTRA_ID_SECRET` | **Secret** | Entra client secret value. |
| `AUTH_MICROSOFT_ENTRA_ID_ID` | Config | Application (client) ID (GUID). |
| `AUTH_MICROSOFT_ENTRA_ID_ISSUER` | Config | Single-tenant: `https://login.microsoftonline.com/<tenant-id>/v2.0` (no trailing slash). |
| `AUTH_URL` | Config | **Must** be `https://<staging-host>` — public origin only. |
| `PROCESS_QUEUE_SECRET` | **Secret** | Bearer token for internal queue routes. |
| `RESEND_API_KEY` | **Secret** | If `EMAIL_PROVIDER=resend`. |
| `RESEND_WEBHOOK_SECRET` | **Secret** | Resend webhook signing secret. |
| `INTERNAL_APP_URL` | Config | Same as public app URL for drain helpers. |
| `STAFF_EMAIL_DOMAINS` | Config | Comma-separated domains; optional. |
| `EMAIL_PROVIDER` | Config | `mock` or `resend`. |
| `NODE_ENV` | Config | `production` on App Service (platform often sets this). |

Typical **Application settings** (names only — values from your secrets):

- `DATABASE_URL` — PostgreSQL connection string (SSL often required: `?sslmode=require`).
- `AUTH_SECRET`, `AUTH_URL`, `AUTH_MICROSOFT_ENTRA_ID_ID`, `AUTH_MICROSOFT_ENTRA_ID_SECRET`, `AUTH_MICROSOFT_ENTRA_ID_ISSUER` — Entra app registration (see `.env.example`).
- `EMAIL_PROVIDER`, `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET` — if using Resend on staging.
- `PROCESS_QUEUE_SECRET` — for internal queue drain + `queue-status`.
- `INTERNAL_APP_URL` — `https://<your-staging-host>` (for optional post-enqueue HTTP drain).
- `AUTOPROCESS_OUTBOUND_QUEUE` — **`false` or omit** on staging/production (in-process autoprocess is ignored in production builds; use a worker/cron).
- `STAFF_EMAIL_DOMAINS` — if staff access is domain-restricted.

See `.env.example` and root README for the full list. Run `npm run staging:preflight -- --staging` against a staging env copy before deploy.

## Migrations

Run **after** DB exists and **before** or **as part of** first deploy:

```bash
npm run db:migrate
```

Use a release step, SSH Kudu console, or pipeline job with `DATABASE_URL` pointing at Azure PostgreSQL. Do not commit migration SQL edits after apply.

## Queue drain on Azure

- **Option A — HTTP cron:** Azure **Logic App**, **Container Apps Job**, or external cron hitting `POST /api/internal/outbound/process-queue` with `Authorization: Bearer <PROCESS_QUEUE_SECRET>`.
- **Option B — Always-on worker:** Small **VM** or **Container Instance** running `npm run worker:outbound` on a schedule (needs `DATABASE_URL` + network to DB).

See [STAGING_ROLLOUT.md](./STAGING_ROLLOUT.md) and [EMAIL_OPERATIONS_RUNBOOK.md](./EMAIL_OPERATIONS_RUNBOOK.md).

## Health checks

- Configure App Service **Health check path** to `/api/health` (GET, 200 when DB is up).
- Use `GET /api/internal/outbound/queue-status` with Bearer secret for deeper queue metrics (monitoring script or Application Insights custom ping).

## Cold start / scale

- App Service **Always On** (paid tiers) reduces cold start for webhooks and cron.

## What you must do manually

1. Create resource group, PostgreSQL, App Service, networking/firewall so App Service can reach PostgreSQL.
2. Register an Entra app: add redirect URI `https://<staging-host>/api/auth/callback/microsoft-entra-id`, grant **openid**, **profile**, **email** (OIDC); create a client secret.
3. Paste env vars into App Service configuration.
4. Run migrations.
5. Deploy the built app.
6. Register Resend webhook URL to the public HTTPS host.

This repository does **not** contain ARM/Bicep templates unless added later; the above is enough to implement staging without locking into one IaC tool.

### Example staging resource group

A dedicated group **`rg-opensdoors-outreach-staging`** (UK South) may be used in the Bidlow subscription for Postgres + App Service + related resources — create servers and apps **inside** this group so naming and billing stay isolated from other projects (`odcrm-rg`, `rg-bidlow-ai-training-*`, etc.).

### PostgreSQL Flexible Server (staging)

**Target shape:** server name **`pg-opensdoors-outreach-staging`**, region **UK South**, **PostgreSQL 16**, **Burstable** **`Standard_B1ms`**, **32 GiB** storage, public access with firewall rules as needed for App Service outbound IPs or developer access.

Create the server (replace `<ADMIN_PASSWORD>` — store only in App Service settings or a gitignored file, never in git):

```bash
az postgres flexible-server create \
  --resource-group rg-opensdoors-outreach-staging \
  --name pg-opensdoors-outreach-staging \
  --location uksouth \
  --admin-user odoutreach \
  --admin-password '<ADMIN_PASSWORD>' \
  --sku-name Standard_B1ms \
  --tier Burstable \
  --storage-size 32 \
  --version 16 \
  --public-access All \
  --yes
```

If **`az create`** fails immediately with **connection reset / 10054** (common behind strict proxies), create the same server from **Azure Portal** (PostgreSQL flexible server) with matching options, or retry from a different network.

**Note:** Do **not** pass `--database-name` unless using an elastic cluster — create the app database after the server exists:

```bash
az postgres flexible-server db create \
  --resource-group rg-opensdoors-outreach-staging \
  --server-name pg-opensdoors-outreach-staging \
  --database-name opensdoors_outreach
```

**`DATABASE_URL` for Prisma** (URL-encode the password if it contains `@`, `#`, `%`, etc.):

```text
postgresql://odoutreach:<ADMIN_PASSWORD>@pg-opensdoors-outreach-staging.postgres.database.azure.com/opensdoors_outreach?sslmode=require
```

Use this value in **App Service → Configuration** as `DATABASE_URL` (mark as slot setting / Key Vault reference in production if you adopt that pattern). Run **`npm run db:migrate`** against this URL before or as part of first deploy.
