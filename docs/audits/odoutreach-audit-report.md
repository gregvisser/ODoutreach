# ODoutreach — Phase 2 Function-by-Function Audit

**Date:** 2026-06-16 · **Scope:** correctness / safety audit of the live subsystems (read-only diagnosis). **Status:** findings for human review — **nothing in this report has been changed**. Each remediation would be a separate, flagged PR per the project's safety rules (anything touching sending, suppression, or ingestion stays behind Greg's sign-off).

Method: six parallel auditors over Send pipeline, Suppression/DNC, Tenant isolation, Reply matching/inbound, Sequences/follow-ups, and Auth/OAuth — each required to cite `file:line`, state actual behavior, and rate confidence (Confirmed / Likely / Possible). The two **High** findings were additionally re-verified by hand.

---

## Executive summary

The codebase is, on the whole, disciplined and safety-conscious. Two product-critical guarantees were specifically validated and **hold**:

- **Suppression / DNC / unsubscribe is append-only and sacrosanct** — enforced before *and* live at send time, tenant-scoped, with sheet re-sync deletes correctly limited to their own `sourceId` (manual/unsubscribe/bounce rows use `sourceId: null` and are untouchable). No runtime path deletes or weakens suppression.
- **Tenant isolation is sound** — no cross-tenant IDOR found; every record-id loader re-scopes by `clientId` or rejects on mismatch; OAuth tokens are AES-256-GCM encrypted and never logged.

The real risks cluster into five cross-cutting themes:

| # | Theme | Worst case |
|---|---|---|
| A | **Idempotency gaps in the governed send path** | Double-send to a real prospect after a crash-then-requeue (Gmail/Graph carry no provider idempotency key) |
| B | **Plan-time vs dispatch-time (TOCTOU)** | 21-day cooldown and the F2 send-stop are not re-checked for in-flight / long-lived rows |
| C | **Two divergent inbound paths** | The legacy ESP-webhook ingest bypasses the F4 internal-mail filter and reply de-dup |
| D | **Reply mis-linking** | A forwarded/CC'd or same-subject reply halts the *wrong* sequence |
| E | **Negative signals under-suppressed** | Spam complainers keep receiving follow-ups |

---

## High

### H1 — Governed (Gmail / Microsoft Graph) sends carry no provider-side idempotency key
- **Confidence:** Confirmed (re-verified by hand)
- **Location:** `src/server/email/outbound/execute-one.ts:421-424` (Gmail), `:512-527` (Graph); contrast the legacy/Resend path `:194-220` which *does* pass `idempotencyKey`.
- **Behavior:** The production senders build the RFC822 message and call the provider with no idempotency token. The deterministic `providerIdempotencyKey` minted at claim time (`queue-processor.ts:55-56`) is never used for these two providers.
- **Risk:** All double-send protection for the real send path reduces to the DB conditional update (`updateMany where status=PROCESSING, providerMessageId=null`). There is no ESP-level dedup backstop.

### H2 — Stale-claim recovery / operator requeue can double-send an already-accepted message
- **Confidence:** Confirmed mechanism; Likely real-world (needs a crash in the accept→write window)
- **Location:** `src/server/email/outbound/operator-recovery.ts:14-30` and `:37-56`; `queue-processor.ts:55-56`; `execute-one.ts` Gmail/Graph sends.
- **Behavior:** `releaseStaleProcessingClaimsForScope` and `operatorRequeueFailedSend` requeue rows where `providerMessageId IS NULL`, nulling `providerIdempotencyKey`; the next claim mints a *new* key per attempt. If a provider accepted the message but the `SENT` write was lost (crash/connection drop), the row sits `PROCESSING`/`providerMessageId=null`, gets requeued, and re-sends — and per H1 there is no provider-side dedup to catch it.
- **Risk:** Recipient receives the email twice. The code comment ("NOT a second send for an already-accepted message") assumes `null provider id ⟺ not accepted`, which the crash window violates.
- **Note:** No *automatic* cron calls the stale-claim release (only a manual operator action), so the common failure mode is a **strand** (row stuck in PROCESSING) rather than an auto-double-send — but manual recovery converts a strand into a potential duplicate.

