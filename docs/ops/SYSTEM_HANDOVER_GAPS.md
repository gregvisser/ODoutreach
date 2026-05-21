# ODoutreach — System handover gaps

> **Status: DRAFT (last updated PR #140 — final handover hardening).** This
> document tracks what is *not* yet handover-ready. It is updated
> progressively as the remaining handover PRs close gaps. After PR #140 the
> remaining gaps are intentional scope deferrals (real video recordings,
> `ReportingDailySnapshot` schema cleanup) and do not block staff handover.

Each gap has: scope, impact on staff, the safe interim story, and the
target PR that closes it.

---

## G1. Provider delivery tracking is not uniform — **Addressed (PR #136)**

- **Scope:** Reports/Activity show a delivery column. Not all providers we
  use emit reliable delivery webhooks (e.g. Microsoft Graph send does not).
- **Impact on staff:** "Delivery rate" can read 0% even when sends are
  succeeding — staff misread this as "nothing is being delivered".
- **PR #136 outcome:** `loadGlobalOutreachMetrics` and
  `loadClientOutreachMetrics` now compute `deliveryTracked` from real
  evidence: at least one OutboundEmail in DELIVERED status OR at least one
  OutboundProviderEvent with a delivery-typed event in scope. When neither
  exists, the Reports card and the per-client table render **Not tracked**
  for delivery and `—` for the rate. The misleading 0% has been eliminated.
- **Residual:** Per-provider drill-down ("which mailboxes emit delivery
  webhooks?") is still a future enhancement, but is no longer required for
  trustworthy staff-facing numbers.

## G2. Open tracking — **Implemented (pixel)**

- **Original gap (PR #136):** No open-pixel injection, no open events
  ingested; reports rendered **Not tracked** for opens.
- **Now implemented:** Outgoing HTML emails (Gmail + Microsoft Graph mailbox
  sends) embed a hidden 1×1 pixel pointing at `/api/track/open/<correlationId>`
  (`src/lib/tracking/open-pixel.ts`, `src/app/api/track/open/[token]/route.ts`).
  The endpoint records the first `OutboundEmail.openedAt`. Metrics count opens
  (`openedAt != null`) and set `opensTracked = true`.
- **Caveat (surfaced in the UI contract panel):** Approximate by nature —
  Apple Mail Privacy Protection auto-loads pixels (inflates opens) and
  image-blocking clients suppress them. Reply rate remains the firmest signal.
- **Residual:** Resend ESP path does not yet inject the pixel (mailbox sends
  do). Per-open event history is not stored — only first-open time.

## G2a. Reporting daily snapshot rollup is unused — **Runtime closed (PR #140), schema cleanup deferred**

- **Scope:** `ReportingDailySnapshot` exists in the schema but no code path
  creates, upserts, or updates it.
- **Impact on staff before PR #136:** The Reports page mixed snapshot reads
  with live reads, so the top "Emails sent (window)" / "Replies" / "Reply
  rate" cards always read 0 while the live cards below showed real numbers.
  Staff saw "0 sent" next to "Live SENT > 0" and lost trust in Reports.
- **PR #136 outcome:** Reports no longer reads `ReportingDailySnapshot`.
  All numbers are live.
- **PR #140 outcome:**
  - The last two unused query helpers that depended on
    `ReportingDailySnapshot` (`src/server/queries/reporting.ts` and
    `src/server/queries/dashboard.ts`) are deleted — they were not
    imported from any `src/` path.
  - The Prisma model is preserved (no schema changes in this PR) but
    now carries a `// DEPRECATED — unused at runtime as of PR #140`
    block comment explaining that all consumers were removed and that a
    future migration may drop the table.
  - New `src/app/(app)/reporting/snapshot-cleanup.test.ts` locks the
    no-runtime-dependency state: it asserts the two helper files no
    longer exist, the `/reporting` page does not reference snapshots,
    and the deprecation comment is present in `prisma/schema.prisma`.
- **Residual (intentional deferral):** Schema cleanup — i.e. removing the
  `ReportingDailySnapshot` model and emitting the corresponding
  migration — is intentionally deferred. The runtime is already detached;
  the table is harmless to leave in place while the team decides whether
  to repurpose it for a future scheduled rollup or drop it. This deferral
  is approved and does not block staff handover.

## G3. Replying inside ODoutreach — **Partly addressed (PR #137)**

- **Scope:** Inbox replies can be read and are linked to outbound sends
  (PR #134), but there was no "Reply" button that sends from the
  connected mailbox.
- **PR #137 outcome:**
  - New linked-reply detail page at
    `/clients/[clientId]/activity/replies/[replyId]` shows the reply,
    linked outbound, sequence, contact, and mailbox in a staff-friendly
    layout with no raw enum labels.
  - "Reply from {mailbox}" deep-links into the existing inbox message
    detail page (which already wraps Microsoft Graph / Gmail reply
    threading via `replyToInboundMailboxMessage`). This reuses the
    proven send path instead of duplicating provider code.
- **Residual (deferred to PR #140 handover checklist):**
  - Webhook-ingested replies (Resend test path) have no corresponding
    `InboundMailboxMessage` row, so the "Open inbox view to reply" CTA
    falls back to "Reply from {mailbox} directly". For the current
    Microsoft 365 / Google Workspace mailbox sync flow, the CTA is wired
    end-to-end.
  - Inline reply composer on the InboundReply detail page (skip the
    deep-link) is a UX polish item — current path already meets the
    handover contract.

## G4. Stop follow-ups after reply — **Addressed (PR #137)**

- **Scope:** When `InboundReply` links to an outbound send, future
  follow-ups for that contact must be suppressed in the send planner
  and dispatcher.
- **PR #137 outcome:**
  - New helper `stopFollowUpsForLinkedReply` flips the matching
    `ClientEmailSequenceEnrollment.status` from `PENDING`/`PAUSED` to
    `COMPLETED` whenever a linked reply lands. Wired into both the
    mailbox-sync path (`processSyncedMessageForReply`) and the webhook
    path (`ingestInboundForClient`).
  - `classifySequenceStepSendCandidate` now also skips `PAUSED`
    enrolments (previously only `EXCLUDED` and `COMPLETED`), so the
    manual "Pause follow-ups" staff control actually halts sends. The
    dispatcher re-runs the same classifier per row, so pre-planned
    READY rows on a now-stopped enrolment also fail-closed with
    `blocked_plan_classifier` → `skipped_enrollment_completed` /
    `skipped_enrollment_paused`.
  - Idempotent: EXCLUDED enrolments are never overwritten; repeated
    reply sync is a no-op once the enrolment is COMPLETED.
  - Tests cover both the helper and the classifier transitions.
- **Residual:** Manual "Resume" is intentionally NOT implemented in
  PR #137. Resuming an enrolment whose follow-up delay has elapsed
  would cause the dispatcher to send immediately on the next
  plan-and-drain — operator surprise. Tracked for PR #140 handover
  checklist if/when the team wants explicit resume UX.

## G5. Hard-delete of sequences with send history — **Addressed (PR #140)**

- **Scope:** Outreach UI exposes a delete action. Sequences with sends are
  audit-relevant — hard-deleting them would remove proof and metrics
  history.
- **Server-side situation (pre-PR-140):** Server-side,
  `deleteOrArchiveSequence` already routed sequences with send history
  through archive (not delete). The gap was UI-only — the button still
  said "Delete sequence" and archived sequences were silently hidden,
  so staff had no way to discover the audit-preserving archive existed.
- **PR #140 outcome:**
  - The button copy in `client-email-sequences-panel.tsx` now says
    "Delete or archive sequence" and the confirmation message
    explicitly states: *"Sequences with send history are kept for
    audit (archived); only draft sequences that have never sent can be
    hard-deleted."*
  - The panel filters archived sequences into a separate
    `<details>` disclosure ("Archived sequences (N)") so staff can see
    they exist and intentionally review them.
  - Each archived row exposes a **Restore to draft** button wired to
    the existing `returnClientEmailSequenceToDraftAction` server
    action, so an accidental archive is reversible without touching
    the database.
  - The active sequence table no longer silently elides the
    archived-count badge.
  - Lock-down test:
    `src/components/clients/email-sequences/client-email-sequences-panel-safe-delete.test.ts`.
- **Residual:** None for staff handover. Underlying server actions
  (`deleteOrArchiveClientEmailSequenceAction`,
  `returnClientEmailSequenceToDraftAction`) remain unchanged — the safe
  archive routing is older than this PR.

## G6. RocketReach UX & 12 contact fields — **Addressed (PR #138)**

- **Scope:** Sources collapsed RocketReach behind a confusing block; the
  12 fields (Name, Employer, Industry, First/Last, City, Country, LinkedIn,
  Job1 Title, A Emails, Mobile/Office Number) were not consistently
  surfaced.
- **PR #138 outcome:**
  - Sources page renders a dedicated "What we import for every contact"
    card listing all twelve canonical fields (sourced from
    `STAFF_VISIBLE_CONTACT_IMPORT_HEADERS`), so staff see the contract
    once at the top of the page rather than buried inside two import
    forms.
  - RocketReach panel now leads with a professional branded header
    ("Search prospects on RocketReach") plus a monogram-style brand
    block. The in-app search section is a visible `<section>` (no longer
    a collapsed `<details>`).
  - All live-search safety machinery is preserved: confirmation phrase,
    credit warning, API-key check, list-target requirement. Opening
    Sources does not consume any RocketReach credits.
- **Residual:** No real RocketReach logo asset in the repo. A clean text
  brand block is the contract until/if an SVG is contributed.
- **Target PR:** Closed by #138.

## G7. Reusable table controls — **Addressed (PR #138 + PR #140)**

- **Scope:** Universe, list detail, Sources, Do-not-contact tables lacked
  search / sort / column toggle / filter reset / visible-row count.
- **PR #138 outcome (Universe):**
  - Universe gained a URL-backed column-visibility panel
    (`?cols=name,employer,emails`) that lets staff toggle which of the
    twelve contact-field columns are shown. Selection is shareable via
    URL and survives reloads.
  - Universe sort options extended from 3 → 6 (Last seen, Name, Employer,
    Country, City, A Emails).
  - Universe filter form already had search + per-field filters — kept
    and now preserves the `cols=` param across filter applies.
- **PR #140 outcome (list detail + Do-not-contact):**
  - **List detail** (`/clients/[id]/lists/[listId]`): new client-side
    interactive table at
    `src/components/lists/list-detail-contact-table.tsx`. Staff get
    text search (name / employer / email / city / country / title),
    a status filter using the 10 staff-friendly delivery labels
    (Sent from mailbox, Queued, Send proof missing, Failed, Bounced,
    Replied, Unsubscribed, Suppressed / skipped, Not sent, All), and
    A→Z / Z→A sort by Name / Employer / Country / Status / Sent time.
    Raw enum labels are never rendered — the panel reads the
    pre-computed `sendStatus` `DeliveryStatusLabel` from the server
    page. No data mutation; no PII printed in tests. Tests:
    `src/components/lists/list-detail-contact-table.test.ts`.
  - **Do-not-contact** (global `/suppression` and per-client
    `/clients/[id]/suppression`): two new client components,
    `src/components/suppression/suppression-sources-inspectable-table.tsx`
    (Connected sheets — search + Email/Domain kind filter + sort by
    client / kind / rows / last sync; **Sync** server action passed
    in as a prop so it remains gated by the form, never invoked at
    page load) and
    `src/components/suppression/suppression-rows-inspectable-table.tsx`
    (Individual addresses / Whole domains — search by value /
    source / detail + A→Z / Z→A sort by value / source / added).
    Empty states say `No matching rows yet.` rather than dev-style
    "no rows".
    Tests:
    `src/components/suppression/suppression-inspectable-tables.test.ts`.
- **Residual:** None for staff handover. Sources list table reuses the
  existing per-list cards which already deep-link to the new
  list-detail table.

## G8. Training videos / voiceover — **Scripts and recording checklist added (PR #140); recorded assets still external**

- **Scope:** Training pages exist, but there are no real MP4/WebM
  walkthroughs or voiceover assets in the repo today.
- **PR #140 outcome:**
  - No fake video player is shipped. The lock-down test
    `src/lib/training/modules-staff-readiness.test.ts` already
    forbids "watch the video" / "embedded video" / YouTube / Vimeo
    copy on training modules, and a new test
    `src/lib/training/modules-video-scripts.test.ts` extends that
    coverage to the new section.
  - A new `STAFF_VIDEO_SCRIPTS` constant in `src/lib/training/modules.ts`
    publishes ten recording scripts, one per workflow the audit
    programme committed to:
    Reports dashboard, Client overview, Mailboxes,
    Sources/imports/RocketReach, Universe, Lists and delivery proof,
    Do-not-contact, Outreach sequence launch, Activity replies and
    Stop follow-ups, Settings.
    Every entry is explicitly marked `"to record"` and ships with
    a portal route to screen-share, a duration guidance, the script
    itself, and a filming checklist (do not click Send / Launch /
    Sync / Connect on camera; use the test client; no PII; etc.).
  - The `/training` index page renders the ten scripts inside a
    "Video scripts and recording checklist" card. Each entry is a
    plain `<details>` disclosure containing the script and the
    checklist — no `<video>` tag, no embedded player, no claim that
    voiceover exists.
  - A trip-wire test asserts that if any video file ever lands in
    `public/training`, at least one script must drop its
    `"to record"` status in the same PR. This prevents the scripts
    and the assets from drifting.
- **Residual (intentional deferral):** Real recorded MP4/WebM walkthroughs
  + voiceover are external to this PR. They are produced by an admin
  using the scripts above, then committed in a separate PR that also
  wires the player and updates the script `status` field. Not a staff
  handover blocker — the scripts are sufficient self-serve training.

## G9. Admin operations is now role-gated — **Addressed (PR #140)**

- **Scope:** `/operations/outbound` was reachable by any staff user; PR #135
  only removed it from the sidebar.
- **PR #140 outcome:**
  - `src/app/(app)/operations/outbound/page.tsx` now checks
    `staff.role === "ADMIN"`; non-admin staff are redirected to
    `/reporting` before the page renders. The page heading is
    rewritten to make the admin-only nature explicit (`Admin-only
    delivery and queue troubleshooting. Not in the staff sidebar.`).
  - The three mutation server actions in
    `src/app/(app)/operations/outbound/actions.ts`
    (`releaseStaleProcessingAction`, `operatorRequeueFailedAction`,
    `verifySenderIdentityReadyAction`) each re-check the admin role
    and throw `"Forbidden"` for non-admins — defence in depth so a
    crafted POST cannot bypass the page-level redirect.
  - Lock-down test:
    `src/app/(app)/operations/outbound/admin-gate.test.ts` asserts the
    page-level guard, the per-action guards, the absence from the
    main sidebar, and the staff-safe admin-only copy.
- **Residual:** None for staff handover. The route remains fully
  functional for admins and continues to be reachable from internal
  links / tests.

## G10. Global Contacts vs Universe duplication — **Addressed (PR #138 + PR #140)**

- **Scope:** Both `/contacts` and `/universe` were advertised in the sidebar.
  `/contacts` owns CSV import and a per-row send form; `/universe` is the
  canonical contact warehouse.
- **PR #138 outcome:**
  - "Contacts" is removed from the main sidebar (`nav-config.ts`).
  - The `/contacts` route is preserved (still hosts the cross-client CSV
    import + per-row send sheet) so existing bookmarks and internal
    links keep working. The route now renders a "Heads up" banner at
    the top pointing staff to Universe (directory) and per-client
    Sources (imports).
  - Page heading renamed to "Contacts (cross-client tools)" so staff who
    do land here from a deep link know they&rsquo;re on a tooling
    surface, not the day-to-day directory.
- **PR #140 outcome:**
  - `/contacts` is now ADMIN-only. Non-admin staff who land on it
    (via stale bookmarks or deep links) are redirected to `/universe`.
  - Page heading is rewritten to **"Contacts (admin legacy tools)"** so
    an admin who arrives knows the page is a tooling surface, not a
    day-to-day directory. The banner explicitly states the route is
    admin-only and points to Universe and per-client Sources.
  - The cross-client per-row send form is therefore no longer reachable
    by normal staff. Underlying send action is untouched; only the
    surface it lives on is admin-gated.
  - Lock-down tests:
    `src/app/(app)/contacts/contacts-page-copy.test.ts` updated to
    assert the admin-only redirect, banner, and title.
- **Residual:** A future PR may fully redirect `/contacts` →
  `/universe` for admins too once the per-row send sheet is confirmed
  unused. Not a staff handover blocker — staff cannot reach the route.

## G10a. Client Contacts subnav duplicated Sources — **Addressed (PR #138)**

- **Scope:** The client workspace subnav had a "Contacts" tab that
  visually duplicated the Sources tab&rsquo;s "Lists for this client"
  card. Staff regularly looked for imports there and missed Sources.
- **PR #138 outcome:**
  - Subnav label renamed from "Contacts" → **"Lists"**. The href is
    unchanged so existing in-app links and tests keep working.
  - Page heading renamed from "Contact lists" → **"Lists & readiness"**.
    Intro copy now sends staff to Sources for imports.
  - Each list card on the Lists page now has an **Open list** button
    that deep-links to `/clients/[id]/lists/[listId]` (delivery status,
    members). Previously cards only linked back to Sources/Outreach.
  - Subnav considers `/clients/[id]/lists/[listId]` part of the "Lists"
    tab so the list-detail page highlights correctly.
- **Target PR:** Closed by #138.

## G10b. Do-not-contact raw-enum chips — **Addressed (PR #138)**

- **Scope:** Both the global `/suppression` page and the client
  Do-not-contact card rendered raw Prisma enum values
  (`EMAIL`, `DOMAIN`, `NOT_CONFIGURED`, `IDLE`, `SYNCING`, `SUCCESS`,
  `ERROR`) directly to staff. The page heading read "Do-not-contact
  monitor" — a developer phrase.
- **PR #138 outcome:**
  - New `src/lib/suppression/staff-labels.ts` translates enum values to
    staff-friendly strings ("Email addresses", "Whole domains",
    "Last sync succeeded", "Sync in progress", &hellip;).
  - Global page heading: "People blocked from outreach".
  - New explainer card on the global page lists the four sources of
    suppression (manual lists, unsubscribes, bounces/provider blocks,
    per-client safety rules).
  - All raw chips replaced. Tests
    (`src/app/(app)/suppression/suppression-page-copy.test.ts`,
    `src/lib/suppression/staff-labels.test.ts`) lock the no-raw-enum
    policy.
- **Residual:** Do-not-contact tables still lack search / sort
  controls — tracked under G7 as deferred to PR #140.

## G11. Global Activity vs client Activity — **Addressed (PR #140)**

- **Scope:** Sidebar advertised a flat global Activity log; client Activity
  is the rich surface (replies-by-mailbox, sequence send proof, and
  linked reply detail).
- **PR #140 outcome:**
  - `Activity` is removed from `mainNav` in
    `src/components/app-shell/nav-config.ts`. Staff cannot reach the
    global view from normal navigation.
  - `src/app/(app)/activity/page.tsx` now requires ADMIN role; non-admin
    staff are redirected to `/clients` to pick a workspace and use the
    per-client Activity tab. An admin-only banner is added to the top
    of the page so an admin lands on it knows it is a legacy debug
    surface, not the operational view.
  - The per-client Activity route (`/clients/[id]/activity`) is
    untouched — it remains the trusted operational view with metrics,
    replies-grouped-by-mailbox, reply detail links, the collapsed
    sequence timeline, and the existing `mode: "outreach"` default
    that hides unrelated inbox mail.
  - Lock-down tests:
    `src/app/(app)/activity/activity-demotion.test.ts` (sidebar absence,
    non-admin redirect, admin-only labels, per-client route still
    intact, outreach-only default preserved),
    `src/components/app-shell/nav-config.pr139.test.ts` (sidebar shape
    updated to the post-PR-140 list),
    `src/lib/clients/staff-handover-copy.test.ts` (handover copy
    updated).
- **Residual:** None for staff handover.

## G13. Mailboxes copy + connect-mailbox explainer — **Addressed (PR #139)**

- **Scope:** The Mailboxes page used long developer-style copy ("Tokens are
  stored for this client workspace", "Clients do not need ODoutreach
  sign-in", "shared sending pool", "authorised operator on this client",
  "MFA in the browser"). The status sublabels and the "Add a mailbox"
  description copied the same jargon into every row. Staff reading the
  page in handover walkthroughs did not learn what pressing **Connect**
  actually does.
- **PR #139 outcome:**
  - `MAILBOXES_PAGE_INTRO` shortened to plain English:
    > "These are the inboxes ODoutreach can send from and monitor for
    > replies on this client."
  - New `MAILBOXES_PAGE_SUBTITLE` ("Connected sending mailboxes") used as
    the page title, with the client name appended.
  - New "What happens when you connect a mailbox?" explainer card
    rendered on the Mailboxes page itself. Three bullets state plainly
    that no email is sent on connect, that replies are read back from
    connected mailboxes, and that pool capacity is the sum of every
    connected mailbox's daily limit.
  - PR #117 (`fix/mailboxes-remove-clutter-copy`) is **superseded** by
    PR #139. The same five forbidden phrases plus three new ones are
    locked in `src/app/(app)/clients/[clientId]/mailboxes/mailboxes-page-copy.test.ts`
    (which extends the PR #117 test rather than duplicating it). PR #117
    will be closed with a "superseded by PR #139" comment after #139
    merges.
  - Status sublabels in `mailboxes-operator-model.ts` and the panel hints
    in `client-mailbox-identities-panel.tsx` were rewritten to match
    ("Finish sign-in in the Microsoft or Google window, or press Connect
    again", "Microsoft needs a fresh sign-in for this mailbox, …").
- **Target PR:** Closed by #139.

## G14. Settings page boundary clarity — **Addressed (PR #139)**

- **Scope:** Settings already had real status pills (Branding, Team access,
  Sign-in & security, Sending & compliance, Integrations) and admin-gated
  Staff Access. Staff occasionally still hunted here for per-client
  Mailboxes / Brief / Lists controls.
- **PR #139 outcome:**
  - Added a "Where to change what" card at the top of `/settings` that
    explicitly contrasts the two surfaces:
    *Here (Settings):* Branding, who can sign in, sign-in provider, email
    provider mode, cross-app integrations.
    *Inside each client:* Brief, Mailboxes, Sources, Lists, Do-not-contact,
    Templates, Outreach, Activity.
  - Lock-down test
    (`src/app/(app)/settings/settings-page-copy.test.ts`) asserts the
    section list is present, the admin gating is present, and the post-PR-138
    subnav names ("Lists", "Do-not-contact") appear in the cross-reference.
- **Target PR:** Closed by #139. Per-section status pills remain unchanged.

## G15. Training was stale after PR #135 + PR #138 — **Addressed (PR #139)**

- **Scope:** Training modules and the printable staff handover guide still
  referred to "Suppression" as the subnav label, "Contacts" as a per-client
  tab, "EMAIL · SUCCESS" raw enum copy on Do-not-contact, and a sidebar
  screenshot caption listing "Dashboard, Operations, Contacts, Suppression".
- **PR #139 outcome:**
  - Module 5 ("Contacts tab") renamed to "Lists and email readiness".
  - Module 6 ("Suppression — email and domain sheets") renamed to
    "Do-not-contact — email and domain sheets". Raw enum copy
    (`EMAIL · SUCCESS · last sync …`) replaced with the PR #138
    staff-friendly labels (`Emails · Last sync succeeded · last sync …`).
  - Module 9 (Settings) sidebar screenshot caption rewritten to match the
    post-PR-138 sidebar (Reports, Clients, New client, Universe,
    Do-not-contact, Activity, Training, Settings) and explicitly notes
    that Dashboard and Admin Operations are intentionally not in the
    sidebar.
  - Mailboxes module no longer carries the "authorised operator" /
    "shared sending pool" jargon — text rewritten to match the PR #139
    Mailboxes UI copy.
  - New `STAFF_HANDOVER_CHECKLIST` constant exports the 11-item handover
    list (Understand Reports → Check mailbox status) the audit programme
    committed to. Rendered as a numbered card on the `/training` index
    page with portal deep-links where applicable.
  - Daily outreach workflow gains a "Stop follow-ups after a reply" step
    (PR #137).
  - Printable staff handover guide (`/training/staff-handover`) updated
    to the post-PR-138 subnav names and explicitly notes that Admin
    Operations was removed from the sidebar in PR #135.
  - Lock-down test
    (`src/lib/training/modules-staff-readiness.test.ts`) prevents the
    sidebar caption, the Lists/Do-not-contact module titles, and the
    11-item checklist from regressing.
- **Target PR:** Closed by #139. Module ID slugs (`contacts`,
  `suppression`) are intentionally unchanged so existing `/training/<id>`
  bookmarks keep resolving.

## G16. Final navigation / link audit — **Addressed (PR #139)**

- **Scope:** Confirm every sidebar route and every per-client tab still
  loads after PR #135 + PR #138, with no dev copy and no raw enum chips
  on staff-visible surfaces.
- **PR #139 outcome:**
  - New `src/components/app-shell/nav-config.pr139.test.ts` locks the
    exact main-sidebar shape and order: `Reports, Clients, New client,
    Universe, Do-not-contact, Activity, Training, Settings`. The same
    test asserts the labels `Dashboard`, `Admin Operations`,
    `Operations`, and `Contacts` are NOT in the main sidebar.
  - The same test locks the per-client subnav labels: `Overview, Brief,
    Mailboxes, Sources, Lists, Do-not-contact, Templates, Outreach,
    Activity`.
  - The post-PR-138 lock-down tests
    (`src/components/clients/client-workspace-subnav.test.ts`,
    `src/app/(app)/contacts/contacts-page-copy.test.ts`, …) continue to
    pass, demonstrating no regression.
- **Residual:** None for sidebar / subnav shape. Larger structural changes
  (`/contacts` → `/universe` redirect, demoting `/activity`) remain on
  the PR #140 deferred list.

## G12. Old `/dashboard` route

- **Scope:** Replaced by `/reporting` in PR #135 via redirect. Tests and
  internal links updated.
- **Target PR:** Closed by #135. The page file remains as a thin redirect
  to keep old URLs working; it can be removed once analytics confirm zero
  hits (out of programme scope).

---

## Programme status after PR #140

PR #140 is the final bounded handover-hardening PR. After it merges:

| Gap  | Status                                                                            |
| :--- | :-------------------------------------------------------------------------------- |
| G1   | Closed by PR #136 (delivery-tracked detection).                                   |
| G2   | Closed by PR #136 (open tracking marked "Not tracked").                           |
| G2a  | Runtime closed by PR #140; schema cleanup deferred (no migration in this PR).     |
| G3   | Mostly closed by PR #137; inline reply composer remains optional polish.          |
| G4   | Closed by PR #137 (stop follow-ups + classifier).                                 |
| G5   | Closed by PR #140 (safe-delete UI + archived sequence panel).                     |
| G6   | Closed by PR #138 (RocketReach UX + 12-field card).                               |
| G7   | Closed by PR #138 (Universe) + PR #140 (list detail + Do-not-contact controls).   |
| G8   | Scripts + recording checklist landed in PR #140; recorded MP4/WebM still external.|
| G9   | Closed by PR #140 (admin role gate on `/operations/outbound` + actions).          |
| G10  | Closed by PR #138 + PR #140 (`/contacts` admin-only legacy surface).              |
| G10a | Closed by PR #138 (Lists subnav).                                                 |
| G10b | Closed by PR #138 (Do-not-contact staff labels).                                  |
| G11  | Closed by PR #140 (global `/activity` demoted to admin-only).                     |
| G12  | Closed by PR #135 (`/dashboard` → `/reporting` redirect).                         |
| G13  | Closed by PR #139 (Mailboxes copy + connect explainer).                           |
| G14  | Closed by PR #139 (Settings "Where to change what" card).                         |
| G15  | Closed by PR #139 (training modules + handover checklist).                        |
| G16  | Closed by PR #139 + PR #140 (sidebar shape locked).                               |

Outstanding items are intentional scope deferrals only:

- **G2a schema cleanup** — remove the `ReportingDailySnapshot` model and
  ship the corresponding migration in a future PR. Safe to defer because
  no `src/` path reads or writes the table.
- **G8 recorded video assets** — record the ten MP4/WebM clips per the
  committed scripts in a follow-up PR, wire the player at the same time.
  Safe to defer because the scripts themselves are sufficient training
  for a non-technical operator.

PR #82 is intentionally untouched. PR #117 is already closed as superseded
by PR #139.
