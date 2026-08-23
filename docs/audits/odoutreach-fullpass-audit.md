# ODoutreach — Full-Pass Audit + Change Plan

**Date:** 2026-06-18 · **Branch:** `audit/full-pass` · **Scope:** every tab/feature, read-only.
**Status:** Phase 1 (audit) complete + Phase 2 (plan for your 3 requested changes). **Nothing has been changed.** Awaiting your approval before any execution.

## How to read this (plain English)
I walked the whole app tab by tab (8 read-only reviewers reading the actual code — pages, components, and the server functions behind them). Every finding has a **severity**, a **location** (`file:line`), the **impact on a real user**, and a **proposed fix**. Severity = how much it hurts / how risky:
- **Critical** = broken for real users right now, or a data/safety risk.
- **High** = wrong behaviour or a trust/leak risk most users will hit.
- **Medium** = confusing, half-wired, or inconsistent; works but rough.
- **Low** = cosmetic, dead code, or a latent maintenance risk.

Totals: **1 Critical · 9 High · ~21 Medium · ~28 Low.** Most of the app works end-to-end; the issues cluster into a few repeating patterns (below).

---

## Cross-cutting themes (the same root causes repeat)
1. **Numbers that don't agree between screens.** Several "counts" are computed one way on a summary card and another way in the panel below it (Reports "Delivered", Activity "Replies", Sources preview-vs-result, Do-not-contact per-source counts). At low volume they match; at scale they diverge and erode trust.
2. **UI-gated, not server-gated (and the reverse).** Some controls are hidden in the UI but the server action is still directly callable (e.g. support "resolve"); some links are shown to everyone but the destination redirects non-admins, so the link silently does nothing.
3. **Two different "is this person allowed" helpers.** Most pages use `requireOpensDoorsStaff()` (checks the email-domain allowlist); a few use the weaker `requireStaffUser()` (skips it). Inconsistent.
4. **Dead / half-wired features.** Code exists for things the UI never reaches: a manual launch-approval path, template "approve" buttons, a "delivered" metric, an "already launched" guard, two orphaned OAuth routes.
5. **Destructive admin actions skip the standard tenant guard.** A couple of admin-only "reset/clear" actions trust a raw `clientId` instead of intersecting it with the caller's accessible clients (low risk today, inconsistent with the rest).

> Note: this is a **feature/UX audit**. The earlier `odoutreach-audit-report.md` covered the **send-pipeline internals** (the H1/H2 double-send — now fixed and the flag is live — plus M1–M8). Two items reappear here from the UI angle (cooldown not re-checked at dispatch; reset/clear actions missing the tenant guard).

---

# PHASE 1 — Findings by tab

## Reports (+ Universe, global Contacts, global Activity, Operations)

- **[High] Universe leaks cross-client data to membership-scoped VIEWERs.** `src/app/(app)/universe/page.tsx:22-61` gates on "any active staff" (not a role) and the query never filters by the viewer's accessible clients; the "Refs" column (`universe-page-client.tsx:427`) shows how many *other* clients hold each contact. A VIEWER scoped to one client can browse the whole cross-client contact warehouse. Harmless for Admin/Manager/Operator (they see all clients anyway). **Fix:** gate Universe to global-access roles, or drop the cross-tenant count for scoped roles. *(This becomes moot once roles are removed — see Phase 2 #1.)*
- **[Medium] "Delivered" metric is fully built but invisible.** The data layer + a working `/reporting/detail?metric=delivered` exist (`report-detail.ts:160`), but no card renders it (`reporting/page.tsx:166-237`). **Fix:** add a Delivered card (respecting `deliveryTracked`) or retire the metric.
- **[Medium] Universe "Create list from selection" only acts on the visible 25 rows**, but the UI (`{selected} selected · {total} contacts`, `universe-page-client.tsx:261`) implies the whole filtered set, and selection clears when you page. **Fix:** add "select all N matching" or make selection sticky across pages.
- **[Low] Operations page can't actually drain the queue** — the drain button lives on the per-client Activity tab instead (`operations/outbound/page.tsx` vs `admin-queue-drain-panel.tsx`). **Fix:** mount the drain panel on Operations.
- **[Low] Reports headline row reserves 4 columns but shows 3** → a permanent empty cell (`reporting/page.tsx:166`). Ties to the missing Delivered card.
- **[Low] Reports fans out 13 count-queries × every client on each load** (post-login landing). Mitigated by a concurrency limiter today; a scaling watch-item, not a bug.