---

## Medium

### M1 — Worker does not re-check workspace state at send time (PAUSED/ARCHIVED drain; in-flight soft-delete still sends)
- **Confidence:** Confirmed
- **Location:** `queue-processor.ts:34-50` (claim gates on `status='QUEUED'` + `Client.deletedAt IS NULL` only — **no `Client.status` predicate**); `execute-one.ts` never re-reads `Client.deletedAt`/`status`.
- **Behavior:** Pausing or archiving a client does **not** stop its already-QUEUED backlog. The F2 soft-delete claim-time guard protects QUEUED rows but not a row already in PROCESSING when the workspace is deleted (≤10-min window).
- **Risk:** "Pause the client to stop sending" doesn't actually halt the queue; only soft-delete does, and even that misses in-flight rows.

### M2 — 21-day workspace cooldown is enforced at plan time only, not re-checked at dispatch
- **Confidence:** Confirmed (not re-checked); Likely (reachable double-touch via long-lived READY rows)
- **Location:** `send-introduction.ts:600-642` (dispatcher rebuilds the candidate but leaves `recentClientSend` undefined); gate `sequence-send-policy.ts:264-271`.
- **Behavior:** The cooldown skip can only fire in the planner. A row planned `READY`, then dispatched later (esp. the manual "Prepare" → "Send much later" path), is not re-checked against the 21-day window. Suppression/DNC and hard-bounce-via-suppression *are* still re-checked at dispatch; only the cooldown timer is not.
- **Risk:** The "no contact gets >1 outreach email in 21 days workspace-wide" invariant can be violated for stale READY rows.

### M3 — Hard-bounce dispatch protection depends entirely on the `BOUNCE_SUPPRESSION_ENABLED` flag
- **Confidence:** Confirmed
- **Location:** `outbound-provider-events.ts:126-145`; dispatcher omits `recentClientSend` (`send-introduction.ts:600-642`).
- **Behavior:** A hard bounce blocks future sends only via the suppression write that the flag gates. The intended belt-and-braces fallback (`recentClientSend.bounced` in the classifier) is **dead at dispatch** because the dispatcher never populates `recentClientSend`. The flag is ON in prod today, but it's a runtime kill-switch.
- **Risk:** If the flag is ever switched off, hard-bounced addresses have *no* dispatch-time protection — the "never re-send a hard bounce" guarantee is single-threaded through one env var.

### M4 — Destructive admin actions operate on soft-deleted workspaces (F2 undo defeated)
- **Confidence:** Confirmed
- **Location:** `clear-client-replies-action.ts:30-47`; `reset-client-outreach-action.ts:60-122` (resolve client via `findUnique` with no `deletedAt: null`; also skip `requireClientAccess`).
- **Behavior:** Both ADMIN-gated actions can target a soft-deleted client by id and permanently `deleteMany` its replies/outbound/enrollments — defeating F2's "restore is a complete undo." Not a cross-tenant escalation (ADMIN already has global access), but a data-integrity hole in the recovery window.

### M5 — Reply fallback legs (subject-anchored + legacy) can mis-link to the wrong outbound
- **Confidence:** Confirmed behavior; Likely impact
- **Location:** `process-synced-replies.ts:154-171` (subject leg), `:179-193` (legacy leg).
- **Behavior:** Both use `findFirst(orderBy sentAt desc)`. If one contact got the same base subject from the same mailbox across two sends/sequences, the reply links to the newest. The legacy leg (`rfc822MessageId: null`) is looser — it matches any unstamped send to that contact.
- **Risk:** The wrong outbound flips to `REPLIED` and its enrollment `COMPLETED`, silently halting a sequence the prospect didn't reply to.

