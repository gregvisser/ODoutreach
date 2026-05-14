# ODoutreach — System handover readiness audit

Audit date: 2026-05-14
Auditor: programme PR #135 (handover audit + navigation cleanup)
Production main at audit start: `c7482e8365cf212c68cea4af1ef6c55b1ac7e154`

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
| #139  | Outreach: archived sequences, safe delete behavior                      |
| #140  | Training, settings, handover docs (smoke test + gaps)                   |

Each PR is independently small, gated, and includes a Safety section.

---

## A. Global sidebar (`mainNav` in `src/components/app-shell/nav-config.ts`)

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
  the rich surface (per-mailbox replies, sequence send proof). The global
  Activity is a flat operator-style log and creates clutter; it has no per-mailbox
  grouping, no audit-vs-summary split, no reply-handling actions.
- **Decision (deferred):** Demote global Activity in PR #137. Either redirect to
  Reports (the "Recent outbound / Recent replies" cards already cover the gist),
  or hide behind an admin-only "Diagnostic log" entry. Do **not** delete the
  client-scoped Activity.
- **PR target:** #137 (Activity/replies cleanup).

### A.8 Reports

- **Purpose:** Operational reporting (live + all-time, per client + global).
- **Decision:** Promote to **primary** staff destination. Add an explicit
  delivery-tracking "Not tracked" state per provider, clean placeholder copy,
  remove stale snapshot framing where misleading.
- **PR target:** #136 (metrics correctness). PR #135 only promotes its position
  in the nav.

### A.9 Training

- **Purpose:** Staff training centre.
- **Decision:** Keep. Phase 11 expands content and adds storyboards/scripts
  (no fake videos).
- **PR target:** #140.

### A.10 Settings

- **Purpose:** Branding, staff access, etc.
- **Decision:** Keep. Phase 12 audits dead controls, secret display, wiring.
- **PR target:** #140.

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
- **PR target:** PR #117 (`fix/mailboxes-remove-clutter-copy`) is still open and
  exactly targets this. **PR #135 does not touch Mailboxes.** Recommendation:
  resolve PR #117 in a dedicated step — either rebase + merge cleanly, or close
  with its changes folded into Phase 3.

### B.4 Sources

- **Purpose:** CSV import + RocketReach search.
- **Issue:** RocketReach UI is collapsed/confusing, contact-field coverage
  (Name/Employer/Industry/First/Last/City/Country/LinkedIn/Job1 Title/Emails/
  Mobile/Office Number) is not consistently surfaced.
- **PR target:** #138.

### B.5 Contacts (client tab)

- **Issue:** Duplicates Sources (which already lists imports) and the
  list-detail page (which already shows membership + delivery status).
- **Decision (deferred):** Audit precisely what `/clients/[id]/contacts`
  uniquely shows; if it is only a list of imports + status counts, redirect
  to Sources or to a dedicated lists-index page.
- **PR target:** #138/#139.

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