## Clients list / Overview / Brief

- **[High] Auto-promote-to-ACTIVE can silently fail with no on-screen reason and no manual fallback.** The overview auto-promotes a client only when *every* launch blocker is clear (`auto-promote-client.ts:27-106`); if one isn't, it's a swallowed no-op (`clients/[clientId]/page.tsx:59-63`) and the blocker list isn't shown on the overview. The full manual-approve path (`launch-approval.ts:224`) exists but nothing in the UI calls it. **Fix:** show the computed blockers on the overview, or re-expose a manual "Approve launch" for the blocked case.
- **[Medium] PAUSED/ARCHIVED clients are a dead-end** — no code sets them and no "resume/reactivate" exists (soft-delete uses `deletedAt`, not the `ARCHIVED` status). The launch policy's PAUSED/ARCHIVED handling is dead. **Fix:** remove the unused states or implement a resume path.
- **[Medium] New-client website field uses browser `type="url"` validation** that disagrees with the server validator (`onboarding-form.tsx:147`); a bare `acme.com` gets an inconsistent invalid state. The slug `onBlur` autofill is dead code. **Fix:** drop `type="url"`, rely on the shared validator.
- **[Medium] Slug uniqueness is check-then-insert (non-atomic)** — a race or a soft-deleted client's slug throws a raw DB error to the UI instead of the friendly "slug taken" (`actions.ts:41-64`). **Fix:** catch the unique-constraint error and map it.
- **[Low] Clients empty-state copy is wrong for some roles** — an admin/manager with zero clients can see an alarming "Unable to load workspaces" message; operators can see misleading "ask an admin to add you" copy (`clients-page-empty-state.ts:19`). **Fix:** align the role set + the empty branch.
- **[Low] Brief: clearing a v2 field can resurrect it from a legacy field on reload** (`opensdoors-brief.ts:47`). **[Low] "Main contact status" is unvalidated free text.** **[Low] Compliance PDF upload trusts the filename/MIME** (no magic-byte check) and stores bytes in Postgres.

## Mailboxes / OAuth / signatures

