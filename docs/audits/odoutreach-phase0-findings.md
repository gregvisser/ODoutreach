# ODoutreach — Phase 0 Findings (read-only diagnosis)

**Status:** Phase 0 complete. **No code changed.** This note is for your review before Phase 1.
**Branch:** none yet (Phase 0 is read-only; I stayed on `main` for reading only and committed nothing).
**Method:** Mapped the real code for each subsystem and each of F1–F6 with read-only explorer agents + direct reads. Where I can't be 100% sure without reproducing against data or reading prod config, I say so and give ranked hypotheses with evidence — per the brief.

A note up front: **several of the brief's assumptions are already implemented or are wrong in detail.** I've corrected them inline (look for **⚠ Brief correction**). The biggest one: signatures are *already* a property of the sending account, not templates; and the F4 leak is **not** "company-name fuzzy matching" — it's whole-mailbox ingestion with no internal filter, plus one under-guarded matcher leg.

---

## 0. Prime-Directive check (what I did and did NOT touch)

- ❌ No send/sequence/mailbox/suppression mutation. ❌ No mailbox disconnect/re-auth. ❌ No deletes. ❌ No deploy. ❌ No schema change.
- ✅ Read-only code mapping + one read-only attempt to read prod env (blocked by network; see F6).
- **Key reassurance for your "messages being sent" worry:** I traced every mailbox-ingestion path. **No ingestion path can trigger an outbound email.** The only state an ingested reply mutates is enrollment status (it *stops* follow-ups). Details in F4 §"Outbound trigger".

---

## 1. Architecture map (verified against code)

| Subsystem | Reality | Key files |
|---|---|---|
| **Workspaces** (multi-tenant) | = `Client` model. `status: ClientLifecycleStatus {ONBOARDING, ACTIVE, PAUSED, ARCHIVED}`. Tenant access via role + membership. | `prisma/schema.prisma:363`; `src/server/tenant/access.ts`; `src/server/queries/clients.ts` |
| **Roles** | `StaffRole {ADMIN, MANAGER, OPERATOR, VIEWER}` on `StaffUser.role`. ADMIN is the highest. **No super-admin/owner exists.** Server guards: `requireStaffAdmin()`, `requireOpensDoorsStaff()`, `requireClientAccess()`. | `prisma/schema.prisma:15`; `src/server/auth/staff.ts:172`; `src/server/tenant/access.ts:49` |
| **Sending accounts / mailboxes** | = `ClientMailboxIdentity` (signature lives here: `senderSignatureText`/`senderSignatureHtml`). OAuth creds in `MailboxIdentitySecret` (onDelete Cascade). | `prisma/schema.prisma:495,564`; `src/lib/mailboxes/sender-signature.ts`; `src/server/mailbox/mailbox-send-composition.ts` |
| **Contacts / CSV** | = `Contact`, imported via PapaParse. Lists `ContactList`/`Member`; warehouse `ContactUniverse`. | `src/server/contacts/import-csv.ts`; `prisma/schema.prisma:672` |
| **Sequences** | `ClientEmailSequence`/`Step`/`Enrollment`/`StepSend`. Launch gate → planning → dispatch → composition. | `launch-readiness.ts`; `step-sends.ts`; `send-introduction.ts`; `sequence-email-composition.ts` |
| **Suppression / DNC / cooldown** | `SuppressedEmail`/`SuppressedDomain`/`SuppressionSource`/`UnsubscribeToken`. Send-time gate `evaluateSuppression`. Cooldown `OUTREACH_COOLDOWN_DAYS = 21`. | `src/server/outreach/suppression-guard.ts`; `src/lib/email-sequences/recent-send-cooldown.ts` |
| **Mailbox sync** | Microsoft Graph + Gmail, **INBOX only**, upserts every msg → `InboundMailboxMessage`, then tries reply-match → `InboundReply`. | `src/server/mailbox/mailbox-inbox-sync.ts`; `src/server/mailbox/process-synced-replies.ts` |
| **Reporting** | Live DB counts (no rollup). | `src/app/(app)/reporting/page.tsx`; `src/server/queries/outreach-metrics.ts` |

---

## F1 — Signatures from the sending account, not templates

