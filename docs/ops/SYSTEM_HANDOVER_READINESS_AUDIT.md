# ODoutreach — System handover readiness audit

Audit date: 2026-05-14
Auditor: programme PR #135 (handover audit + navigation cleanup); finalised
in PR #140.
Production main at audit start: `c7482e8365cf212c68cea4af1ef6c55b1ac7e154`
Production main at PR #140 branch-cut: `efdb986183177c1ca10919432a5e45d890cb2558`

This audit walks every staff/admin surface in ODoutreach and grades it for
handover-readiness — i.e. *can a non-Greg staff member operate this without
guidance?*. Findings are split into:

- **Decision** — what the audit recommends.
- **PR target** — which PR in the programme implements the recommendation.

The full programme is sequenced as:

| PR    | Scope                                                                   |
| :---- | :---------------------------------------------------------------------- |
| #135  | This audit + navigation cleanup + client Overview duplication removal  |
| #136  | Reports & metrics correctness                                           |
| #137  | Activity & replies cleanup, reply handling                              |
| #138  | Sources/RocketReach UX + Universe & table filtering                     |
| #139  | Mailboxes / Settings / Training polish, PR #117 superseded, nav audit  |
| #140  | Outreach safe-delete, demote `/contacts` & `/activity`, handover residuals |

Each PR is independently small, gated, and includes a Safety section.

---

## A. Global sidebar (`mainNav` in `src/components/app-shell/nav-config.ts`)