### M6 — Reply leg-1 (thread-ref) trusts In-Reply-To without checking sender == the contact we emailed
- **Confidence:** Confirmed
- **Location:** `process-synced-replies.ts:130-140`.
- **Behavior:** Leg 1 links on `OutboundEmail.rfc822MessageId == inReplyTo` and rejects only *internal* senders — it does not verify the inbound `fromEmail` equals the matched outbound's `toEmail`. The two fallback legs *do* pin `toEmail = from`; leg 1 does not.
- **Risk:** A forwarded/CC'd external third party on the thread is attributed to the original prospect's contact and halts that sequence (schema comment claims "confident and same-tenant," stronger than the code guarantees).

### M7 — InboundReply ingest idempotency is read-then-write with no unique constraint
- **Confidence:** Confirmed
- **Location:** `process-synced-replies.ts:112-121` + `:199-215`; `schema.prisma:1391-1393` (indexes only, no unique).
- **Behavior:** Dedup is `findFirst({clientId, providerMessageId})` then a non-atomic `create`. Two overlapping syncs (cron + manual) can both pass the check and insert two reply rows. The raw `InboundMailboxMessage` store *is* protected by `@@unique([mailboxIdentityId, providerMessageId])`; only the derived `InboundReply` is exposed.
- **Risk:** Duplicate replies in the Activity list; double-counted `repliesLinked`.

### M8 — Legacy ESP-webhook ingest path bypasses the F4 internal-mail filter and reply de-dup
- **Confidence:** Confirmed (code path); Possible (production exposure)
- **Location:** `src/server/email/inbound/ingest.ts:35-126`; route `src/app/api/inbound/email/[token]/route.ts`.
- **Behavior:** `ingestInboundForClient` never calls `isInternalMail`/`resolveInternalDomainsForClient` and never checks for an existing reply by `providerMessageId`. It links on provider-id or `fromEmail == Contact.email`, flips to `REPLIED`, and stops follow-ups.
- **Risk:** If this webhook is enabled for any client, internal/staff mail can enter the CRM (F4 bypass) and webhook replays create duplicates. Same-tenant guarantee is intact (token-derived `clientId`).

### M9 — Live-prospect send governance hinges entirely on `Client.status === ACTIVE`
- **Confidence:** Confirmed behavior; intent-dependent severity
- **Location:** `client-send-governance.ts:209-245`; `send-introduction.ts:688-776, 858-881`.
- **Behavior:** For sequence sends to real prospects, the gate requires only `status==ACTIVE` (+ an "always ready" unsubscribe check). The stricter `launchApprovedAt` / `LIVE_PROSPECT` gates apply only to `CONTROLLED_PILOT`; the live path sets `skipDomainAllowlist: true`.
- **Risk:** The only thing between a sequence and live cold email to arbitrary prospects is flipping a client to ACTIVE — no second factor / allowlist backstop. Documented as intentional, flagged as a single point of failure.

---

## Low (noted; mostly fail-safe or operational)

