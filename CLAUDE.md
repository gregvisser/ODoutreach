@AGENTS.md

# Project workflow reference

OpensDoors Outreach is a multi-tenant cold-outreach app: **Next.js 16 / React 19 / TypeScript**, **Prisma 7 + PostgreSQL**, auth via **next-auth v5 + Microsoft Entra ID**. Package manager is **npm**. Deployed to **Azure App Service** (`app-opensdoors-outreach-prod`, RG `rg-opensdoors-outreach-prod`) via **GitHub Actions**.

## Deploy flow
- Pushing to `main` is the deploy trigger. `.github/workflows/ci.yml` runs lint/test/build; `.github/workflows/deploy-production.yml` then builds (webpack) and deploys to Azure using Entra **OIDC** (no publish profile).
- Real secrets live in **Azure App Service config** and **GitHub Secrets**, never in the repo. `.env*` files are gitignored (`.env.example` is the committed template).
- Two cron workflows run on schedule (weekdays, UK hours): `process-outbound-queue.yml` (every 5 min, sends queued mail) and `sync-replies.yml` (every 15 min, ingests replies).

## Key commands
- `docker compose up -d` — local Postgres (host port **5433**), required before dev.
- `npm run dev` — dev server (Turbopack, port 3000).
- `npm run lint` / `npm test` / `npm run build` — checks before pushing (build uses **webpack**, not Turbopack).
- `npm run db:migrate:dev` — create + apply a migration **locally**.
- `npm run db:migrate` — apply existing migrations (`prisma migrate deploy`) — used for **production**.
- `npm run db:generate` — regenerate Prisma client (output: `src/generated/prisma`).
- `npm run db:seed` — seed DB.
- `git push origin main` — deploys via Actions. Watch with `gh run watch`.

## Migrations on production — apply carefully
Production migrations are **NOT applied automatically on deploy**. The deploy workflow's migrate step is gated behind repo variable `PRODUCTION_PRISMA_MIGRATE == 'true'` (plus secret `PRODUCTION_DATABASE_URL`). When that variable is unset/false, a schema change can deploy against an un-migrated database. Either enable the gated step or run `prisma migrate deploy` manually against prod with the production `DATABASE_URL`. Treat production migrations as a deliberate, separate, confirm-first step.

## Environment / runtime notes
- Local Node is v22; CI and Azure build/run on **Node 20** — keep this gap in mind.
- `.azure/prod-db-admin-password.txt` holds a plaintext prod DB password; `.azure/` is gitignored. Do not commit or echo it.

---
<!-- BidlowAI Engineering Standard — injected 2026-07-19. Full rules: ENGINEERING-STANDARD.md (repo root) -->
## BidlowAI Engineering Standard (non-negotiable)

Treat this repository as PRODUCTION software with paying customers — never prototype-quality code. If a request would drop below the standard, STOP and propose the compliant approach. There are no prototypes here.

- **Before code:** restate the spec (goal / must-not-change / how we verify); smallest diff, one concern.
- **While coding:** strict types (no `any`/`# type: ignore`); validate every boundary (zod/pydantic); handle & report errors — nothing swallowed; secrets from env only; no `console.log`/`print`, commented-out code, or untracked `TODO`.
- **Done =** lint / typecheck / tests (new tests added) / build all green; e2e for new flows; validation for new inputs.
- **Git:** conventional commits, scoped; never commit secrets/binaries/other-client assets; PR into protected `main`, CI green.
- **When it breaks:** revert to the last green commit and retry from a tighter spec — don't prompt-patch deeper.

Full rules & Definition of Done: see `ENGINEERING-STANDARD.md`.
