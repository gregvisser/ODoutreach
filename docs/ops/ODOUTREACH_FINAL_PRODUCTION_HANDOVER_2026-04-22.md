# ODoutreach Final Production Handover — 2026-04-22

> Owner: Greg + OpensDoors operators
> Author: Cursor agent (docs-only pass)
> Branch: `docs/final-production-handover-2026-04-22`
> Baseline SHA: `d77592a` (main, after PR #52 — inbound full-body fetch failure hardening)
> Production host: `https://opensdoors.bidlow.co.uk` (front door) / `https://app-opensdoors-outreach-prod.azurewebsites.net` (origin)
> Prior audit: [`ODOUTREACH_PRODUCTION_READINESS_AUDIT_2026-04-21.md`](./ODOUTREACH_PRODUCTION_READINESS_AUDIT_2026-04-21.md) graded the platform **C+ / D (real-prospect)**. This report supersedes it.
> Mode: Docs-only — no code, schema, migrations, sends, imports, syncs, app settings or secret rotations.

---

## 1. Executive status

| Dimension | Status | Grade |
|---|---|---|
| **Product readiness — live outreach capability** | Feature complete end-to-end: workspace → brief → mailboxes → sources → contacts → suppression → templates → sequences → launch approval → sends → replies → activity → unsubscribe. | **A-** |
| **Controlled operational readiness** | Safe today for OpensDoors-internal proofs and governed real-prospect batches behind approval + confirmation + caps. | **A** |
| **Security readiness — *before* secret rotation** | The known-exposed credentials from the pre-audit state are still unrotated. This is the only remaining security exception. | **B / exception** |
| **Security readiness — *after* secret rotation** | No other known gaps. | **A-** |
| **Real-prospect sending** | Technically supported, but only when every gate is green: `ACTIVE` client + `launchApprovedAt` in `LIVE_PROSPECT` mode + one-click unsubscribe ready + suppression configured + templates & sequence `APPROVED` + enrolled contacts email-sendable + mailbox capacity + operator typed confirmation. | Green once secrets rotated |

**Bottom line:**
The A–Z product build is complete. The **one** remaining must-do before unrestricted operational handover is **rotating the exposed secrets** (see §9). Everything else on the road to A+ is polish, retention hygiene, and the first controlled real-client campaign proof.

---

## 2. Current production baseline

- **Front door**: `https://opensdoors.bidlow.co.uk`
- **Azure Web App origin**: `app-opensdoors-outreach-prod` in `rg-opensdoors-outreach-prod`
- **Current prod SHA**: `d77592a` — `fix(activity): clarify inbound full-body fetch failures (#52)`
- **Health endpoints (both green, DB-backed)**:
  - `https://opensdoors.bidlow.co.uk/api/health` → `{ ok: true, service: "opensdoors-outreach", checks: { database: "ok" } }`
  - `https://app-opensdoors-outreach-prod.azurewebsites.net/api/health` → same shape
- **DB migrations**: up to date. Latest applied: `20260422190000_inbound_full_body` (PR P) after `20260422180000_unsubscribe_tokens` (PR M). Both additive, both applied manually via the PowerShell ARM / TLS 1.2 method — the deploy workflow does **not** run `prisma migrate deploy`.
- **Auth model**: Microsoft Entra ID sign-in → NextAuth → `StaffUser` scoped by `STAFF_EMAIL_DOMAINS`. Per-client authorization via `ClientMembership` rows.
- **Deploy**: GitHub Actions OIDC → `azure/webapps-deploy@v3`. CI (`lint`, `test`, `build`, `prisma validate`) is a required status check. Branch protection enforces PR-first merges.

---

## 3. What the system now supports end to end

A full OpensDoors operator flow from nothing to a running client campaign:

1. **Create client workspace shell** — `/clients/new` asks only for name + slug + optional industry / website / notes and creates a `Client` in `ONBOARDING` with a `ClientMembership (LEAD)` for the creator. No suppression / sender / cap guesswork at create time.
2. **Complete brief / sender identity** — `/clients/[id]/brief` captures company profile, structured email signature, target sector hints, notes. Brief readiness is a gate for later modules.
3. **Connect mailboxes** — `/clients/[id]/mailboxes` supports up to 5 Microsoft and/or Google mailboxes per client via delegated OAuth. Each mailbox is a `ClientMailboxIdentity` with `connectionStatus`.
4. **Configure suppression** — `/clients/[id]/suppression` accepts Google Sheet sources (emails + domains), runs `refreshContactSuppressionFlagsForClient`, and stores outcomes in `SuppressedEmail` / `SuppressedDomain`. Suppression is re-evaluated at send time.
5. **Import / preview contacts into a named list** — `/clients/[id]/contacts` supports CSV preview → review → confirm into a named `ContactList`. Nullable-email contacts are first-class (PR F1/F2/F3).
6. **Approve templates** — DRAFT → READY_FOR_REVIEW → APPROVED lifecycle enforced; only APPROVED templates can be used in a sequence.
7. **Build sequence** — the same lifecycle applies to sequences; steps reference approved templates and have explicit relative offsets.
8. **Enroll contacts** — records-only enrollment (PR D4c) — one `SequenceEnrollment` per contact per sequence, safely idempotent.
9. **Prepare send records** — D4e.1 plans a `SequenceStepSendRecord` per enrollment-step for the introduction and each follow-up. No send yet.
10. **Approve launch** — `/clients/[id]/outreach` launch-readiness rail; `LaunchApprovalMode = ALLOWLIST_INTERNAL | LIVE_PROSPECT`. `LIVE_PROSPECT` requires the one-click unsubscribe foundation to be ready.
11. **Send introduction / follow-ups manually** — operator-triggered D4e.2 / D4e.3 sends via the connected mailbox, typed confirmation, 30/day/mailbox cap, mailbox ledger/reservations, live suppression re-check.
12. **Receive replies** — inbound ingest per connected mailbox (Microsoft Graph + Gmail API). Microsoft full body is captured at ingest (PR P); Gmail captures snippet + thread/Message-ID metadata at ingest and full body is on-demand (PR P/Q).
13. **Read full inbound message inside ODoutreach** — `/clients/[id]/activity/messages/[messageId]` renders safe plain text extracted from provider HTML/plain, with "Full" / "Preview" badges. Operators do not need to open Outlook/Gmail.
14. **Reply from the connected mailbox** — PR J reply composer; RFC 5322 threading headers preserved.
15. **Auto-suppress unsubscribe clicks** — one-click hosted unsubscribe at `/unsubscribe/[token]` (PR M) writes `SuppressedEmail` + marks `UnsubscribeToken.usedAt`. Outbound sequence sends carry the real URL in body *and* `List-Unsubscribe` + `List-Unsubscribe-Post` headers (PR N).
16. **Monitor Activity timeline** — `/clients/[id]/activity` unifies outbound sends, inbound messages, unsubscribe events (PR O), and system audit events in one feed.

---

## 4. Production safety controls

- **Operator-triggered sends only.** No cron, no automatic follow-up scheduler, no background campaign blast.
- **30 sends / day / mailbox hard cap.** Enforced at reservation time.
- **Mailbox ledger / reservations.** Prevents double-send across concurrent operators.
- **Suppression re-checked at send time** — not only at enroll time; a suppression added five minutes ago will still block a pending send.
- **Launch approval required for real-prospect sends.** `LaunchApprovalMode = LIVE_PROSPECT` is the only mode that unlocks non-allowlisted recipients.
- **One-click unsubscribe required for `LIVE_PROSPECT`.** Governance refuses `LIVE_PROSPECT` sends unless `oneClickUnsubscribeReady = true`.
- **Templates approved before use.** Sequence steps can only reference `APPROVED` templates.
- **Sequences approved before use.** Same lifecycle at the sequence level.
- **Contact email required for sendability.** Nullable-email contacts are surfaced but never become sendable until they have an email.
- **Typed operator confirmation.** Live sends require typing an exact confirmation phrase.
- **Tenant isolation.** Every server action re-verifies staff and `requireClientAccess(staff, clientId)` before any query.
- **Audit trail.** Activity timeline + `AuditLog` rows for sends, inbound, handled, replies, unsubscribes.
- **List-Unsubscribe headers** (`<url>` + `List-Unsubscribe=One-Click`) on all sequence sends that have a hosted unsubscribe URL.
- **Classified provider errors on inbound full-body fetch** (PR Q) — operators see banner-safe copy, never raw provider stacks; non-retryable failures disable the Fetch button.

---

## 5. Module-by-module handover

| Module | Route | Status | What the operator can do today | Known limitation | Next improvement |
|---|---|---|---|---|---|
| New client | `/clients/new` | **Ready** | Create a minimum workspace shell (name, slug, +optional industry/website/notes). | No bulk client create. | Optional: template briefs per industry. |
| Overview | `/clients/[id]` | **Ready** | See workflow steps (`buildClientWorkflowSteps`) + cross-module readiness. | Readiness signals could gain deeper "why not ready?" tooltips. | — |
| Brief | `/clients/[id]/brief` | **Ready** | Capture profile + structured email signature + notes. | Attachments (customer agreement, accreditations) not yet captured in-system. | Attachments + reusable sector/role dropdowns. |
| Mailboxes | `/clients/[id]/mailboxes` | **Ready** | Connect/reconnect up to 5 Microsoft or Google mailboxes per client; see connection status; see full/preview badge on inbox rows. | No calendar/contacts scopes (intentional). | Per-mailbox daily-cap override. |
| Sources | `/clients/[id]/sources` | **Ready** | Connect contact sources (Google Sheet / RocketReach). | RocketReach auto-import still manual on purpose. | Preview/review RocketReach pulls once credits are safe. |
| Email lists / Contacts | `/clients/[id]/contacts` | **Ready** | CSV preview → review → confirm into named `ContactList`; nullable-email states surfaced. | No de-dup across lists within the same client beyond email match. | Per-contact enrichment audit. |
| Suppression | `/clients/[id]/suppression` | **Ready** | Configure Google Sheet sources (emails + domains) and refresh suppression flags on contacts. | Automatic suppression sync cron is intentionally not wired. | Operator-run "sync now" already works; scheduled sync is optional. |
| Templates | workspace subnav | **Ready** | Draft → review → approve; only APPROVED templates can be referenced. | No template A/B. | — |
| Sequences | workspace subnav | **Ready** | Same DRAFT/READY/APPROVED lifecycle, step offsets, launch-readiness rail. | No sequence branching. | — |
| Send preparation | PR D4e.1 | **Ready** | Prepare per-enrollment, per-step `SequenceStepSendRecord` rows. | Records are idempotent, not automatically re-planned after contact edits. | Optional plan-refresh action. |
| Sequence sending | PR D4e.2 / D4e.3 | **Ready** | Operator-triggered introduction + follow-ups, real `{{unsubscribe_link}}`, typed confirmation, caps, ledger. | Manual per operator — intentional. | — |
| Replies / Inbox | `/clients/[id]/activity/messages/[id]` | **Ready** | Read full inbound body (Microsoft at ingest; Gmail on-demand), reply, mark handled. | No attachment rendering yet. | Attachment listing, inline-image safety. |
| Activity | `/clients/[id]/activity` | **Ready** | Unified timeline: sends, inbound, unsubscribes, audit. | No full-body fetch audit event in timeline yet. | Emit `inbound_full_body_fetched` AuditLog → timeline. |
| Unsubscribe / Compliance | `/unsubscribe/[token]` + List-Unsubscribe headers | **Ready** | Hosted one-click route; body link; RFC 8058 `List-Unsubscribe-Post=One-Click`. | Some providers (Graph sendMail via JSON) cannot add `mailto:` fallback reliably. | RFC 8058 `mailto:` fallback via Gmail raw-MIME path. |
| Reporting | `/reporting` | **Usable / could improve** | Send / reply / unsubscribe counts at workspace + org level. | Still minimal. | Sequence-step funnel + cohort by launch approval. |
| Staff / security | `/settings/staff-access` + Entra | **Ready** | Staff provisioning scoped by `STAFF_EMAIL_DOMAINS`; per-client `ClientMembership`. | See §9 — exposed secrets still need rotation. | Post-rotation, publish a short access-review cadence. |

---

## 6. PR build history (this sprint)

| # | Title | Outcome |
|---|---|---|
| #42 | docs: audit ODoutreach production readiness | Baseline C+ audit; enumerated P0/P1 gaps that PRs #43–#52 closed. |
| #43 | PR J — Activity inbox message detail + reply composer | Inbound detail page + reply composer with tenant-scoped provider send. |
| #44 | feat(clients): create new clients as workspace shells | `/clients/new` reduced to minimum shell; progress state no longer lies. |
| #45 | feat(clients): add launch approval workflow | `LaunchApprovalMode`, `launchApprovedAt`, `launchApprovedByStaffUserId`. |
| #46 | fix(prisma): strip UTF-8 BOM from PR K migration | Repaired the PR K migration that had a BOM breaking `prisma migrate`. |
| #47 | feat(outreach): enforce launch approval before live sequence sends | Governance wall on real-prospect sends: launch approval + suppression + caps + operator confirmation. |
| #48 | feat(compliance): add one-click unsubscribe auto-suppression | Hosted `/unsubscribe/[token]`; tokens table; `{{unsubscribe_link}}` in body resolves to real URL; auto-suppress on redemption. |
| #49 | feat(compliance): add list-unsubscribe headers | Microsoft Graph `internetMessageHeaders` + Gmail raw-MIME `List-Unsubscribe` / `List-Unsubscribe-Post=One-Click` on sequence sends. |
| #50 | feat(activity): show unsubscribe events | `recipient_unsubscribed` `AuditLog` rows surfaced in client Activity timeline with masked email. |
| #51 | feat(activity): store and display full inbound email bodies | Additive `bodyText` + full-body metadata columns on `InboundMailboxMessage`; Microsoft ingest stores body; Gmail on-demand fetch; safe HTML → text normalization. |
| #52 | fix(activity): clarify inbound full-body fetch failures | Pure provider-error classifier (`message_not_available`, `provider_auth_error`, `provider_permission_error`, `provider_rate_limited`, `provider_unknown`); friendly amber banner; Gmail `internalDate` + RFC 5322 `Message-ID` captured at ingest. |

---

## 7. Real-prospect sending conditions

Real-prospect sequence sends are only allowed when **every** gate is green:

- **Client** `status = ACTIVE`
- **Launch approval** row exists: `launchApprovedAt` is set, `launchApprovedByStaffUserId` is set
- **Launch approval mode** is `LIVE_PROSPECT`
- **One-click unsubscribe ready** — the hosted unsubscribe route is configured (`AUTH_URL` / `INTERNAL_APP_URL` base + `UnsubscribeToken` table)
- **Suppression configured and synced** for the client
- **Sequence is `APPROVED`** (lifecycle DRAFT → READY_FOR_REVIEW → APPROVED)
- **Every step's template is `APPROVED`**
- **Enrolled contacts are email-sendable** (have email, not suppressed, not opted out, email-nullable states excluded)
- **Mailbox capacity** available (30/day/mailbox cap not exhausted, ledger free)
- **Operator explicitly confirms** the send via typed confirmation phrase

If *any* of these fails, send governance returns a `blocked_*` result and nothing is sent.

---

## 8. What is still intentionally not automated

These are **design decisions**, not gaps:

- **No cron.** No scheduler runs sends in the background.
- **No automatic follow-up scheduler.** Follow-ups are operator-triggered per window.
- **No background campaign blast.** A campaign is always "operator open → operator send one batch → operator wait → repeat".
- **No unapproved real-prospect sending.** There is no staff-only bypass.
- **No automatic RocketReach imports.** Pulls are operator-initiated to preserve credits.
- **No automatic suppression sync.** Suppression sync is operator-run; scheduled sync is optional future work.
- **No auto-retry of failed inbound full-body fetches.** Classified non-retryable failures (e.g. `message_not_available`) intentionally disable the Fetch button.

---

## 9. Remaining security exception — **the only A+ blocker**

The **one** outstanding gap before unrestricted handover is **secret rotation**. All product and governance work is done; the credentials known to have been exposed pre-audit have not yet been rotated.

### Secrets to rotate (minimum)

- `DATABASE_URL` / Postgres admin password
- `AUTH_SECRET` (NextAuth signing secret)
- `AUTH_MICROSOFT_ENTRA_ID_SECRET`
- `MAILBOX_MICROSOFT_OAUTH_CLIENT_SECRET`
- `MAILBOX_GOOGLE_OAUTH_CLIENT_SECRET`
- `MAILBOX_OAUTH_SECRET`
- `PROCESS_QUEUE_SECRET`
- `ROCKETREACH_API_KEY`
- `GOOGLE_SERVICE_ACCOUNT_JSON_BASE64`
- Any webhook / provider secrets present in app settings at rotation time

### Why this is the handover blocker

- The platform is otherwise A-grade; the send governance, unsubscribe, suppression, tenancy, audit, inbound reading and Activity layers are complete.
- Without rotation, a historical compromise could still be live, which is incompatible with handing the system to wider OpensDoors staff or pointing it at real prospects at volume.
- Rotation is operational, not a code change — the app reads from Azure App Settings; there is no schema, no migration and no code in the way.

### Rotation sequence (operator checklist)

1. Rotate the DB admin password first. Update `DATABASE_URL` app setting. Force a restart of `app-opensdoors-outreach-prod`.
2. Rotate each OAuth/provider secret in its home console (Entra, Google Cloud, RocketReach). Update app settings. Restart.
3. Rotate `AUTH_SECRET`, `MAILBOX_OAUTH_SECRET`, `PROCESS_QUEUE_SECRET`. Restart.
4. Re-issue the Google service account JSON if Greg has access to the SA; update `GOOGLE_SERVICE_ACCOUNT_JSON_BASE64`.
5. Verify `/api/health` returns `ok:true` with `database: ok` after each restart.
6. Smoke-test one governed outreach flow (allowlist-internal, not real prospect) to confirm OAuth tokens refresh correctly.
7. Tick §9 off in a follow-up handover note.

**Until §9 is done, security is B / exception. After §9 is done, security is A-.**

---

## 10. Recommended immediate operator checklist

Before the first real client campaign, in order:

1. **Rotate all secrets in §9.** Restart the Azure Web App after each batch of settings updates. Verify `/api/health`.
2. **Confirm `STAFF_EMAIL_DOMAINS`** matches the OpensDoors staff domain(s). No wildcard.
3. **Confirm `GOVERNED_TEST_EMAIL_DOMAINS` / live policy.** Keep `ALLOWLIST_INTERNAL` as the default for any new client; flip to `LIVE_PROSPECT` only after launch approval.
4. **Create the client workspace** at `/clients/new`.
5. **Complete the brief** and structured sender signature.
6. **Connect 1–5 mailboxes** (Microsoft or Google). Verify each `connectionStatus = CONNECTED`.
7. **Configure suppression sources** and run a sync.
8. **Import a reviewed contact list** via CSV preview → review → confirm.
9. **Approve the templates** used in the sequence.
10. **Approve the sequence** itself.
11. **Enroll contacts** into the sequence.
12. **Approve launch** (`ALLOWLIST_INTERNAL` first, then `LIVE_PROSPECT` once a governed proof batch has succeeded).
13. **Send a small batch** — introduction + one follow-up window.
14. **Monitor Activity, replies, unsubscribes.** Read inbound full bodies inside ODoutreach; do not open Outlook/Gmail to read replies.

---

## 11. Known limitations / future improvements

- **§9 — secret rotation.** The final A+ blocker. Listed here again for completeness.
- **Reporting** can still improve — sequence-step funnels, cohort breakdown by launch approval mode, weekly summary email.
- **Retention policy for stored inbound bodies.** `InboundMailboxMessage.bodyText` is currently unbounded in time. A written policy (e.g. purge after N days, or purge on client offboarding) is recommended before scale.
- **RFC 8058 `mailto:` fallback** on `List-Unsubscribe` for Microsoft Graph sends (Graph sendMail JSON path does not carry `mailto:` cleanly; Gmail raw-MIME already supports it).
- **Full-body fetch Activity event.** Emit an `inbound_full_body_fetched` `AuditLog` on success/failure so the timeline shows "who opened the full body, when".
- **Attachment handling.** Listing and safe download of inbound attachments is not implemented.
- **Automated scheduler (optional).** A deliberate no-op today — can be added later behind a feature flag if scale requires it.
- **RocketReach preview/review** round-trip if credits allow safe operator preview before commit.
- **Automatic suppression sync cron** — currently operator-run only.
- **Microsoft Graph `internetMessageId` fallback fetch** — deferred in PR Q with rationale (`ErrorItemNotFound` is almost always hard-delete, so `$filter` would also fail).

---

## 12. Final grade

| Dimension | Grade |
|---|---|
| Product / live-outreach capability | **A-** |
| Controlled operational readiness | **A** |
| Security posture before secret rotation | **B / exception** |
| Security posture after secret rotation | **A-** |
| Real-prospect readiness after secret rotation **and** §10 checklist | **A-** |

**Honest take on A+:**
A+ is achievable, but only after two things:

1. **§9 secret rotation is completed** (removes the B / exception).
2. **A first controlled real-client campaign proof is run successfully** against a small, scoped audience with full Activity + unsubscribe + reply coverage.

The code, schema and governance are ready. The remaining path to A+ is operational, not engineering.

---

## Changelog

- **2026-04-22** — Initial final handover report. Supersedes the 2026-04-21 C+ audit after PRs #43–#52 closed every P0/P1 gap except §9 (secret rotation).
