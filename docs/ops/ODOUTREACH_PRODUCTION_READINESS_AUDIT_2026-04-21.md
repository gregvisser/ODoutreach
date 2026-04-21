# ODoutreach Production Readiness Audit — 2026-04-21

> Owner: Greg + OpensDoors operators
> Auditor: Cursor agent (read-only pass)
> Branch: `docs/production-readiness-audit-2026-04-21`
> Baseline SHA: `2fad6fc` (main, after D4e.3 / PR #41)
> Proof host: `https://app-opensdoors-outreach-prod.azurewebsites.net`
> Mode: Audit-only — no code, schema, migrations, sends, imports, syncs, app settings, or secret rotations.

---

## 1. Overall grade

| Dimension | Grade |
|---|---|
| **Overall production-readiness** | **C+** — feature-complete for a controlled OpensDoors-internal pilot; not yet ready for real prospect sending without a short finishing sprint. |
| Controlled / internal-send readiness | **B** — safe today against allowlisted internal domains with operator discipline. |
| Real prospect-send readiness | **D** — several P1 governance and compliance gaps must close first. |
| Handover readiness (can OpensDoors safely use it tomorrow?) | **C** — yes, for internal proofs and brief/workspace onboarding; **no** for real prospect sending. |

The A–Z feature build is genuinely complete and the send path is unusually well-guarded (typed confirmation, allowlist, idempotent ledger, live suppression re-check, hard cap, no cron). The blockers to move from C+ to B/A are governance, compliance and secret hygiene, not code correctness.

---

## 2. Executive summary

ODoutreach has, as of `2fad6fc`, a coherent client workspace (Overview · Brief · Mailboxes · Sources · Contacts · Suppression · Outreach · Activity), approved templates, approved sequences, records-only enrollments, a send-preparation planner, an operator-triggered introduction send, operator-triggered follow-up sends, a unified activity timeline, and strong tenant isolation.

Five findings matter most:

1. **`/clients/new` does not match Greg's workspace onboarding model.** It still asks for suppression sheet IDs + sender name + daily cap, then marks onboarding complete on create, overshooting the intended "minimum shell + land in workspace" flow. (**P1**)
2. **Exposed secret rotation is still deferred.** The system is safe internally, but no client handover should happen with known-exposed credentials still live. (**P0**)
3. **`GOVERNED_TEST_EMAIL_DOMAINS` has a silent default (`bidlow.co.uk`)** when the env var is unset. Safe today because Greg's team owns `bidlow.co.uk`, but the fallback is undocumented and not in `.env.example`. (**P1**)
4. **Unsubscribe is a `mailto:…?subject=unsubscribe`** — no one-click, no tracked opt-out, no automatic suppression of unsubscribe replies. Acceptable for the current volume (≤150/day), but must harden before any recognisable real prospect campaign. (**P1**)
5. **Brief fields are thin.** Only ~8 of the ~23 fields on Greg's target brief are captured, all as freeform text. No attachments (accreditations, customer agreement). No reusable sector/role dropdowns. No ops sign-off. Operators will still need off-system documents for any real client. (**P1/P2** depending on OpensDoors tolerance)

Everything else is P2/P3 polish or already well-handled.

---

## 3. Production baseline (as observed)

- Main SHA: `2fad6fc` — `feat(outreach): send sequence follow-ups to allowlisted recipients (D4e.3)`.
- Health: `GET /api/health` is DB-backed (`SELECT 1`) and returns `{ ok: true, service: "opensdoors-outreach", checks: { database: "ok" } }`.
- Deploy: GitHub Actions OIDC → `azure/webapps-deploy@v3` to `app-opensdoors-outreach-prod` in `rg-opensdoors-outreach-prod`. Runs on every push to `main`. Validates Prisma and builds; does NOT run `lint` or `test` in the deploy workflow (CI does, and branch protection enforces PR-first merges).
- Migrations: forward-only, **manual** via the PowerShell ARM / TLS 1.2 method. `db:migrate` is not invoked by the deploy workflow.
- 19 migrations applied. Most recent: `20260421120000_sequence_step_send_records`.
- Capabilities confirmed deployed: workspace IA, ContactLists + named lists, CSV preview/confirm, nullable-email contacts, templates (DRAFT → READY_FOR_REVIEW → APPROVED), sequences (same lifecycle), records-only enrollments, launch readiness rail, send preparation records, introduction send (allowlisted), follow-up sends (allowlisted), unified Activity timeline.

---

## 4. Workspace onboarding verdict — the question Greg asked

> "When adding a new client, the system should follow the workspace model. A new client should be created as a client workspace and then onboarded through Brief → Mailboxes → Sources → Email lists → Suppression → Templates → Sequences → Outreach readiness → Activity."

**Short answer: YES, the system should follow that model — and the workspace SHELL already does, but `/clients/new` does not.**

### Current behaviour

`src/app/(app)/clients/new/page.tsx` + `onboarding-form.tsx` + `createClientFromOnboarding` currently:

1. Walks the operator through 4 inline tabs: *Client profile · Suppression sources · Outreach setup · Review*.
2. Collects: `name`, `slug`, `industry`, `website`, `notes`, `emailSheetId`, `domainSheetId`, `senderName`, `dailyCap`.
3. Creates the `Client` with `status = ONBOARDING`, then immediately flips it to `ACTIVE` inside the same action.
4. Creates a `ClientOnboarding` with `currentStep: 4, completedSteps: [1,2,3,4], completedAt: new Date()` — i.e. declares onboarding complete at creation.
5. Creates a `ClientMembership` (`LEAD` role) for the creating staff.
6. Creates up to two `SuppressionSource` rows from the two sheet IDs.
7. Redirects to `/clients/${id}` (the workspace overview).

### Gap versus the target model

| Expectation | Reality |
|---|---|
| Minimum-viable shell (name, slug, maybe industry/website) | Collects 9+ fields mixing suppression, sender name, daily cap |
| Land on workspace overview | ✅ Yes (`/clients/${id}`) |
| Workspace shows onboarding checklist | ✅ Yes (`buildClientWorkflowSteps` renders Brief / Mailboxes / Sources / Suppression / Contacts / Outreach / Activity with statuses) |
| Each module owns one job | ✅ Subnav and page structure match (`/clients/[id]/{brief, mailboxes, sources, contacts, suppression, outreach, activity}`) |
| Onboarding state accurately reflects progress | ❌ `completedSteps: [1,2,3,4]` on creation is a lie — operator has done nothing yet |
| Client status lifecycle | ❌ `ONBOARDING → ACTIVE` flip in same action means `status` is useless as a signal |
| Sender name / daily cap captured on brief, not on /new | ❌ Still asked on /new as legacy "outreach defaults" |
| Suppression sheet IDs captured in Suppression module | ❌ Still asked on /new as part of shell creation |

### Verdict

- **Workspace model alignment (post-create, inside `/clients/[id]`): A–** — the subnav, the workflow-step cards, the launch-readiness rail, and the per-module pages all reflect Greg's target model.
- **New-client onboarding flow (`/clients/new`): C** — it works, it doesn't break anything, but it mixes shell creation with partial suppression/outreach config and then declares onboarding done. A non-technical operator will mistake the green "ACTIVE · onboarding complete" state for real readiness.
- **Operator clarity: B–** — after creation, the overview is clear. Before creation, the form is misleading.
- **Production readiness for onboarding real clients: C+** — usable with operator guardrails, but a first-time operator will need training to ignore the faked onboarding-complete state.

### Recommended behaviour

1. `/clients/new` collects only: `name`, `slug` (auto-suggested), optional `industry`, optional `website`, optional `accountManagerStaffUserId`.
2. `createClientFromOnboarding` creates the Client with `status = ONBOARDING`, creates the membership, creates an empty `ClientOnboarding` row with `completedSteps: []`, and redirects to `/clients/${id}`.
3. `/clients/[id]` (overview) shows a clear "Getting started" card at the top listing: Brief · Mailboxes · Sources · Suppression · Contacts · Templates · Sequences · Readiness.
4. `status` transitions to `ACTIVE` only when launch readiness passes at least the hard gates (brief ready + at least one connected sending mailbox + at least one template approved), or on explicit operator sign-off.
5. Suppression sheet IDs, sender name, daily cap, and sender signature are captured inside their own modules only.

### Required PR

**PR I (proposed) — "Minimum-viable new-client shell"**. Docs-aware, schema-safe, additive. Scope:

- Rewrite `src/app/(app)/clients/new/onboarding-form.tsx` to a single form with `name` + `slug` + optional `industry/website`.
- Update `createClientFromOnboarding` to drop suppression/sender/daily-cap handling and record `completedSteps: []`.
- Keep the `status = ONBOARDING` value (do NOT flip to `ACTIVE` on create).
- Add a new "Getting started" card on `/clients/[id]` when `completedSteps` is empty.
- Add a separate "Approve launch" button (operator-only) that flips `status = ACTIVE` once readiness passes.
- No migrations. No sends. No imports.

**Severity: P1** (must fix before real prospect sending; optional for internal handover if Greg trains operators around the quirk).

---

## 5. Module grades

| Module | Grade | Status | Blockers | Recommended fix |
|---|---|---|---|---|
| New client creation (`/clients/new`) | C | Works but mixes shell + partial config, fakes onboarding-complete | Legacy suppression/sender/cap inputs; status flipped on create | PR I above |
| Client overview / workspace (`/clients/[id]`) | A– | Subnav, workflow steps, launch readiness rail, operational snapshot all correct | — | Minor: hide "Getting started" once readiness is green |
| Brief (`/brief`) | C+ | Freeform brief form stores ~8 structured fields in `ClientOnboarding.formData` JSON | No attachments; no sector/role dropdowns; no ops sign-off; many target fields missing | PR J — structured brief (attachments + dropdowns + sign-off) |
| Mailboxes (`/mailboxes`) | A– | Microsoft + Google OAuth connect, 5-mailbox cap, 30/day cap, connection audit | OAuth client secrets live in env — rotate before handover | Keep as-is; rotate secrets |
| Sources / imports (`/sources`) | B | CSV preview + confirm is honest; RocketReach direct import still writes without preview | RocketReach preview is deferred | PR K — RocketReach preview parity |
| Email lists / contacts (`/contacts`) | B | Per-client contacts with ContactLists (clientId nullable); nullable-email contacts rendered with badges | Contacts not yet universal — still `Contact.clientId NOT NULL` | Continue the universal-contacts plan (docs/ops/UNIVERSAL_CONTACTS_AND_LISTS_PLAN.md) post-handover |
| Suppression (`/suppression`) | B– | Per-client SuppressionSource rows with spreadsheet IDs; guard `evaluateSuppression` checked at preview + enrollment + dispatch | No actual Sheets → DB sync runs; `syncStatus` sits at `NOT_CONFIGURED` by default | PR L — suppression Sheets sync job + sync event writes |
| Templates | A– | DRAFT → READY_FOR_REVIEW → APPROVED lifecycle, placeholder validator, 8 recipient + 5 sender placeholders | — | None |
| Sequences | A– | Same lifecycle as templates; one sequence → one list; steps per `ClientEmailTemplateCategory` | — | None |
| Enrollments | A– | Records-only, contact-list-scoped, respects suppression at enroll time | — | None |
| Launch readiness | B+ | `buildLaunchReadinessRows` + `TonightLaunchChecklist` cover brief / mailboxes / contacts / outreach / suppression / ledger | Doesn't currently block the green-light on unsubscribe compliance or secret rotation | Add rows for unsubscribe policy + secret rotation acknowledgement |
| Sending | B– for controlled; D for real prospects | Typed confirmation per step, allowlist-gated, hard cap 10, idempotent ledger reservations, live suppression re-check, no cron | For real prospects: silent allowlist fallback, `mailto:` unsubscribe, no reply-to-unsubscribe processor | See §7 below |
| Activity (`/activity`) | B+ | Unified timeline from OutboundEmail, InboundReply, InboundMailboxMessage, ContactImportBatch, ContactList, templates, sequences, enrollments, step sends, audit log | `AuditLog` writes are thin — only 4 files produce audit rows | PR M — audit-log everywhere that mutates client state |
| Auth / staff access | A | Entra SSO, `gateStaffAccess`, `requireOpensDoorsStaff`, `requireClientAccess`, `getAccessibleClientIds`, membership + role checks, server actions all re-verify, tenant isolation on every Prisma call that touches client-scoped tables | Domain allowlist `STAFF_EMAIL_DOMAINS` is optional — set it in prod or operators without a @bidlow/@opensdoors address can in theory access | Require `STAFF_EMAIL_DOMAINS` in prod; refuse to start otherwise |
| Deployment / migrations | B– | CI runs validate + lint + test + build; deploy runs validate + build only | Migrations are manual; no "deployed SHA" endpoint | PR N — automate `prisma migrate deploy` in deploy workflow (behind a flag); add `/api/version` endpoint |
| Security / secrets | D | Env-var secrets, encrypted mailbox refresh tokens (good), OAuth callback path auditable | **Exposed secrets not yet rotated** (per task baseline); silent `GOVERNED_TEST_EMAIL_DOMAINS` default; `.env.example` missing the var | Rotate first, then PR O — document GOVERNED_TEST_EMAIL_DOMAINS + require explicit value in prod |

---

## 6. P0 / P1 / P2 / P3 issue list

### P0 — must fix before handover

- **P0-A. Rotate all known-exposed secrets** before handing the system to anyone outside Greg's personal control: `AUTH_SECRET`, `MAILBOX_OAUTH_SECRET`, Entra client secret (staff SSO), Mailbox-Microsoft OAuth client secret, Mailbox-Google OAuth client secret, Google Workspace service account JSON, `ROCKETREACH_API_KEY`, `PROCESS_QUEUE_SECRET`, `RESEND_WEBHOOK_SECRET`, `INBOUND_WEBHOOK_SECRET`, and any dev-only `*_SECRET` values that are set in prod. Keep an owner + rotation-date checklist.
- **P0-B. Set `STAFF_EMAIL_DOMAINS` explicitly in production Application Settings** to an allowlist of real OpensDoors domains and verify the gate rejects a personal-Microsoft account. Current fallback silently admits any authenticated tenant member.
- **P0-C. Set `GOVERNED_TEST_EMAIL_DOMAINS` explicitly in production Application Settings** — do not rely on the code default (`bidlow.co.uk`). Confirm the value in App Service matches the intended internal allowlist.

### P1 — must fix before real prospect sending

- **P1-A. `/clients/new` rewrite** — minimum-viable shell + "Getting started" onboarding inside the workspace. See §4.
- **P1-B. Structured brief fields** — attachments (accreditations, customer agreement), sector / job-role / target-geography reusable dropdowns, assigned account manager, monthly revenue, ops sign-off with user + timestamp. (`src/lib/opensdoors-brief.ts` today stores ~8 fields, all freeform.)
- **P1-C. Unsubscribe compliance** — replace `mailto:?subject=unsubscribe` with:
  - a one-click unsubscribe page scoped by token,
  - `List-Unsubscribe` + `List-Unsubscribe-Post: List-Unsubscribe=One-Click` MIME headers,
  - automatic `SuppressedEmail` write on unsubscribe click or reply,
  - timeline event on unsubscribe.
- **P1-D. Reply-to-unsubscribe processor** — scan `InboundMailboxMessage` / `InboundReply` subjects and bodies for unsubscribe intent and emit a suppression candidate for operator confirmation.
- **P1-E. Silent allowlist default** — change `allowedGovernedTestEmailDomains()` to return `[]` when the env var is unset and require explicit configuration; today it defaults to `bidlow.co.uk`.
- **P1-F. `.env.example` hygiene** — add `GOVERNED_TEST_EMAIL_DOMAINS`, `CONTROLLED_PILOT_HARD_MAX_RECIPIENTS` (if it becomes envable), and a "sender reputation" section with documented defaults.
- **P1-G. Launch-readiness rail must include unsubscribe + secret-rotation gates** before it is allowed to go green for a real client.

### P2 — should fix soon

- **P2-A. Migrations in the deploy pipeline** — add a gated `prisma migrate deploy` step after `azure login` with an explicit operator approval in the Azure portal before the step runs, or behind a workflow input. Keeps migration cadence observable.
- **P2-B. `/api/version` endpoint** — return `{ sha, builtAt, node }` so operators can verify what is live without reading GitHub.
- **P2-C. Audit log coverage** — write `AuditLog` rows on: template approve/archive, sequence approve/archive, enrollment create/exclude, contact import confirm, contact list create, suppression source create. Currently only 4 files write audit rows.
- **P2-D. Suppression Sheets sync** — today `SuppressionSource.syncStatus = NOT_CONFIGURED` and no actual sync runs. Operators paste sheet IDs, and the guard still honours stored `SuppressedEmail` rows, but there is no pipeline that pulls fresh values. Implement a one-click "Sync now" action that writes to `SuppressedEmail`/`SuppressedDomain` and emits an `AuditLog`.
- **P2-E. RocketReach preview parity** — match the CSV Preview → Confirm model so enrichments cannot write until operator confirms.
- **P2-F. `Contact.clientId` universalisation** — continue the plan in `docs/ops/UNIVERSAL_CONTACTS_AND_LISTS_PLAN.md`. Not a blocker today but the current "bridge phase" is confusing to operators who expect the list to be the reusable unit.
- **P2-G. Client status lifecycle** — stop flipping `ONBOARDING → ACTIVE` on create. Require explicit "Approve launch".

### P3 — polish / deferred

- **P3-A. Workspace subnav should call the Contacts tab "Email lists"** to match the product taxonomy Greg stated. The page already surfaces lists; the label lags.
- **P3-B. React hydration warning on `/activity`** — pre-existing, not introduced by D4e.3, but should be tracked.
- **P3-C. E2E / Playwright coverage** — add happy-path tests: staff login → create client → complete brief → connect mailbox → approve template → approve sequence → prepare records → introduction send against the allowlist.
- **P3-D. `/api/health` observability** — extend with migration-drift check (number of pending migrations > 0 → warning) and mailbox OAuth connection count.
- **P3-E. `sender_email` + `sender_name` currently derive from `Client.name` / `defaultSenderEmail`** — document clearly in UI so operators don't wonder why those placeholders are already filled in.
- **P3-F. Remove the `NOT_CONFIGURED` `SuppressionSyncStatus` dead state** once Sheets sync (P2-D) ships.

---

## 7. Real prospect sending readiness

**Can the system send email right now?** Yes, but only to recipients whose domain is in `GOVERNED_TEST_EMAIL_DOMAINS` (default `bidlow.co.uk` if unset), only via `SEND INTRODUCTION` / `SEND FOLLOW UP N` typed confirmation, only from an APPROVED sequence step whose template is APPROVED, only through the ledgered mailbox pool, capped at 10 recipients per action, and re-validated at dispatch time.

**What is safe today:**

- Tenant isolation. Every server action re-verifies `requireClientAccess(staff, clientId)`.
- Ledger. Daily mailbox cap is enforced by Postgres rows (`MailboxSendReservation`), not by in-memory counters. Idempotency keys prevent double-sends.
- No cron. No background worker. The operator must physically press a button for each step and type its exact confirmation phrase.
- Live suppression re-check. A contact suppressed after planning cannot send.
- Hard cap. `CONTROLLED_PILOT_HARD_MAX_RECIPIENTS = 10` is applied before dispatch.
- Approval gates. DRAFT templates and non-APPROVED sequences cannot send.

**What is NOT safe for real prospect sending (P1 must-fix):**

1. Unsubscribe is a `mailto:` only — no one-click, no tracked opt-out, no automatic suppression.
2. Allowlist fallback to `bidlow.co.uk` is silent and undocumented.
3. Brief lacks ops sign-off; there is no formal "approved by" audit trail on a per-client basis.
4. No reply-to-unsubscribe processor — human operators must read the inbox.
5. Known-exposed secrets are still live in prod.

**Sign-off required before flipping any client to real-prospect sending:**

- [ ] P0-A / P0-B / P0-C completed and verified.
- [ ] P1-C (unsubscribe compliance) landed and proved.
- [ ] P1-D (reply-to-unsubscribe processor) landed.
- [ ] P1-E (allowlist default hardened).
- [ ] P1-G (readiness rail includes unsubscribe + rotation gates).
- [ ] Senior OpensDoors signature in the brief's ops-sign-off field for the target client.
- [ ] Internal rehearsal: send a full intro + 2 follow-ups to an allowlisted internal address, confirm unsubscribe path works end-to-end.

---

## 8. Recommended new-client onboarding flow (the ideal)

Numbered so it can be a UI checklist.

1. **Create minimal client shell** — operator submits `name` + `slug`. `status = ONBOARDING`, `completedSteps = []`, `ClientMembership` created for the operator.
2. **Land on workspace overview** — `/clients/[id]` with a prominent "Getting started" card containing ordered links to every onboarding module.
3. **Complete brief** — `/brief` walks the operator through the structured brief fields (P1-B). Includes attachments for accreditations and the customer agreement, sector/role dropdowns, ops sign-off.
4. **Connect mailboxes** — `/mailboxes` OAuth-connect 1..5 Microsoft / Google sending identities. System enforces 30/day per mailbox.
5. **Configure suppression** — `/suppression` paste email + domain suppression Sheet IDs, trigger first sync, confirm rows appear in `SuppressedEmail` / `SuppressedDomain`.
6. **Import / preview contacts into a named list** — `/sources` → CSV Preview → review counts (valid, email-sendable, valid-no-email, missing identifier, suppressed, duplicates) → Confirm → contacts attached to a new or existing `ContactList`.
7. **Approve templates** — `/outreach` create templates per category, validate placeholders, transition DRAFT → READY_FOR_REVIEW → APPROVED.
8. **Build sequence** — one sequence per target audience, with INTRODUCTION + 0..5 FOLLOW_UPs, each pointing at an APPROVED template and a configured `delayDays`. Transition sequence to APPROVED.
9. **Enroll contacts** — `/outreach` enroll the list into the sequence. Records-only. Excluded-at-enroll captured with reason.
10. **Check launch readiness** — `/clients/[id]` launch rail must show all green: brief ready, mailboxes connected, templates approved, sequence approved, list eligible, suppression fresh, unsubscribe policy acknowledged, ledger capacity available.
11. **Controlled send** — `/outreach` Send preparation prepares records; operator types `SEND INTRODUCTION`; up to 10 recipients queued; follow-ups advanced manually per category after `delayDays`.
12. **Activity monitoring** — `/activity` timeline shows every event; operator reviews sends, replies, bounces, errors, suppression hits.

---

## 9. Recommended next PR sequence (post-handover)

Ordered by dependency + risk. Each is small, reviewable, deployable, and provable in isolation. No single PR rotates secrets or changes prod settings.

1. **PR I — Minimum-viable new-client shell** (P1-A). Docs + UI + action edit. No schema.
2. **PR J — Structured brief** (P1-B). New JSON shape in `ClientOnboarding.formData` + attachment storage decision (Azure Blob with signed URLs is the simplest). May need one migration to add a `ClientBriefAttachment` table.
3. **PR K — Hard-default allowlist + `.env.example` hygiene** (P1-E, P1-F). Pure code + docs.
4. **PR L — One-click unsubscribe + compliance headers + suppression on unsubscribe** (P1-C). Adds an `UnsubscribeToken` model. Emits timeline events. Includes server-action rate-limit.
5. **PR M — Reply-to-unsubscribe processor** (P1-D). Parses `InboundReply` / `InboundMailboxMessage` for opt-out intent; surfaces operator "Confirm suppression" action.
6. **Secret rotation** (P0-A/B/C) — done by Greg/OpensDoors admin in the Azure portal following a rotation runbook. Not a code PR but a must-do between PR K and PR L.
7. **PR N — RocketReach preview parity** (P2-E).
8. **PR O — Suppression Sheets sync job + audit events** (P2-D, part of P2-C).
9. **PR P — Audit log coverage** (P2-C).
10. **PR Q — Migrate-on-deploy + `/api/version` endpoint + health extras** (P2-A, P2-B, P3-D).
11. **PR R — Client status lifecycle + readiness-green gate** (P2-G, P1-G).
12. **PR S — E2E suite** (P3-C).
13. **PR T — Universalise contacts** (P2-F) per existing `UNIVERSAL_CONTACTS_AND_LISTS_PLAN.md`.

---

## 10. Final decision

> **Not ready for real prospect sending.**
> **Ready for controlled internal handover** to OpensDoors operators for workspace onboarding and internal allowlisted proofs, **conditional on completing P0-A/B/C (secret rotation + explicit `STAFF_EMAIL_DOMAINS` + explicit `GOVERNED_TEST_EMAIL_DOMAINS`)**.

Once P0 completes, the A-Z build can serve as the OpensDoors internal console tomorrow: create clients, fill briefs, connect mailboxes, import contacts, configure suppression, build templates and sequences, and run small allowlisted introduction + follow-up proofs against internal addresses. The P1 block is exactly about the jump from "allowlisted internal proof" to "real cold outreach to UK prospects" — that jump requires the unsubscribe + ops-sign-off + brief-attachments + allowlist-hardening work before a first real send.