**⚠ Brief correction:** Signatures are **already** a property of the sending account. `ClientMailboxIdentity.senderSignatureText` is appended at send time by `appendMailboxSignature()` (`mailbox-send-composition.ts:11`) via `chooseSignatureForSend()`. The composition order is already **body → signature → unsubscribe footer**. The "signatures living in templates" confusion is real but it's a *convention/UX* problem, not the data model.

**Confirmed facts**
- Template default body **seeds** `{{email_signature}}` and `{{unsubscribe_link}}` tokens (`client-email-template-form.tsx:245`). `{{email_signature}}` is treated as **optional** in composition (`sequence-email-composition.ts:218`) because the dispatcher appends the mailbox signature itself. So a template token isn't the source — but staff can still paste literal signatures into template bodies → **double-sign risk + the confusion you describe.**
- **No launch gate requires a signature for sequences.** `launch-readiness.ts` has **zero** signature checks (grep: no matches). The only "no signature → block" guard is on the *internal proof-send* path (`internal-proof-send.ts`, test at `internal-proof-send.test.ts:266`). So the brief's "must have a signature before launch" is **not implemented for real sequences.**
- **Footer is NOT unconditionally appended.** `prepareMailboxSendCompliance()` returns `null` when there's no signature (`mailbox-send-composition.ts:36`) — bailing *before* the footer. And `ensureUnsubscribeLinkInPlainTextBody()` returns the body unchanged when the URL is empty (`ensure-unsubscribe-in-body.ts:18`). So "footer always present" depends on (a) a signature existing and (b) a non-empty unsubscribe URL — which ties into F6.

**Root cause of the reported symptom ("signature added but not on test emails")** — top 2 hypotheses (needs the client's actual mailbox + which test button they used):
1. The signature was saved to a field the chosen send path doesn't read (e.g. a brief-level fallback vs the mailbox's `senderSignatureText`), or `senderSignatureSource` precedence in `chooseSignatureForSend()` preferred an empty synced value. **(most likely)**
2. The "test email" used a path that doesn't append the mailbox signature at all (multiple send paths exist: `internal-proof-send.ts`, `governed-test-send.ts`, `controlled-pilot-send.ts`, sequence dispatch). Need to confirm which one "test send" maps to.

**Phase-1 scope (composition only, no transport change):** single config constant for hard-vs-warn; add the launch gate (name the account, link to where the signature is set); decouple the footer so it's **always** appended even with no signature; strip `{{email_signature}}` from template defaults + a reviewed migration to remove embedded signature blocks (I'll list every template touched). Snapshot before the migration.

---

## F2 — Workspace deletion, super-admin only

