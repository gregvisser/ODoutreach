# Azure staging — recommended layout

Practical target for **first hosted staging** of this Next.js + PostgreSQL app. Infra is created in Azure Portal / CLI — not by this repo.

## Recommended architecture

| Layer | Azure service | Role |
|-------|----------------|------|
| App | **Azure App Service** (Linux, Node 20 LTS) | Runs `next start` after `next build` |
| Database | **Azure Database for PostgreSQL – Flexible Server** | `DATABASE_URL` for Prisma |
| Secrets | **App Service configuration** (or **Key Vault** references) | Env vars; no secrets in git |
| HTTPS | App Service default certificate + custom domain (optional) | Public URL for Clerk + **Resend webhooks** |

**Webhook requirement:** Resend must reach `https://<your-app>.azurewebsites.net/api/webhooks/resend` (or your custom domain). Plan DNS + HTTPS before end-to-end email proof.

## App Service settings (high level)

- **Stack:** Node 20 LTS  
- **Startup command:** `npm run start` (see `package.json`; build runs in deployment pipeline or Oryx build step).  
- **Build:** Prefer **GitHub Actions → deploy to App Service** or **Azure DevOps**, or local `npm run build` + deploy artifact — do **not** run dev server in Azure.

Typical **Application settings** (names only — values from your secrets):

- `DATABASE_URL` — PostgreSQL connection string (SSL often required: `?sslmode=require`).
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` — staging Clerk application.
- `EMAIL_PROVIDER`, `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET` — if using Resend on staging.
- `PROCESS_QUEUE_SECRET` — for internal queue drain + `queue-status`.
- `INTERNAL_APP_URL` — `https://<your-staging-host>` (for optional post-enqueue HTTP drain).
- `AUTOPROCESS_OUTBOUND_QUEUE` — **`false` or omit** on staging/production (in-process autoprocess is ignored in production builds; use a worker/cron).
- `STAFF_EMAIL_DOMAINS` — if staff access is domain-restricted.

See `.env.example` and root README for the full list.

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
2. Create staging Clerk app + redirect URLs for the Azure hostname.
3. Paste env vars into App Service configuration.
4. Run migrations.
5. Deploy the built app.
6. Register Resend webhook URL to the public HTTPS host.

This repository does **not** contain ARM/Bicep templates unless added later; the above is enough to implement staging without locking into one IaC tool.
