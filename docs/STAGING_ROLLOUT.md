# Staging rollout — verification checklist

Use this for **first staging deploy** and after **meaningful config changes**. This doc is procedural; architecture lives in the root `README.md`.

## Preconditions (external)

| Item | Notes |
|------|--------|
| PostgreSQL | Staging database URL in `DATABASE_URL` |
| Clerk | Staging application keys (`NEXT_PUBLIC_*` + `CLERK_SECRET_KEY`) |
| Hostname | HTTPS URL for the app (needed for Resend webhooks) |
| Resend (real smoke) | API key + verified domain/sender in Resend for staging |
| Staff users | Clerk users allowed by `STAFF_EMAIL_DOMAINS` if set |

---

## Preflight (before deploy)

Run locally against the **same `.env` you will use in staging** (or a copy with staging values):

```bash
npm run staging:preflight -- --staging
```

**Manual checks:**

- [ ] `AUTOPROCESS_OUTBOUND_QUEUE` is **not** `true` for staging (use cron/worker; production build also **ignores** autoprocess — see `trigger-queue.ts`).
- [ ] `PROCESS_QUEUE_SECRET` is set (long random).
- [ ] If `EMAIL_PROVIDER=resend`: `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET` set.
- [ ] `INTERNAL_APP_URL` matches your public app origin (used for fire-and-forget drain after enqueue when not using autoprocess).

---

## Deploy steps

1. **Build:** `npm run build`
2. **Migrate:** `npm run db:migrate` against staging DB (CI/CD or one-off with staging `DATABASE_URL`).
3. **Start:** `npm run start` (or platform equivalent).
4. **Smoke hit (unauthenticated):**

   ```bash
   npm run staging:verify-health -- https://your-staging-host.example
   ```

   Expect `GET /api/health` → `{ "ok": true, "checks": { "database": "ok" } }`.

---

## Post-deploy smoke (staging)

Complete in order. **Pass/fail signals** are explicit.

| # | Step | Pass signal | Requires real ESP |
|---|------|-------------|---------------------|
| 1 | Env loaded | App boots; no crash on DB connect | No |
| 2 | Migrations | `db:migrate` exits 0; app queries work | No |
| 3 | Auth | Staff can sign in; blocked if domain policy and wrong domain | No |
| 4 | Sender UI | `/clients/<id>` shows sender readiness panel with expected state | No |
| 5 | Enqueue | Contacts → Send → `OutboundEmail` `QUEUED` (or `BLOCKED_SUPPRESSION` if suppressed) | No |
| 6 | Drain | `POST /api/internal/outbound/process-queue` with Bearer secret **or** `npm run worker:outbound` → row progresses | No |
| 7 | Provider | Row `SENT` + `providerMessageId` set | Yes if Resend; mock gives fake id |
| 8 | Webhook | Resend hits `/api/webhooks/resend`; `/operations/outbound` shows event + lifecycle update | Yes |
| 9 | Replay | Same Svix delivery again → dedupe; no double lifecycle corruption | Yes |
| 10 | Reply | Inbound with `inReplyToProviderId` → outbound can show `REPLIED` when linked | Partial (dev simulate ok) |
| 11 | Ops | `/operations/outbound` + `GET /api/internal/outbound/queue-status` match DB truth | No |

**Fallback without Resend:** `EMAIL_PROVIDER=mock`, use dev simulate routes for steps 8–9 shape only; confirms **code paths**, not ESP behavior.

### End-to-end smoke (copy/paste order)

1. `npm run staging:preflight -- --staging` → exit 0.
2. Deploy; `npm run staging:verify-health -- https://<staging-host>` → health OK.
3. Sign in as staff → land in app shell.
4. Open a client → confirm sender panel text matches policy (configured / mock / resend).
5. Contacts → Send (non-suppressed) → Activity shows queued flow.
6. Trigger drain (cron script or worker) until `SENT`.
7. If Resend: confirm message in Resend UI; if mock: skip external proof.
8. If Resend: confirm webhook row on `/operations/outbound`; if mock: use `simulate-provider-event` for lifecycle shape only.
9. Replay webhook (Resend redeliver or staging replay route) → harmless dedupe.
10. Inbound reply path (real webhook or dev simulate with secret) → `REPLIED` when linked.
11. Refresh ops page + `queue-status` → counts align with expectations.

---

## Webhook registration (Resend)

1. Resend → Webhooks → Add endpoint → URL `https://<staging-host>/api/webhooks/resend`
2. Select email lifecycle events you need (delivered, bounced, etc.).
3. Paste **Signing secret** into `RESEND_WEBHOOK_SECRET` for staging.
4. Send a test email from the app; confirm a row in **Recent provider events** on `/operations/outbound`.

---

## Queue runner (staging)

Recommended:

- **Cron** every 1–5 min: `POST /api/internal/outbound/process-queue` with `Authorization: Bearer <PROCESS_QUEUE_SECRET>` and body `{"limit":25}`, **or**
- **Scheduled task** running `npm run worker:outbound -- 25` on a VM with staging `DATABASE_URL`.

Do not rely on `AUTOPROCESS_OUTBOUND_QUEUE` in staging.

---

## Rollback / failure triage (short)

- **Bad deploy:** revert image/commit; DB migrations are forward-only — avoid destructive migrations without backup.
- **Queue backing up:** see [EMAIL_OPERATIONS_RUNBOOK.md](./EMAIL_OPERATIONS_RUNBOOK.md).
- **Secrets rotated:** update host env; restart; re-test `/api/health` and webhook signing.

---

## What this doc does not verify

- DNS/DKIM health inside Resend (dashboard).
- Deliverability or inbox placement.
- Load testing.

Code may be **ready** while external verification is still **pending** — track both separately.