> **Status: DRAFT (last updated PR #139).**

Current items, in order:

1. Dashboard → `/dashboard`
2. Clients → `/clients`
3. New client → `/clients/new`
4. Admin operations → `/operations/outbound`
5. Contacts → `/contacts`
6. Universe → `/universe`
7. Do-not-contact → `/suppression`
8. Activity → `/activity`
9. Reports → `/reporting`
10. Training → `/training`
11. Settings → `/settings`

### A.1 Dashboard

- **Purpose today:** A read-only 14-day overview of sends/replies, charts, and recent
  outbound/inbound rows.
- **Duplication:** Almost entirely duplicated by Reports (`/reporting`), which has the
  same charts plus a richer live SENT/DELIVERED/PIPELINE/REPLIED/BOUNCED/FAILED
  panel and all-time outreach metrics (rate-aware, "Not tracked" aware).
- **Staff need it?** No — Reports is the operational dashboard.
- **Decision:** Remove Dashboard from sidebar. Redirect `/dashboard` → `/reporting`
  to preserve any bookmarked URLs. Keep one `dashboard` charts component package
  (used by both pages) but the page becomes a thin redirect. Root `/` and sign-in
  callback redirect to `/reporting` too.
- **PR target:** #135 (this PR).

### A.2 Clients / New client

- **Purpose:** Primary staff entry point — list workspaces, open one, create new.
- **Staff need it?** Yes.
- **Decision:** Keep. No copy changes.
- **PR target:** —.

### A.3 Admin operations

- **Purpose today:** A delivery troubleshooting console (stale processing claims,
  aged QUEUED, retry-safe FAILED, recent bounces, recent provider events).
- **Surface copy:** Already says "Admin/support view for delivery troubleshooting.
  Normal staff should use Overview, Contacts, Outreach, and Activity for day-to-day
  work."
- **Issue:** Despite the copy, the link is in the *main* staff sidebar with a
  prominent wrench icon. Non-technical staff will click it, see queue plumbing,
  and lose confidence.
- **Decision:** Remove from sidebar nav for PR #135. Keep the route fully functional
  (it is reached from internal links, action redirects, and tests). A later PR can
  add an admin-only role gate around the page and surface a `Diagnostics` collapsed
  section inside the relevant client pages. The route is not deleted.
- **PR target:** #135 (sidebar removal). A future small PR will add role-gating
  inside the page once we have a settled `isAdmin` rule for staff.

### A.4 Contacts (global)

- **Purpose today:** Cross-client contact directory + CSV import + per-row
  "send to contact" form.
- **Duplication:** Significantly overlaps Universe (`/universe`) which is the
  *canonical* warehouse for imported people across clients. The Contacts page,
  however, still owns the CSV importer and the "send to contact" form; those
  are not yet on Universe.
- **Issue:** Two sidebar entries (Contacts + Universe) for things staff cannot
  reliably differentiate. CSV import being on a screen that overlaps Universe
  makes the entry point unclear.
- **Decision (deferred):** Do not change the sidebar in PR #135. The right answer
  is to:
  - Move CSV import to Sources (per-client) and a dedicated Universe import
    surface (global), then
  - Either redirect `/contacts` → `/universe` or hide it from the sidebar.
- **PR target:** #138 (Sources/RocketReach + Universe table & filters).
- **Safety:** Not touched in PR #135 because removing CSV import from staff reach
  needs a confirmed alternative entry point first.

### A.5 Universe

- **Purpose:** Canonical global warehouse of imported people, with search,
  filters, source/scope, last-seen.
- **Staff need it?** Yes (and it will absorb the canonical "browse" role).
- **Decision:** Keep. Phase 5 will harden table controls (sort, column toggle,
  reset, visible-row count, no raw enum labels).
- **PR target:** #138.

### A.6 Do-not-contact (global suppression)

- **Purpose:** Global suppression / opt-out store.
- **Staff need it?** Yes.
- **Decision:** Keep for PR #135. Phase 6 will clean copy, filters, and reasons.
- **PR target:** #138 (or split if needed).

### A.7 Activity (global)

- **Purpose today:** Cross-client outbound and inbound log, with the same
  client filter chips that Reports already has.
- **Duplication:** The client-scoped Activity (`/clients/[id]/activity`) is now
  the rich surface (per-mailbox replies, sequence send proof, **linked reply
  detail page** as of PR #137). The global Activity is a flat operator-style
  log and creates clutter; it has no per-mailbox grouping, no audit-vs-summary
  split, no reply-handling actions.
- **Decision:** PR #137 focused on the client-scoped Activity surface (the
  one staff actually use day-to-day). Demoting/redirecting global Activity is
  now deferred to the PR #140 handover checklist — lower priority because
  client Activity is the trustworthy operational surface.
- **PR target:** PR #140 handover checklist.

### A.6a Sources / Universe / Contacts / Do-not-contact — PR #138 outcome

- **Decision:** Make Sources / Universe / Contacts / Do-not-contact
  staff-ready and less duplicative without changing any send / import /
  RocketReach behaviour.
- **PR #138 — completed:**
  - **Sources (client tab)** now leads with a "What we import for every
    contact" card showing the twelve canonical fields (sourced from
    `STAFF_VISIBLE_CONTACT_IMPORT_HEADERS`). CSV upload and RocketReach
    write contacts using exactly the same headings.
  - **RocketReach panel** got a professional branded card header
    ("Search prospects on RocketReach") with a monogram-style brand
    block. The in-app search section is now a visible `<section>`, not a
    collapsed `<details>`. All live-search safety machinery
    (confirmation phrase + credit warning + API-key check + list
    target) is unchanged.
  - **Universe (global sidebar)** gained a URL-backed visible-column
    panel (`?cols=name,employer,emails`), so staff can hide individual
    contact-field columns to fit their screen. Sort options extended
    from 3 → 6 (Last seen, Name, Employer, Country, City, A Emails).
  - **Global Contacts (`/contacts`)** removed from the sidebar. Route
    preserved (still hosts CSV import + per-row send sheet) with a
    "Heads up" banner pointing staff to Universe / Sources.
  - **Client Contacts subnav** renamed to **Lists**. Page heading
    becomes "Lists & readiness". Each list card now deep-links to
    `/clients/[id]/lists/[listId]` via an **Open list** button.
  - **Do-not-contact** copy rewritten end-to-end. Global page heading
    becomes "People blocked from outreach"; new explainer card lists
    the four sources of suppression. Raw enum chips (`EMAIL`, `DOMAIN`,
    `NOT_CONFIGURED`, `IDLE`, `SYNCING`, `SUCCESS`, `ERROR`) replaced
    with staff-friendly labels from a new
    `src/lib/suppression/staff-labels.ts` helper.
  - **No schema changes**. No new migrations. No production data
    mutated. No live RocketReach search, sync, send, or import was
    triggered during this PR.
