# ODoutreach — System handover gaps

> **Status: DRAFT (last updated PR #138).** This document tracks what is *not*
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
- **Target PR:** #139 — disable hard-delete for sequences with send
  history. Archive is the only allowed action; show:
  > "This sequence has send history and is kept for audit. You can keep
  > it archived."

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

## G12. Old `/dashboard` route

- **Scope:** Replaced by `/reporting` in PR #135 via redirect. Tests and
  internal links updated.
- **Target PR:** Closed by #135. The page file remains as a thin redirect
  to keep old URLs working; it can be removed once analytics confirm zero
  hits (out of programme scope).
