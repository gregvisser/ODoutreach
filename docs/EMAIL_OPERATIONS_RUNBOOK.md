# Email operations — triage runbook

Short reference for **staging and production**. Multi-tenant isolation is unchanged: all actions stay within `getAccessibleClientIds` / `requireClientAccess`.

## Quick signals

| Check | Where | Healthy |
|-------|--------|---------|
| App + DB | `GET /api/health` | `ok: true`, `database: ok` |
| Queue depth | `GET /api/internal/outbound/queue-status` + Bearer `PROCESS_QUEUE_SECRET` | `queued` / `processing` stable; `failedLastHour` not spiking |
| Sender | Client detail + `/operations/outbound` | Readiness panel + optional **Mark VERIFIED_READY** after Resend checks |
| Webhooks | `/operations/outbound` → Recent provider events | Events appear after sends when `RESEND_WEBHOOK_SECRET` matches Resend |

Secrets are **never** logged by these endpoints.

---

## Symptom → action

### Sender “not ready” / sends fail at ESP

- **Check:** Client `defaultSenderEmail`, `ALLOWED_SENDER_EMAIL_DOMAINS`, Resend domain verification.
- **App:** Mark **VERIFIED_READY** only after operational confirmation in Resend (panel explains app vs ESP verification).

### Send stays `QUEUED` / never `SENT`

- **Check:** Is a drain running? (`AUTOPROCESS` is dev-only; staging needs cron/worker.)
- **Run:** `POST /api/internal/outbound/process-queue` or `npm run worker:outbound`.
- **Check:** `queue-status` → `queued` should drop after drain.

### Stuck `PROCESSING`

- **Check:** `/operations/outbound` → stale PROCESSING; **Release stale locks** (tenant-scoped).
- **Cause:** Worker crash after claim; claim expiry logic.

### Webhook not arriving

- **Check:** Resend dashboard URL matches `https://<host>/api/webhooks/resend`, HTTPS, correct env.
- **Check:** `RESEND_WEBHOOK_SECRET` matches Resend signing secret.
- **Check:** Firewall / edge allows POST from Resend.

### Duplicate webhook delivery

- **Expected:** Second insert dedupes; may show **replay** flag; lifecycle should not regress (see reliability docs in README).

### `FAILED` with no `providerMessageId`

- **Safe retry:** `/operations/outbound` **Requeue** (does not double-send at ESP if never accepted).

### `FAILED` with `providerMessageId`

- **Do not** use casual requeue — manual review; risk of duplicate customer-visible mail.

### Reply not linking

- **Check:** `inReplyToProviderId` matches stored outbound `providerMessageId`; same `clientId` (ingest is conservative).
- **Dev:** `POST /api/dev/simulate-inbound` (gated) for shape tests.

### Queue growing

- **Check:** `queue-status` `queued`, `queuedOlderThan30mApprox`.
- **Scale:** Increase cron frequency or batch `limit`; fix underlying send errors.

---

## Dev-only routes

Gated by secrets and often `ALLOW_DEV_*` / `NODE_ENV`. **Do not enable** dev flags on production without a deliberate reason. See `.env.example` and README.

---

## Related code

- Queue: `src/server/email/outbound/queue-processor.ts`, `trigger-queue.ts`
- Webhooks: `src/app/api/webhooks/resend/route.ts`
- Ops UI: `/operations/outbound`
