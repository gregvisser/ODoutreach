# ODoutreach — System handover gaps

> **Status: DRAFT (last updated PR #139).** This document tracks what is *not*
> yet handover-ready. It is updated progressively as the remaining handover
> PRs close gaps.

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

## G2. Open tracking is not implemented — **Addressed (PR #136)**

- **Scope:** No open-pixel injection, no open events ingested.
- **Impact on staff:** Open metrics show 0% — looks like the system "is
  broken" or "no one is reading".
- **PR #136 outcome:** Verified in code that no `src/` path writes
  `OutboundEmail.openedAt`. Reports now always renders **Not tracked** for
  opens, with the contract panel stating: "Open tracking is not implemented.
  Reply rate is the only engagement signal you can trust."
- **Residual:** Real open tracking would require provider-side pixel
  injection + ingestion. Out of programme scope.

## G2a. Reporting daily snapshot rollup is unused

- **Scope:** `ReportingDailySnapshot` exists in the schema but is read-only
  in `src/` — no code path creates, upserts, or updates it.
- **Impact on staff before PR #136:** The Reports page mixed snapshot reads
  with live reads, so the top "Emails sent (window)" / "Replies" / "Reply
  rate" cards always read 0 while the live cards below showed real numbers.
  Staff saw "0 sent" next to "Live SENT > 0" and lost trust in Reports.
- **PR #136 outcome:** Reports no longer reads `ReportingDailySnapshot`.
  All numbers are live. The table can be repurposed for a future
  rolling-window view backed by an actual writer, or dropped.
- **Residual:** Schema cleanup is intentionally deferred (no schema changes
  in this PR). Either populate the rollup via a scheduled job in a later
  PR, or drop the model.

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

## G5. Hard-delete of sequences with send history

- **Scope:** Outreach UI exposes hard-delete. Sequences with sends are
  audit-relevant — deleting them removes proof and metrics history.
- **Impact on staff:** Easy to accidentally destroy reporting integrity.
- **Interim story:** Do not click delete on any sequence that has been
  launched.
- **Target PR:** Deferred from #139 to **PR #140** — the PR #139 audit
  programme focuses on Mailboxes / Settings / Training copy + the PR #117
  decision. Disabling hard-delete on sequences with send history is a
  behaviour change and is scheduled separately so the change is reviewed
  on its own merits.

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

## G7. Reusable table controls — **Partly addressed (PR #138)**

- **Scope:** Universe, list detail, Sources, Do-not-contact tables lacked
  search / sort / column toggle / filter reset / visible-row count.
- **PR #138 outcome:**
  - Universe gained a URL-backed column-visibility panel
    (`?cols=name,employer,emails`) that lets staff toggle which of the
    twelve contact-field columns are shown. Selection is shareable via
    URL and survives reloads.
  - Universe sort options extended from 3 → 6 (Last seen, Name, Employer,
    Country, City, A Emails).
  - Universe filter form already had search + per-field filters — kept
    and now preserves the `cols=` param across filter applies.
- **Residual (deferred to PR #140 handover checklist):**
  - List detail and Sources lists table do not yet have search / sort
    controls.
  - Do-not-contact tables (per-client + global) do not yet have search
    / sort. Their staff-friendliness was instead improved via the
    PR #138 copy / label cleanup.
- **Target PR:** Universe done in #138; remaining surfaces tracked for
  PR #140.

## G8. Training videos / voiceover

- **Scope:** Training pages exist, but there are no real MP4/WebM
  walkthroughs or voiceover assets in the repo today.
- **Decision:** **Do not fabricate video assets.** Until real recording
  tooling is wired (Playwright + TTS), training pages use written scripts
  + storyboards under `docs/training/`.
- **Target PR:** #140 — script + storyboard files committed, and clearly
  labelled "Training video script ready" placeholders in the UI.

## G9. Admin operations is not yet role-gated

- **Scope:** `/operations/outbound` is reachable by any staff user; PR #135
  only removes it from the sidebar.
- **Interim story:** No advertisement of the route in normal UX.
- **Target PR:** A small follow-up adds an `isAdmin` gate around the page
  once role policy is settled (likely folded into #137 or #140).

## G10. Global Contacts vs Universe duplication — **Addressed (PR #138)**

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
  - Decision is locked by `src/lib/clients/staff-handover-copy.test.ts`
    and `src/app/(app)/contacts/contacts-page-copy.test.ts`.
- **Target PR:** Closed by #138. A future PR may fully redirect
  `/contacts` → `/universe` after a deprecation window for the per-row
  send sheet.

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

## G11. Global Activity vs client Activity

- **Scope:** Sidebar advertises a flat global Activity log; client Activity
  is the rich surface (replies-by-mailbox, sequence send proof, and now
  a linked reply detail page).
- **Interim story (PR #135 / PR #137):** Both remain in the sidebar.
  PR #137 made client Activity the operational surface for replies, so
  the global Activity duplication is now lower priority.
- **Target PR:** #140 handover checklist — demote global Activity
  (admin-only or redirect to per-client Activity).

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