**Confirmed facts**
- **No super-admin role today.** Highest is ADMIN. Greg is presumably ADMIN. Brief wants a *role-based* gate → I'll add an explicit super-admin (either a `SUPER_ADMIN` `StaffRole` value or a `StaffUser.isSuperAdmin` flag — I'll recommend one in the Phase-1 plan) and assign it to greg@bidlow.co.uk.
- **`ARCHIVED` already exists but isn't hidden.** `listClientsForStaff()` does **not** filter by status (`src/server/queries/clients.ts`) — archived workspaces still appear and are operable. There is **no `deletedAt`/recovery-window field.** So "soft-delete" today = rename + set ARCHIVED (via `scripts/retire-test-client.ts`) and it stays visible. **(This is itself a latent bug — see Dangerous findings.)**
- **Delete paths are two hard-coded single-client scripts.** `retire-test-client.ts` (rename + ARCHIVE, reversible) and `hard-delete-test-client.ts` (ordered children-first cascade in a transaction, single hard-coded `clientId`, refuses to run on the wrong name/status, aborts if >100k dependent rows). Both are tenant-isolated by construction.
- **Cascade map (for a real purge):** ~20 child tables `onDelete: Cascade` from `Client` — including `SuppressedEmail`/`SuppressedDomain`/`UnsubscribeToken` (so a hard purge **does** wipe *that* client's suppression; acceptable for purging that workspace, but must never reach another). **Watch-outs:** `ContactList.clientId` is `SetNull` → client-scoped lists become *global* residue; `AuditLog.clientId` is `SetNull` → audit survives (good); `MailboxIdentitySecret` cascades via `ClientMailboxIdentity`.
- Audit infra exists (`AuditLog` + `AuditAction {CREATE,UPDATE,DELETE,LOGIN,SYNC,IMPORT}`); example writes in `clients/actions.ts:74`.

**Phase-1 scope:** super-admin role + assignment; add `deletedAt` (+ keep ARCHIVED) and **filter every list query** (fixing the current archived-still-shown gap); typed-workspace-name confirmation; audit each delete/purge; hard purge = separate, second-confirmation, super-admin-only action adapting the hard-delete script's ordered cascade, strictly `clientId`-scoped, with a test proving workspace B is untouched. **Schema change → snapshot + your sign-off (Flag-for-Greg).** Test only on seed workspaces.

---

## F3 — Old CSV won't launch (cooldown) + unhelpful error

**Confirmed facts**
- Cooldown `OUTREACH_COOLDOWN_DAYS = 21` (`recent-send-cooldown.ts:16`), **workspace-wide**, enforced at step-send classification → status `SKIPPED`, reason `skipped_client_outreach_cooldown` (`sequence-send-policy.ts:225-240`).
- **Cooldown is cleanly separable from suppression.** Suppression (`isSuppressed`) is a *different* check (`sequence-send-policy.ts:262-268`) plus a live re-check at dispatch (`send-introduction.ts:784`). ✅ This means a re-engage mode **can** bypass cooldown while keeping unsubscribe/DNC/bounce hard — exactly as the brief requires.
- **The real bug is the zero-eligible UX.** If the operator hasn't clicked "Review recipients" (no step-send plan rows yet), launch-readiness falls back to a **generic** message — "may already be enrolled, suppressed, or missing an email address" (`launch-readiness.ts:363`). The **itemised** breakdown ("X in cooldown, Y unsubscribed…") only exists *after* planning (`send-introduction.ts:1480`). So she sees a vague block, not the reason.
- **Latent correctness gap:** enrollment eligibility checks `isSuppressed` + email but **not** cooldown (`enrollment-policy.ts`). So launch-readiness can **PASS** on `pending > 0`, then dispatch classifies everything `SKIPPED` → 0 sent, near-silently. (Worth fixing alongside.)
- **No existing cooldown override / re-engage capability.**

**Phase-1 scope:** itemised blocked reason at launch (cheap dry-run count of cooldown/suppressed/bounced/missing-email, even before manual "Review"); a **permissioned** re-engage mode that bypasses **only** the cooldown timer; unsubscribe/DNC/bounce remain non-overridable. Test: all-cooldown CSV → itemised message; with re-engage → launches but excludes + reports unsub/DNC/bounce; without permission → cannot bypass.

---

## F4 — Internal emails in the CRM  **(HIGH)**

**⚠ Brief correction:** there is **no subject/company-name fuzzy matcher**. The matcher legs are: (1) thread-ref (In-Reply-To == our stamped Message-ID), (2) subject-anchored **with exact recipient identity**, (3) legacy contact-email **with exact recipient identity**. Legs 2 & 3 require `toEmail == inbound sender`, so they don't catch random internal chatter. The leak comes from **two other places:**

**Root cause A — whole-mailbox raw ingest, surfaced unfiltered.** `mailbox-inbox-sync.ts` pulls INBOX and **upserts every message** into `InboundMailboxMessage` with **zero filtering** (no internal-domain check, no matched-only gate) — storage happens *before* matching. The UI then shows **all** of them: the activity timeline emits an event per row (`client-activity.ts:270`) and the message detail page renders them, tagging anything without `metadata.handling.handledAt` as **"Unhandled"** (`messages/[messageId]/page.tsx:90`). → The 2nd screenshot (internal `lucysg→sarah-jane`, "Re: DNC's for OpensDoors") is an *unmatched* message that was stored and surfaced anyway.

**Root cause B — matcher leg 1 lacks a sender check.** `process-synced-replies.ts:101-110` matches purely on `clientId + rfc822MessageId == In-Reply-To`. It does **not** verify the inbound sender is the contact, and there's **no internal-domain exclusion** anywhere. So an internal reply/forward that sits on the original outreach thread (carrying our outbound's Message-ID) links to the prospect's contact, flips the outbound to `REPLIED`, and **stops the prospect's follow-ups**. → The 1st screenshot (internal `lucysg→james`, "Re: OpensDoors Prospect – Services Depot Ltd", shown as a linked Reply) fits this.