- **[High] A "Connected" mailbox with a dead token still shows green** until a send actually fails. The only thing that flips it is detecting a recent FAILED send (`client-workspace-bundle.ts:36-135`); there's no proactive token check, and the warning message is hardcoded "Microsoft…" even for Google (the documented weekly-Gmail-expiry case). **Fix:** add a token-freshness signal and make the message provider-aware.
- **[Medium] Two orphaned OAuth `/start` routes** (`api/mailbox-oauth/{google,microsoft}/start`) are unused by the UI but still reachable, and they can only *fail* a row into CONNECTION_ERROR. **Fix:** delete them. *(Dev-feature removal — Phase 2 #2.)*
- **[Medium] OAuth `state` isn't bound to the operator's browser session** (the callback completes for whoever finishes the link within 15 min). Mitigated because the callback verifies the OAuth identity can actually reach the declared mailbox. **Fix:** document the intentional cross-session design, consider PKCE.
- **[Low]** "Connect" button says "Connect" not "Reconnect" for a failed mailbox · signature preview uses `dangerouslySetInnerHTML` on lightly-sanitized stored HTML (self-XSS only today) · a Gmail sync that finds no signature reports "success" while the row still says "needs signature" · saving an empty signature form silently wipes an existing signature with no confirm.

## Sources / Lists

- **[Critical] CSV import on a client's Sources tab bounces every non-admin to `/universe` and hides the result.** `importContactsCsvAction` always redirects to `/contacts` (`contacts/actions.ts:103-120`), which redirects non-admins to `/universe` (`contacts/page.tsx:73`). Operators/managers (your day-to-day staff) upload a CSV, the import runs, and they're thrown to an unrelated page with **no "imported N / skipped M" and no error** — on success *or* failure. **Fix:** redirect back to `/clients/[clientId]/sources` and render the result banner there.
- **[High] The import preview's "suppressed" check uses a hand-coded list of email column names** that drifts from the real importer's column mapping (`preview-actions.ts:111` vs `contact-import-contract.ts:137`). A CSV whose email header the importer understands but the preview doesn't will show rows as sendable that are actually suppressed. **Fix:** derive the email from the same mapping the writer uses.
- **[Medium] Headline copy promises LinkedIn/phone-only contacts can be saved, but the importer requires an email** and silently skips them (`import-csv.ts:157`, copy at `sources/page.tsx:96`). **Fix:** correct the copy (or implement email-optional saving).
- **[Medium] Re-importing an existing list reports those contacts as "skipped"** even though they were correctly attached to the list — preview calls it "attach only", the result calls it "skipped" (`import-csv.ts:217`). The two screens disagree. **Fix:** surface "attached to list" as its own bucket.
- **[Low]** List-detail summary grid declares 10 columns for 11 cards (one orphan tile) · RocketReach errors are concatenated into one run-on paragraph instead of a structured list.

## Do-not-contact (suppression) / Templates

- **[High] The Google-Sheet connect/sync controls on the Do-not-contact page have no write-permission check** (`clients/[clientId]/suppression/page.tsx:83`; actions in `client-suppression-source-actions.ts` only check tenant access, not role). A view-only user can re-point the suppression sheet and trigger a re-sync, which does delete-then-replace (`suppression-sync.ts:172`) — i.e. it can **wipe blocked addresses and silently re-open people to outreach**. The manual-add path *is* gated; the sheet path isn't. **Fix:** gate the controls + the server actions. *(Mostly moot after role removal, but the server-side gate should still exist.)*
- **[High] Per-source counts exclude manually-added entries.** Manual blocks are stored with no source id (by design), and the count UI skips them (`suppression/page.tsx:35-50`). An operator who manually blocked 50 leads sees "0 on the list" and may think nothing's blocking. **Fix:** show a separate "added in-app (manual)" count.
- **[Medium] A sync that shrinks the list still reports "success."** `rowsWritten` is the new sheet size, not a delta — a fat-fingered sheet edit that removes blocked addresses looks like a normal successful sync (`suppression-sync.ts:111`). For sacrosanct opt-out data this is the costliest silent failure. **Fix:** report "wrote N, removed M previously-blocked" and confirm on large shrinks.
- **[Medium] Manual domain-block's "X contacts flagged" count can disagree with what actually gets blocked at send** (different matching logic, `do-not-contact-actions.ts:97` vs `suppression-guard.ts:28`). Send is still safe; the displayed count/badge can mislead. **Fix:** reuse the send-time normalization when flagging.
- **[Medium] Template "Ready / Approve / Return-to-draft" buttons are coded but not shown** — approval happens implicitly on save, and `READY_FOR_REVIEW` is labelled "legacy" (`client-email-templates-panel.tsx:320`). Half-wired. **Fix:** pick one — surface the buttons or delete the dead approval actions/state.
- **[Low]** `{{email_signature}}` guidance contradicts itself across the same screen (form says "don't use it", the sidebar lists it as supported) — leftover from F1 · a global-suppression action looks up a source before the access check (minor existence oracle) · a couple of `redirect()`-without-`return` idioms.

## Outreach / sequences / launch

- **[High] The "Launch sequence" button ignores most launch-readiness blockers.** The amber readiness panel blocks on no-mailbox / **missing signature** / no capacity, but the Launch button only checks sequence-status + template (`send-introduction.ts:1473`). So the panel can say "not ready — no signature" while the button right below is enabled; clicking relies on a back-end error instead of the friendly block — and I could not find a signature hard-stop at the actual send, so F1's "no send without a signature" promise may not hold at launch. **Fix:** feed the readiness blockers into the button, and enforce the signature gate at dispatch.
- **[High] Follow-up "sends automatically" blocks appear before the intro is even sent** (`sequence-send-preparation-panel.tsx:480`) — reassuring an operator about automation on a sequence that hasn't launched. They're permanently inert until the intro goes. **Fix:** hide/gate follow-up blocks until the intro has ≥1 sent.
- **[Medium] The "already launched" guard is dead** (`hasAlreadyLaunched` is hardcoded false, `queries.ts:493`) — the rail claims re-launch protection that doesn't exist (double-send is prevented per-row, not per-sequence). **[Medium] The 21-day cooldown isn't re-checked at send** (only at "review recipients"; `send-introduction.ts:601`). **[Medium] Re-engage only affects the prepare step**, with no reminder on the Launch button that a batch is bypassing cooldown.
- **[Low]** Three layers disagree on the minimum status to launch · `parseSteps` has no-op ternaries · the intro "first send delay" field is collected but the intro always sends immediately on launch (copy over-promises scheduling) · the signature blocker has no dedicated line in the blocker list.

## Activity / inbox / replies

- **[High] The "Replies" count on the summary card disagrees with the Replies panel** for two reasons: the card is an uncapped count, the panel caps at 200 and silently drops replies whose send had no connected mailbox (`client-outreach-replies.ts:39` vs `outreach-metrics.ts:268`). Two different totals on the same screen. **Fix:** one source of truth + a "showing most recent 200 of N" notice.
- **[Medium] "View original send" / "Open" links are dead for every non-admin** — they point at an admin-only route that redirects operators/managers back to where they are (`client-outreach-replies-panel.tsx:140` → `activity/outbound/[id]/page.tsx:38`). Looks broken for your main users. **Fix:** hide for non-admins or give them a working client-scoped view.
- **[Medium] The removal-intent compliance banner tells viewers to "block this sender now"** but read-only viewers can't complete the action (`messages/[messageId]/page.tsx:74`, gated in `do-not-contact-actions.ts:48`). A "non-optional" opt-out can silently not happen. **Fix:** hide/disable for users who can't action it. *(Moot after role removal.)*
- **[Low]** Inbound messages past the timeline cap aren't reachable from Activity (no list/sync there; they live on Mailboxes) · admin reset/clear actions skip `requireClientAccess` + the `deletedAt` guard (matches backend-audit M4) · a dead "subject missing" validation branch · reply-detail shows the linked-send mailbox status, not necessarily the one you'll reply from.

## Settings / Support / Training / Shell

- **[High] `resolveSupportTicket` has no server-side status check** — an admin can "resolve" a ticket from any state, skipping the approval gate the flow exists to enforce (`support/actions.ts:169`; the UI hides it but the action is directly callable). **Fix:** disappears with your planned ticket simplification (Phase 2 #3); otherwise add a status guard.
- **[Medium] Support `IN_REVIEW` status is dead** (defined, styled, sorted, never set). **[Medium] The Settings "Google OAuth test users" card says "add addresses here" but only links out to Google Console** (Google has no API; `settings/page.tsx:369` vs the panel). **[Medium]** Support attachment route serves any attachment to any staff (fine today — all staff see all tickets; becomes an IDOR only if ticket visibility is ever scoped).
- **[Low]** >3 support attachments are silently truncated (no error) · attachment MIME is trusted from the browser, title/description have no server-side max length · the sidebar shows admin-only destinations to everyone (they hit "only admins can…" dead-ends — self-resolves after role removal) · a fragile `Bytes`→`Buffer` cast · Training uses the weaker `requireStaffUser()` gate.

---

# PHASE 2 — Plan for your 3 requested changes (PLAN ONLY — needs your YES)

## Change 1 — Remove in-account roles (every user in an account gets all features), KEEP tenant isolation

**What I found (the important part):** role checks and tenant-isolation checks are **cleanly separable almost everywhere** — they live in different files and don't mix `clientId` into role conditions. There is exactly **ONE structural coupling point** you flagged to watch for:

- **`getAccessibleClientIds(staff)` (`src/server/tenant/access.ts:53-73`) derives *which clients you can see* from *your role*.** Today: Admin/Manager/Operator → all (non-deleted) clients; Viewer → only their `ClientMembership` rows. This is the single function that mixes the two concepts. **It is NOT, by itself, the cross-tenant boundary** — that's still enforced everywhere downstream by `requireClientAccess`, `whereInAccessibleClients`, the `deletedAt: null` filter, and the membership join, which are all **role-free** and must be preserved verbatim.

This is **not** the "STOP — role and tenant tangled, don't strip access control" case: tenant isolation between *different customer accounts* does not depend on roles at all (it's a per-client membership/accessible-id mechanism). The role only decides *how wide* one staff member's net is *within the agency's own set of clients*. So removing roles is safe **if** we make one deliberate decision about that function.

**The decision (I need your answer):** after roles are gone, what does "which clients can a staff member see" mean? Two clean options:
- **(A) Every staff member sees every client in the agency** (drop the role branch; return all non-deleted clients for everyone). Simplest, matches "everyone gets all features." This is almost certainly what you want for an internal agency tool.
- **(B) `ClientMembership` becomes the universal scope** (everyone only sees clients they're explicitly added to). More restrictive; more admin overhead.

**Plan (assuming A):**
1. Collapse the `StaffRole` enum to a single value (or stop reading it). Replace `GLOBAL_CLIENT_ACCESS_ROLES`/the role branch in `getAccessibleClientIds` with "all non-deleted clients for any active staff."
2. Make every per-account capability check (`requireStaffAdmin`, `requireStaffAdminForAction`, `canAssignClientWorkspaceMembership`, `canUseCooldownReengage`, the mailbox/template/sequence "mutator" predicates, `isSupportApprover`) return "allowed for any active staff." Delete the now-dead "only admins can…" UI branches.
3. **Keep untouched:** `requireClientAccess`, `whereInAccessibleClients`, `assertClientInAccessibleList`, the `deletedAt` filter, the `ClientMembership` join, and `isSuperAdmin` (decide separately — see below). These are the tenant wall.
4. Several findings above auto-resolve (Universe leak, "view original send" dead links, viewer-can't-action-compliance, nav dead-ends).

**`isSuperAdmin` is a separate decision.** It's a per-*account* capability (not a role) used only to delete/restore a whole workspace. You can keep it (so destructive workspace deletion stays gated to you) even after roles are gone. **Recommend: keep `isSuperAdmin`** as the one surviving distinction = "the developer/owner."

**Risk:** **High** (it's access control on a live multi-tenant app). Mitigated by: tenant isolation is independent of roles, so the blast radius is "everyone in the agency can now see/do everything across the agency's clients" — which is the intent — *without* widening cross-account visibility. **Rollback:** it's a code + enum change behind one PR on a branch; revert the PR (and a reverse data migration if we collapse the enum — see Phase 3). I'll add tests that prove **a user from account X still cannot load account Y's data** before and after.

## Change 2 — Remove development/internal features from the production experience

**Inventory found (each one, so you can confirm before I touch it):**
1. **Global "Contacts" page** (`/contacts`) — admin-only legacy; not in sidebar; raw CSV import + per-row send sheet.
2. **Global "Activity" page** (`/activity`) — admin-only legacy debug.
3. **Outbound send detail** (`/activity/outbound/[id]`) — admin-only; dumps provider IDs, raw lifecycle, suppression-snapshot JSON, body snapshot.
4. **Operations / outbound** (`/operations/outbound`) — admin queue diagnostics (release locks, requeue, mark verified).
5. **Admin diagnostics block on per-client Activity** — `AdminQueueDrainPanel` (sends real queued mail now), `RecentGovernedSendsPanel`, **Reset client outreach** + **Clear client replies** (destructive cleanup).
6. **Internal proof-send card** on Mailboxes — sends a real "verification" email (hard-limited to an internal allow-list).
7. **RocketReach raw-JSON import** ("Advanced JSON (debug only)") — gated by `ROCKETREACH_IMPORT_JSON_DEBUG` env (off by default).
8. **Two orphaned OAuth `/start` routes** (dead, can only error a row).
9. **`/api/dev/*` simulation routes** (`simulate-inbound`, `process-outbound-queue`, `simulate-provider-event`, `simulate-webhook-replay`) — secret-gated; used for local testing.
10. Microsoft admin-consent helper · Training "video scripts" placeholders ("to record").

**Plan:** I will **not** delete anything yet — I'll bring you this list (done) and propose, per item: **remove**, **keep but hide behind `isSuperAdmin`** (so you still have the ops tools), or **leave as-is**. My default recommendation: keep the genuinely-useful ops tools (Operations queue drain, outbound detail, reset/clear) but gate them on `isSuperAdmin` so end users never see them; remove the truly dead ones (orphaned `/start` routes, the "video scripts" placeholders if you want); leave the secret-gated `/api/dev/*` (they're not in the UI and the cron depends on the `/api/internal/*` siblings). **Risk:** Low–Medium (mostly hiding/removing UI). **Rollback:** per-item commits, each revertible; the `/api/dev/*` routes I'd leave alone unless you confirm.

## Change 3 — Simplify the support ticket flow

**Current flow (mapped exactly):** user creates → **OPEN** → an admin "triages" (writes a proposed fix) → **AWAITING_APPROVAL** → the single approver email (`greg@bidlow.co.uk`, via `SUPPORT_APPROVER_EMAIL`) approves/rejects → **APPROVED**/**REJECTED** → an admin "resolves" (writes a resolution note) → **RESOLVED**. Plus a dead **IN_REVIEW** state. Files: `support/actions.ts`, `support/approver.ts`, statuses in `schema.prisma:302`.

**Target flow (yours):** user creates → **OPEN** → you (the developer) fix it, write what was fixed, and close it.

**Plan:**
1. **Statuses collapse to two:** `OPEN` and `RESOLVED` (optionally a `CLOSED`/`WONT_FIX`). Drop `IN_REVIEW`, `AWAITING_APPROVAL`, `APPROVED`, `REJECTED`.
2. **Delete the approval machinery:** `decideSupportTicket`, `isSupportApprover`/`approver.ts`, the `SUPPORT_APPROVER_EMAIL` env, the triage→approve→resolve two-key dance.
3. **One "Resolve & close" action:** writes the resolution note + sets `RESOLVED`. (Also fixes the High finding — the missing server-side status guard goes away.)
4. **How "close" should be exposed now that roles are gone (I need you to confirm):** my recommendation — **the close/resolve action is gated on `isSuperAdmin`** (i.e. only you, the developer). Everyone else can create tickets and read them, but only you can write the resolution and close. This keeps a clean "users report, developer closes" model without bringing roles back. *Alternative:* let any staff close (simpler, but then anyone can mark things fixed). **Which do you want?**
5. **Data migration for existing tickets:** map any ticket currently in `AWAITING_APPROVAL`/`APPROVED`/`IN_REVIEW` → `OPEN`; `REJECTED` → `OPEN` (or `CLOSED` if you prefer). Reversible. I'll show you the migration + its rollback before running anything.

**Risk:** Medium (schema enum change + data migration on live tickets). **Rollback:** revert the code PR; the enum/data migration gets a paired reverse migration (re-add the states; the note/resolved fields are preserved). I'll back up the `SupportTicket` table first.

---

# Decisions I need from you before Phase 3 (the approval gate)

**Required (these change the plan):**
1. **Roles → access model:** Option **(A) everyone sees every client** (recommended) or **(B) membership-scoped for all**?
2. **Keep `isSuperAdmin`** as the single "developer/owner" capability (recommended), or remove it too (then *anyone* can delete workspaces / close tickets)?
3. **Ticket "close" gate:** **only `isSuperAdmin` can resolve/close** (recommended) or **any staff can close**?
4. **Dev-feature list (Change 2):** for each of the 10 items — remove / hide behind `isSuperAdmin` / leave? (My defaults above; tell me any you disagree with.)

**Worth a quick call (don't block the plan, but I'll fold your answer in):**
5. Should client **creation** require a capability, or can any staff create a client? (Today any staff can.)
6. Manual launch-approval & template-approve buttons: re-surface them, or delete the dead paths?
7. Reconcile the disagreeing counts (Reports/Activity/Sources/DNC) as part of this pass, or leave for a later cleanup?

---

**STOP.** Nothing will change until you approve. Reply with your answers to the decisions above (at minimum #1–#4) and a "go", and I'll move to Phase 3: implement on this branch in small, tested, plain-English commits — showing you every migration + its rollback before running it, and never deploying or merging to production myself.
