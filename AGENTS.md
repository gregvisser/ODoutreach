<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Cursor Cloud specific instructions

### Services overview

| Service | How to run | Notes |
|---------|-----------|-------|
| PostgreSQL 16 | `docker compose up -d` (port 5433) | Required. User: `opensdoors`, password: `opensdoors_dev_local`, DB: `opensdoors_outreach` |
| Next.js dev server | `npm run dev` (port 3000, Turbopack) | Health: `GET /api/health` |

### Key commands

See `package.json` scripts. Highlights:
- **Lint:** `npm run lint`
- **Test:** `npm test` (vitest, no DB needed — all tests are unit/pure)
- **Dev server:** `npm run dev`
- **Build:** `npm run build --webpack` (uses webpack; Turbopack is dev-only)
- **Migrations:** `npm run db:migrate:dev` (interactive) or `npm run db:migrate` (deploy, non-interactive)
- **Seed:** `npm run db:seed`

### Gotchas

- Docker must be running before starting the dev server (PostgreSQL on port 5433). The `docker-compose.yml` maps container port 5432 → host port 5433 to avoid collisions.
- `prisma migrate dev` is interactive and will hang in non-TTY shells. Use `prisma migrate deploy` for non-interactive migration application, then run `prisma generate` if needed.
- The `postinstall` script runs `prisma generate` automatically after `npm install`.
- Auth requires Microsoft Entra ID credentials. For build/lint/test, placeholder values suffice. For actual sign-in you need a real Entra app registration.
- The `.env` file is gitignored. Copy `.env.example` and fill values per the README.
- Advisory lock timeout on migrations: if a previous `prisma migrate` process died, terminate stale PG connections before retrying (`SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE ...`).
- In Cloud Agent Docker-in-Docker environments, start `dockerd` before `docker compose up -d`. Use `fuse-overlayfs` storage driver and `iptables-legacy`.
- `npm run build` uses the `--webpack` flag (not Turbopack) for production builds.

### Testing without Entra SSO

The dev API routes (gated by `x-dev-secret` header) allow exercising core outbound pipeline logic without signing in:
- `POST /api/dev/process-outbound-queue` — drain send queue
- `POST /api/dev/simulate-provider-event` — simulate delivery/bounce webhooks
- `POST /api/dev/simulate-inbound` — simulate inbound reply ingestion
- `POST /api/dev/simulate-webhook-replay` — test deduplication

Secrets for these routes are set in `.env` (see `OUTBOUND_DEV_*` / `INBOUND_DEV_*` vars). See README "Local smoke test" section for the full flow.