- **L1 — Cap overshoot under concurrency.** `sending-policy.ts:201-301` reads-then-inserts reservations at READ COMMITTED; concurrent distinct sends can transiently exceed the daily cap by the number of racers. Idempotency-key uniqueness prevents *duplicate* bookings; bounded in practice. *Confirmed/Likely.*
- **L2 — Spam complaints don't suppress.** `outbound-provider-events.ts:204-216` marks a `complained` event `FAILED` but never writes `SuppressedEmail`. A complainant keeps getting follow-ups (subject only to cooldown). *Confirmed.* (Compliance-relevant — arguably should be Medium for deliverability.)
- **L3 — Non-contiguous follow-up categories create a permanently stuck step.** `sequence-policy.ts` validation doesn't require contiguity; INTRODUCTION + FOLLOW_UP_2 (skipping FOLLOW_UP_1) means FOLLOW_UP_2 never sends, with no config-time error. Fails safe (never sends wrong step). *Confirmed.*
- **L4 — UI eligibility math ignores `delayHours`.** `send-introduction.ts:1311, 1421` compute "earliest eligible" from `delayDays` only; the actual dispatch guard uses both. Display-only; no early send. *Confirmed.*
- **L5 — Public inbound webhook ingests into soft-deleted workspaces.** `api/inbound/email/[token]/route.ts:31-66` resolves the client with no `deletedAt: null`. Same-tenant only; muddies the recovery window. *Confirmed.*
- **L6 — DNC cached-flag domain match misses `www.`-prefixed stored emails.** `do-not-contact-actions.ts:99-100` uses `endsWith "@domain"`. Cosmetic only — the authoritative `evaluateSuppression` domain leg normalizes and still blocks the send. *Confirmed (no leak).*
- **L7 — OAuth callbacks don't re-validate `oauthState` expiry.** `mailbox-oauth/{google,microsoft}/callback` resolve by `state` without checking `oauthStateExpiresAt` (the `start` routes do). `state` is 32 random bytes, single-use; defense-in-depth weakening only. *Confirmed.*
- **L8 — Single-tenant Entra issuer fails open when `profile.tid` is missing.** `entra-tenant.ts:57-64` returns `true`. Entra always sends `tid` for the configured providers; tighten to fail closed. *Possible.*
- **L9 — `decideSupportTicket` approver gate compares email strings, not a capability.** `support/actions.ts:131`. Global (non-tenant) feature; low risk; inconsistent with the `isSuperAdmin` model. *Confirmed.*
- **L10 — `INBOUND_WEBHOOK_SECRET` is optional.** When unset, inbound ingest is gated only by the per-client URL token; setting the header secret in prod is advisable. *Operational note.*

---

## Verified-clean (reassuring, recorded for the trail)

- Suppression append-only + enforced before and at send, tenant-scoped, normalization consistent between writers and the gate; domain-level suppression applied; unsubscribe redemption idempotent and email-scope-only.
- Tenant isolation: no cross-tenant IDOR; record-id loaders (`outbound-detail`, `client-linked-reply-detail`, `inbound-message-detail`, `report-detail`) all re-scope; public token routes collapse failures to generic responses (no tenant enumeration).
- F3 cooldown re-engage: `bypassCooldown` overrides only the cooldown branch, never suppression or a recent bounce — invariant-tested.
- Double-enrollment / duplicate step-sends: protected by DB unique constraints + `skipDuplicates` + upsert-refuses-overwrite.
- Reply-stop-on-reply wired into both ingest paths; UNLINKED replies never surfaced.
- OAuth tokens AES-256-GCM at rest, never logged; account-mismatch verified before token write; Resend webhook uses Svix signatures; internal cron routes bearer-gated and fail closed; dev routes double-gated (env flag + secret).

---

## Suggested prioritization (for human review — not yet actioned)

1. **H1 + H2 (double-send):** pass the deterministic idempotency key to the Gmail/Graph sends, or make requeue-after-possible-accept provably safe (e.g. a provider-side message lookup before re-send). Highest blast radius: real prospects, real duplicates.
2. **M5 + M6 (reply mis-linking):** add a `sender == emailed-contact` guard to leg 1 and tighten the fallback legs' cross-conversation disambiguation. Directly causes wrongly-halted sequences (the original F4 class of bug).
3. **M8 (legacy webhook bypass):** confirm whether the ESP webhook path is enabled in prod; if so, route it through the same F4 internal-mail filter + de-dup as mailbox-sync.
4. **M2 + M3 (dispatch-time re-checks):** re-evaluate cooldown and populate `recentClientSend` at dispatch so the hard-bounce fallback isn't flag-only.
5. **M1 + M4 + L5 (workspace-state consistency):** make the worker honor `Client.status`/`deletedAt` at send time, and add the `deletedAt` guard to the two destructive admin actions and the inbound webhook.
6. **L2 (spam complaints):** suppress on `complained`, like hard bounces.
7. **M7 (reply idempotency):** add a `@@unique([clientId, providerMessageId])` (or `providerMessageId` unique) to `InboundReply`.

Each of the above is a distinct, flag-gated change requiring sign-off before deploy. None has been made.