- **Tests (new or updated):**
  - `src/lib/universe/column-config.test.ts`
  - `src/components/universe/universe-contact-field-table-heads.test.ts`
  - `src/app/(app)/universe/universe-page-copy.test.ts`
  - `src/app/(app)/clients/[clientId]/sources/sources-page-copy.test.ts`
  - `src/components/clients/rocketreach-import-panel-staff-ui.test.ts`
  - `src/app/(app)/contacts/contacts-page-copy.test.ts`
  - `src/app/(app)/clients/[clientId]/contacts/contacts-page-copy.test.ts`
  - `src/components/clients/client-workspace-subnav.test.ts`
  - `src/app/(app)/suppression/suppression-page-copy.test.ts`
  - `src/lib/suppression/staff-labels.test.ts`
  - `src/lib/clients/staff-handover-copy.test.ts` (PR #138 amendment)
- **Residual / deferred to PR #140 handover checklist:**
  - Search / sort controls on list-detail, Sources lists, and
    Do-not-contact tables (G7).
  - Fully redirecting `/contacts` → `/universe` (still hosts the
    per-row send sheet today).
  - A real RocketReach SVG logo asset.
- **PR target:** PR #138.

### A.6b Mailboxes / Settings / Training / nav audit — PR #139 outcome

- **Decision:** Make Mailboxes / Settings / Training staff-ready, resolve
  PR #117 cleanly, and lock in the post-PR-135 + post-PR-138 navigation
  shape so we cannot accidentally regress in PR #140.
- **PR #139 — completed:**
  - **PR #117 superseded.** PR #117
    (`fix/mailboxes-remove-clutter-copy`) was a small (5 files, +50/-22)
    copy-only patch that removed five dev-jargon phrases from the
    Mailboxes hero / intro / connect hints. PR #139 reimplements the same
    phrase removals on top of `main` (so the diff is rebased and
    conflict-free), adds three more forbidden phrases, and broadens the
    test to cover the page, panel, model, and operator-model sources.
    The PR #117 branch is no longer needed and will be closed with a
    "superseded by PR #139" comment after PR #139 merges.
  - **Mailboxes (client tab).** `MAILBOXES_PAGE_INTRO` shortened to plain
    English. `MAILBOXES_PAGE_SUBTITLE = "Connected sending mailboxes"`
    used as the page title with the client name appended. A new "What
    happens when you connect a mailbox?" explainer card is rendered
    directly on the page with three bullets — what Connect actually
    does, that no email is sent on connect, and that pool capacity is
    the sum of every connected mailbox's daily limit. Status sublabels
    and panel hints rewritten ("Finish sign-in in the Microsoft or
    Google window, or press Connect again", "Microsoft needs a fresh
    sign-in for this mailbox, …").
  - **Mailbox connect / add flow audit:** The Connect flow is wired
    end-to-end for Microsoft and Google. The "Add a mailbox" sheet now
    uses one-sentence staff-friendly copy ("Enter the sender address and
    provider, save, then Connect. Someone who can sign in to that
    Microsoft or Google mailbox completes the prompt — they don't need
    an ODoutreach login."). No OAuth was reconnected, no mailbox was
    added, removed, or modified during the audit.
  - **Settings.** Already had real status pills for Branding, Team
    access, Sign-in & security, Sending & compliance, and Integrations,
    with proper admin gating. PR #139 adds a "Where to change what"
    intro card that explicitly contrasts the two surfaces (Settings vs
    per-client workspace). No section was removed or rewired; status
    pills (Resend connected / Test mode / Google service account /
    RocketReach) are unchanged.
  - **Training.** Modules 5 ("Contacts tab") and 6 ("Suppression") were
    renamed to "Lists" and "Do-not-contact" to match the PR #138 subnav.
    Raw enum copy (`EMAIL · SUCCESS …`) replaced with the PR #138
    staff-friendly labels. Module 9 (Settings) sidebar screenshot
    caption rewritten to match the post-PR-138 sidebar. New
    `STAFF_HANDOVER_CHECKLIST` constant lists the 11 audit-committed
    items (Understand Reports → Check mailbox status) and is rendered
    as a numbered card on `/training` with portal deep-links. Printable
    `/training/staff-handover` updated to the post-PR-138 subnav names.
    Module ID slugs were left unchanged (`contacts`, `suppression`) so
    `/training/<id>` bookmarks keep resolving.
  - **Nav / link audit.** Every sidebar entry and every per-client tab
    loads to a real route. Sidebar order locked at `Reports, Clients,
    New client, Universe, Do-not-contact, Activity, Training, Settings`.
    Per-client subnav locked at `Overview, Brief, Mailboxes, Sources,
    Lists, Do-not-contact, Templates, Outreach, Activity`. New test
    `src/components/app-shell/nav-config.pr139.test.ts` prevents
    regression of either shape.
  - **No schema changes.** No new migrations. No production data
    mutated. No live RocketReach search, no Sync replies, no Process
    outbound queue, no sends.
- **Tests (new or updated):**
  - `src/lib/mailboxes/mailbox-workspace-model.test.ts` (updated; same
    file PR #117 touched, now extended)
  - `src/app/(app)/clients/[clientId]/mailboxes/mailboxes-page-copy.test.ts`
    (NEW; reimplements PR #117's test on the broader contract)
  - `src/lib/mailboxes/mailboxes-operator-model.test.ts` (updated; key
    states now assert plain-English sublabels)
  - `src/app/(app)/settings/settings-page-copy.test.ts` (NEW)
  - `src/lib/training/modules-staff-readiness.test.ts` (NEW)
  - `src/components/app-shell/nav-config.pr139.test.ts` (NEW)
- **Residual / deferred to PR #140 handover checklist:**
  - Outreach safe-delete (G5) — disable hard-delete on sequences with
    send history (behaviour change, not a copy change; scheduled
    separately).
  - Demote / redirect global `/contacts` and `/activity` (G10, G11).
  - Admin role gate on `/operations/outbound` (G9).
  - `ReportingDailySnapshot` schema cleanup (G2a).
- **PR target:** PR #139.

### A.7a Client Activity & linked replies — PR #137 outcome

- **Decision:** Replies are the headline of the page. Sequence timeline is
  collapsible and not the headline content.
- **PR #137 — completed:**
  - **Replies panel** now appears above the sequence timeline. Each reply
    has an **Open reply →** link to a new linked reply detail page.
  - **Sequence timeline** is wrapped in `<details>` (collapsed by default in
    outreach view). The full-history view stays expandable.
  - **Linked reply detail** at `/clients/[clientId]/activity/replies/[replyId]`
    shows reply body / preview, mailbox, sequence, original outbound subject
    and sent time, contact suppression state, and a staff-friendly enrolment
    status badge ("Active follow-ups" / "Stopped (completed)" / "Paused" /
    "Excluded (operator)"). No raw enum labels are rendered.
  - **Reply send** is delegated to the existing inbox-message reply form
    (Microsoft Graph + Gmail reply paths, already proven). Staff click
    **Open inbox view to reply →** which deep-links to
    `/clients/[clientId]/activity/messages/[messageId]` via a
    `(providerMessageId, mailboxIdentityId)` correlation. No duplicate
    provider code was introduced.
  - **Stop follow-ups after reply**: new helper
    `stopFollowUpsForLinkedReply` flips the matching enrolment to
    `COMPLETED` from `PENDING`/`PAUSED` whenever a linked reply lands, in
    both `processSyncedMessageForReply` (mailbox sync) and
    `ingestInboundForClient` (webhook). EXCLUDED enrolments are never
    overwritten. Idempotent on repeated sync.
  - **Pause / Stop staff actions** on the detail page mark the enrolment as
    `PAUSED` or `COMPLETED`. The planner classifier
    `classifySequenceStepSendCandidate` now skips `PAUSED` (previously only
    `EXCLUDED` and `COMPLETED`), so pausing actually halts sends — and the
    dispatcher re-runs that classifier per row so pre-planned READY rows on
    a now-paused enrolment fail closed with `blocked_plan_classifier`.
  - **"Resume" not implemented** in PR #137 — see G4 in
    `SYSTEM_HANDOVER_GAPS.md`. Deferred to PR #140 handover checklist
    pending a safe "skip overdue follow-ups on resume" policy.
  - **No schema changes**. No new migrations. No production data mutated.
- **PR target:** PR #137.

### A.8 Reports

- **Purpose:** Operational reporting (live + all-time, per client + global).
- **Decision:** Promote to **primary** staff destination. Add an explicit
  delivery-tracking "Not tracked" state per provider, clean placeholder copy,
  remove stale snapshot framing where misleading.
- **PR target:** #136 (metrics correctness). PR #135 only promotes its position
  in the nav.
- **PR #136 — completed:**
  - Removed the three snapshot-driven header cards ("Emails sent (window)",
    "Replies", "Reply rate") that always read 0 because `ReportingDailySnapshot`
    is never written by any code path in `src/`.
  - Removed the eight legacy "Live — *" 30-day cards. They duplicated the
    outreach metrics card below and `getLiveSendReplyStats.sent` undercounted
    by filtering `status="SENT"` only, missing rows that had progressed to
    DELIVERED / REPLIED / BOUNCED.
  - Removed the snapshot-fed "Trend" and "By client" charts. Both were always
    empty for the same reason as the header cards.
  - Promoted `loadGlobalOutreachMetrics` / `loadClientOutreachMetrics` to the
    sole source of truth — one trustworthy live read path per request.
  - Replaced hardcoded `deliveryTracked: true` with an evidence-based check:
    `delivered > 0 OR ∃ OutboundProviderEvent.eventType ~ "delivered"` within
    scope. Microsoft Graph-only clients now correctly read "Not tracked"
    instead of a misleading 0% rate.
  - Opens remain "Not tracked" everywhere — confirmed `openedAt` has no
    writer in `src/` (only `delivery-status.ts` and list detail read it).
  - Added a "What these metrics mean" contract panel inline on the page so
    staff have a single in-product source of truth.
  - All metrics are explicitly labelled **All-time** in the header.
    Time-windowed (recent) views are deliberately deferred to a later PR
    with a real date-range selector.

### A.9 Training

- **Purpose:** Staff training centre.
- **Decision:** Keep. Updated in PR #139: post-PR-138 terminology
  reconciled, 11-item handover checklist rendered on the index, printable
  handover guide refreshed. No fake video assets — recording tooling
  (Playwright + TTS) stays scheduled separately (G8 in
  `SYSTEM_HANDOVER_GAPS.md`).
- **PR target:** PR #139 (closed). Future recording work → PR #140.

### A.10 Settings

- **Purpose:** Branding, staff access, sign-in/security, sending mode,
  integrations.
- **Decision:** Keep. PR #139 added a "Where to change what" intro card
  that contrasts Settings vs per-client workspace. All five real
  sections (Branding, Team access, Sign-in & security, Sending &
  compliance, Integrations) audited and kept; admin gating verified;
  no placeholder copy.
- **PR target:** PR #139 (closed).

---

## B. Client workspace subnav (`src/components/clients/client-workspace-subnav.tsx`)

Current tabs: Overview, Brief, Mailboxes, Sources, Contacts, Do-not-contact,
Templates, Outreach, Activity.

### B.1 Overview (`/clients/[id]`)

- **Purpose today:** Workspace header + workflow strip + getting-started card +
  launch readiness + operational snapshot.
- **Issue (visible to user in screenshot):** A separate `Card` titled
  **"Workspace status"** sits directly below the `ClientWorkspaceCommandCenter`
  which already shows the same status and workflow. It says:
  > "Day-to-day outreach work happens in Brief, Mailboxes, Contacts,
  > Do-not-contact, Outreach, and Activity."
  This duplicates the workspace tab bar (which lists those tabs anyway) and
  duplicates the status badge already on the command center.
- **Decision:** Remove the duplicated "Workspace status" Card. Keep Command
  Center, Launch readiness, Getting started, Operational snapshot.
- **PR target:** #135 (this PR).

### B.2 Brief

- **Purpose:** Onboarding/operating brief.
- **Decision:** Keep. No copy changes in this PR.
- **PR target:** Reviewed in #140 for any dev-like wording.

### B.3 Mailboxes

- **Purpose:** Connect/state of sending mailboxes.
- **PR target:** **Closed by PR #139.** PR #117
  (`fix/mailboxes-remove-clutter-copy`) is **superseded** by PR #139 —
  the same dev-jargon phrases are removed plus three more, and the
  "What happens when you connect a mailbox?" explainer was added.
  PR #117 will be closed with a "superseded by PR #139" comment after
  PR #139 merges. See A.6b above for the full outcome.

### B.4 Sources

- **Purpose:** CSV import + RocketReach search.
- **Issue:** RocketReach UI is collapsed/confusing, contact-field coverage
  (Name/Employer/Industry/First/Last/City/Country/LinkedIn/Job1 Title/Emails/
  Mobile/Office Number) is not consistently surfaced.
- **PR target:** #138.

### B.5 Lists (client tab — renamed from Contacts in PR #138)

- **Outcome:** Subnav label is **"Lists"** (PR #138). Page heading is
  "Lists & readiness". Each list card has an **Open list** deep-link to
  `/clients/[id]/lists/[listId]`. Intro copy points staff at Sources for
  imports.
- **PR target:** Closed by PR #138.

### B.6 Do-not-contact (client tab)

- **Purpose:** Per-client suppression view.
- **Decision:** Keep. Phase 6 clean-up.
- **PR target:** #138 (or follow-on).

### B.7 Templates

- **Purpose:** Per-client email templates.
- **Decision:** Keep. Reviewed in #139 alongside Outreach.

### B.8 Outreach

- **Issue:** Sequences with completed introduction sends are shown labelled
  "Blocked" in the screenshot because launch checks evaluate against the
  *next* step, not the lifecycle state. Hard delete is risky for sequences
  with send history.
- **PR target:** #139 — fix status labels (Sent / Introductions sent /
  Waiting for follow-up / Replied / Completed) and protect sequences with
  send history from hard delete.

### B.9 Activity (client tab)

- **Issue:** Long timeline view is overwhelming for staff. Replies are now
  grouped by mailbox (PR #134), but the audit-style timeline below them is
  noisy.
- **PR target:** #137 — hide the timeline behind an `Audit log` `<details>`
  block (or admin-only), keep replies-by-mailbox and sequence send proof as
  the default view.

---

## C. Server / data layers — quick correctness notes

These are the dependencies any later PR will touch. PR #135 changes none
of them.

| Area                                    | Notes / risk for later PRs                                                 |
| :-------------------------------------- | :------------------------------------------------------------------------- |
| `src/server/queries/dashboard.ts`       | Powers the legacy Dashboard. After redirect, still imported only by `/reporting` charts. Not removed in #135. |
| `src/server/queries/outreach-metrics.ts`| Source of all-time outreach metrics. Already exposes `deliveryTracked`/`opensTracked` flags — Reports surfaces "Not tracked" correctly. Verify in #136 with denominator tests. |
| `src/server/queries/live-stats.ts`      | 30-day live stats for Reports. Verify scope/date math in #136.             |
| `src/server/queries/reporting.ts`       | Snapshot store reads. #136 must label clearly as historical or remove if stale. |
| `src/server/queries/activity.ts`        | Powers global + client Activity. #137 must validate scope filters.         |
| `src/server/inbox/*`                    | Reply ingestion + linking (PR #134 fallback matching). #137 may need to tighten the matcher (same client + same mailbox + after outbound + sensible window). |
| `prisma/schema.prisma`                  | No changes in #135. Any schema/migration in later PRs must be additive and explained. |

---

## D. Safety scope for PR #135

PR #135 makes only the following changes:

1. Removes Dashboard, Admin operations from the global sidebar.
2. Adds `/dashboard` page that redirects to `/reporting` (preserves old URLs).
3. Sets the root `/` and sign-in default callback to `/reporting`.
4. Updates the brand-logo home link default and `revalidatePath("/dashboard")`
   call sites to use `/reporting`.
5. Updates the Module-9 training "Related portal link" from Dashboard →
   Reports (label + href).
6. Removes the duplicated "Workspace status" `Card` from the client Overview
   page.
7. Adds this audit doc.

PR #135 does **not**:

- send, queue, or process any outbound email,
- reconnect OAuth, remove mailboxes, or alter mailbox state,
- run RocketReach searches or import production data,
- modify Prisma schema, run migrations, or alter any production data,
- delete contacts, lists, sequences, or any send/reply history,
- touch reply send logic or webhook handling,
- touch the open PR #82,
- print secrets or PII to logs or docs.

---

## E. Tracking table — items deferred to later PRs

| Item                                          | Where                                                  | PR    |
| :-------------------------------------------- | :----------------------------------------------------- | :---- |
| Reports placeholder/stale snapshot cleanup    | `/reporting`                                            | #136  |
| Per-provider "Not tracked" delivery copy      | `loadGlobalOutreachMetrics`, Reports UI                | #136  |
| Open tracking "Not tracked" UX                | Reports UI                                              | #136  |
| Activity timeline → audit log collapse         | `/clients/[id]/activity`                                | #137  |
| Reply matcher tightening (same mailbox + window) | `src/server/inbox/*`                                  | #137  |
| Read/reply-from-mailbox + stop follow-ups     | Reply detail + enrollment state                         | #137  |
| RocketReach branding & 12 fields              | `/clients/[id]/sources`                                 | #138  |
| Reusable table controls                       | Universe, list detail, Sources                          | #138  |
| Global Contacts redirect/removal               | `/contacts` route + sidebar                             | #138  |
| Global Activity redirect/admin-only           | `/activity` route + sidebar                             | #137  |
| Archived sequences + safe delete              | `/clients/[id]/outreach`                                | #139  |
| Sequence status labels (Sent vs Blocked)      | Outreach + email-sequences UI                           | #139  |
| Training storyboards + voiceover scripts      | `docs/training/`                                        | #140  |
| Settings dead-control audit                   | `/settings`                                             | #140  |
| Handover smoke test + gaps doc                | `docs/ops/STAFF_HANDOVER_SMOKE_TEST.md`, `…_GAPS.md`    | #140 (drafted in #135) |
| PR #117 resolution                            | Mailboxes copy                                          | dedicated rebase or fold-in |

---

## F. PR #140 — Final handover hardening (outcome)

PR #140 is the final bounded handover-hardening PR in the programme.

What landed:

1. **G5 — Safe-delete on Outreach.** Sequences with send history are
   archived, not deleted, and archived sequences are visible in an
   explicit `<details>` disclosure with a "Restore to draft" button.
   The button copy and confirmation message say so plainly. Tests:
   `src/components/clients/email-sequences/client-email-sequences-panel-safe-delete.test.ts`.
2. **G9 — `/operations/outbound` admin-gated.** The page redirects
   non-admins to `/reporting`, and the three mutation server actions
   re-check the role and throw `Forbidden` for non-admins. Tests:
   `src/app/(app)/operations/outbound/admin-gate.test.ts`.
3. **G10 — `/contacts` admin-only legacy surface.** Non-admin staff
   are redirected to `/universe`. Title and banner are rewritten to
   "Contacts (admin legacy tools)" so an admin who arrives knows the
   surface. Tests: `src/app/(app)/contacts/contacts-page-copy.test.ts`.
4. **G11 — Global `/activity` admin-only.** Removed from the main
   sidebar. Non-admin staff are redirected to `/clients`. Per-client
   Activity (`/clients/[id]/activity`) is untouched and remains the
   trusted view. Tests: `src/app/(app)/activity/activity-demotion.test.ts`,
   `src/components/app-shell/nav-config.pr139.test.ts`.
5. **G7 — Search/sort/filter controls.** New client-side interactive
   tables on the list-detail page and on both Do-not-contact pages.
   No raw enum labels surface to staff. Tests:
   `src/components/lists/list-detail-contact-table.test.ts`,
   `src/components/suppression/suppression-inspectable-tables.test.ts`.
6. **G2a — Reporting snapshot runtime cleanup.** Deleted the two
   remaining unused query helpers
   (`src/server/queries/reporting.ts`, `src/server/queries/dashboard.ts`),
   added a `// DEPRECATED — unused at runtime as of PR #140` block
   comment to the Prisma model. No schema change, no migration. Test:
   `src/app/(app)/reporting/snapshot-cleanup.test.ts`.
7. **G8 — Training scripts and recording checklist.** Ten recording
   scripts in `STAFF_VIDEO_SCRIPTS` covering the ten audit-committed
   workflows, surfaced in a "Video scripts and recording checklist"
   card on `/training`. Every script is explicitly `"to record"`. No
   fake `<video>` tag, no YouTube/Vimeo embed. A trip-wire test
   forces scripts to come off "to record" status if a real video
   file ever lands in `public/training`. Tests:
   `src/lib/training/modules-video-scripts.test.ts`.

PR #140 does **not**:

- send, queue, or process any outbound email,
- send replies, sync replies, or process inbound mail,
- run RocketReach live searches, import production data, or reconnect
  OAuth,
- remove mailboxes or change mailbox credentials,
- delete contacts, lists, sequences, suppression rows, or any
  send/reply/outbound/inbound history,
- modify the Prisma schema or run any migration
  (`prisma db push`, `migrate reset`, `migrate dev`, `migrate deploy`),
- touch the open PR #82,
- touch the already-closed PR #117 (superseded by PR #139),
- print secrets, recipient emails, or any PII in code or docs.

PR-#140-outstanding items (intentional deferrals only):

- **G2a schema cleanup** — drop `ReportingDailySnapshot` and ship a
  migration in a separate PR.
- **G8 recorded assets** — record the ten MP4/WebM clips per the
  committed scripts in a separate PR; wire the player and flip
  `STAFF_VIDEO_SCRIPTS[i].status` from `"to record"` to the recorded
  state in the same PR.