**No internal-domain data exists.** Neither `Client` nor `ClientMailboxIdentity` stores the client's own domain(s). We can derive it from mailbox-identity emails, but a real fix likely needs a `Client.internalDomains` field (schema change → Flag-for-Greg).

**Outbound trigger? — NO (this is the important one).** `stopFollowUpsForLinkedReply()` (`stop-follow-ups-on-reply.ts`) only flips enrollments that are `PENDING`/`PAUSED` → `COMPLETED` (+ `completedAt`). It **never sends, resumes, re-queues, or releases** anything. No mailbox-ingestion path initiates an outbound. **Confidence: very high.** So a mis-ingested internal email can *silently stop* a real prospect's sequence (a missed-outreach harm), but it cannot *cause a send*.

**Historical contamination (to LIST, not fix):** a mis-match writes `InboundReply` (fromEmail = internal), `OutboundEmail.status = REPLIED`, `ClientEmailSequenceEnrollment.status = COMPLETED`. A review query: `InboundReply` rows where `fromEmail`'s domain is a client-internal/mailbox-owner domain (or sender == a staff/mailbox address), join the linked outbound + enrollment. **Do NOT auto-un-complete** — leave for human review (un-stopping could lead to resumed sends if later reactivated).

**Phase-1 scope (filtering only, behind a flag):** internal-domain exclusion (drop where both ends internal); tighten matcher (leg 1 must also confirm sender == contact, else don't link); stop surfacing unmatched/internal as conversations. Do **not** touch the send path or disconnect any mailbox. Deliver the historical-contamination list for your review.

---

## F5 — Make Reports interactive

**Confirmed facts**
- Today only the **client name** links (`reporting/page.tsx:251`). Headline cards (`HeadlineMetric`) and metric cells (`MetricItem`) are static.
- Destination routes exist for most metrics, each already enforcing isolation (`getAccessibleClientIds` / `loadClientWorkspaceBundle`):
  - Client name → `/reporting?client=<id>` (done) • Replies → `/clients/<id>/activity` • Sent/Bounces/Failed/Queued/Not-reached → `/operations/outbound?client=<id>` (admin-only) and per-client activity • Opt-outs → `/suppression?client=<id>` • Contacts → `/clients/<id>/contacts` (or `/universe`).
- **Gaps (no detail route):** "Send-proof-missing" and "Opens" — either build a minimal view or leave them non-linked.
- Several destinations are **admin-only** (`/operations/outbound`, `/activity`, `/contacts`) → link conditionally on role so a VIEWER doesn't hit a redirect.

**Phase-1 scope:** wire each cell/row to the correct filtered route, role-aware; preserve the active date range in the query string; tests that each link lands on the right client/filter and respects isolation. Pure UI/routing — lowest risk of the six.

---

## F6 — Unsubscribe link doesn't work  **(HIGH, compliance)**

**The back half of the chain is solid.** `performUnsubscribe()` (`unsubscribe-service.ts:181`) upserts `SuppressedEmail` (sourceId null → survives sheet syncs), sets `usedAt`, flips `Contact.isSuppressed`, writes audit — transactional + idempotent. The page is scanner-safe (GET = confirm, POST = act) and supports RFC 8058 one-click. Tokens are 256-bit, SHA-256-hashed at rest. So the bug is **upstream (link generation / config)**, not redemption.

**Root cause — ranked hypotheses (needs prod env + a real-token repro to pin):**
1. **Public base URL** *(most likely)*. The whole link hinges on `resolvePublicBaseUrl()` = first valid of `AUTH_URL` → `INTERNAL_APP_URL` → `NEXT_PUBLIC_APP_URL` (`one-click-readiness.ts:20`). If **none** is set in the send runtime → it silently emits a **`mailto:` unsubscribe** (not a clickable web link). If set to a **stale/non-public host** (e.g. the `*.azurewebsites.net` default, an old domain, or `http`) → the hosted link is **dead**. The dispatcher branch is `send-introduction.ts:913-923`. **I could not read the prod values — Azure's management endpoint refused all connections this session.** → **This is the #1 thing to confirm** (see below).
2. **Token not persisted on the path that sent that email.** Sequence dispatch *mints* the token (`send-introduction.ts:917`) and must `issueUnsubscribeToken()` it after send; if a particular send path builds the URL but doesn't persist the hash, the link resolves to the generic "invalid or expired" page. Needs per-path confirmation.
3. **Two-step UX.** The in-body link lands on a **"Confirm unsubscribe"** page (by design, to defeat scanners). A recipient expecting instant unsubscribe may think it "didn't work" if they don't click Confirm. (Works-but-confusing.)

The 1st screenshot shows a rendered "Unsubscribe" hyperlink (not raw mailto text), which **points away from H1's mailto branch and toward H1-stale-host or H2.**

**Secondary gap:** `performUnsubscribe` does **not** mark active enrollments `COMPLETED`. Suppression blocks every future send at dispatch (so no emails go out — compliance is met), but the brief's "stops their active sequences" is only satisfied *implicitly*. Recommend also completing enrollments on unsubscribe.

**How to confirm (you or me, read-only):**
```
az webapp config appsettings list -g rg-opensdoors-outreach-prod -n app-opensdoors-outreach-prod \
  --query "[?name=='AUTH_URL' || name=='NEXT_PUBLIC_APP_URL' || name=='INTERNAL_APP_URL'].{name:name,value:value}" -o json
```
Expected-good: `AUTH_URL = https://opensdoors.bidlow.co.uk`. If it's the azurewebsites default, empty, or `http`, that's the bug.

**Phase-1 scope:** confirm/repair the base-URL config (**env/config change in prod = Flag-for-Greg**); guarantee token persistence on every send path; optionally complete enrollments on unsubscribe; optionally make the in-body link clearer. Verify end-to-end on the real HTTPS domain. **Suppression stays append-only.**

---

## Out-of-scope but dangerous (found while reading)

1. **Archived workspaces aren't hidden** — `listClientsForStaff` ignores status, so today "archiving" doesn't remove a workspace from any UI. (Folds into F2.)
2. **Launch can pass then dispatch zero** — cooldown isn't checked at enrollment, so a sequence can look launch-ready yet send nothing. (Folds into F3.)
3. **Existing F4 contamination in live data** — some replies/enrollments are already mis-attributed/stopped. Needs the review list; do not auto-repair.
4. **Unsubscribe base-URL misconfig (F6) affects every outgoing link** — a standing compliance exposure until confirmed.

---

## Flag for Greg — do NOT auto-fix (human sign-off)

- **Any prod env/config change** for the unsubscribe base URL (F6).
- **The F4 historical-contamination list** — mis-linked internal "replies" + wrongly-`COMPLETED` enrollments. Review by a human; auto-un-stopping is forbidden (could lead to resumed sends).
- **Every schema migration** (F1 template-signature strip, F2 soft-delete + super-admin, F3 re-engage flag, F4 `internalDomains`) — DB snapshot + your sign-off before any prod apply; migrations are not auto-applied here anyway.
- **Nothing** in the planned fixes touches send transport, mailbox connections, or suppression deletion — by design.

## Still to confirm before/within Phase 1
- Prod values of `AUTH_URL` / `NEXT_PUBLIC_APP_URL` / `INTERNAL_APP_URL` (network blocked my read this session).
- Which "test email" button the F1 client used, and `chooseSignatureForSend()` precedence.
- Reproduce F3 (all-cooldown CSV) and F6 (fresh token, end-to-end) against seed/staging data.
- Confirm `issueUnsubscribeToken` persistence on each send path.

---

### Suggested Phase-1 order (most compliance/impact first)
**F6 → F4 → F3 → F1 → F2 → F5.** F6 and F4 are the compliance/privacy ones; F6 may be a one-line config confirmation. One branch + PR per fix, each behind a flag where it touches sending/suppression/ingestion, stopping after each for your acceptance check.

**Awaiting your review before any Phase 1 change.**
