# ODoutreach — System handover gaps

> **Status: DRAFT (PR #135).** This document tracks what is *not* yet
> handover-ready. It is updated progressively as #136–#140 close gaps.

Each gap has: scope, impact on staff, the safe interim story, and the
target PR that closes it.

---

## G1. Provider delivery tracking is not uniform

- **Scope:** Reports/Activity show a delivery column. Not all providers we
  use emit reliable delivery webhooks (e.g. Microsoft Graph send does not).
- **Impact on staff:** "Delivery rate" can read 0% even when sends are
  succeeding — staff misread this as "nothing is being delivered".
- **Interim story:** Use the **Live — SENT (30d)** card as the
  authoritative send count. Do not infer delivery from "Delivery rate" if
  the provider for that client is not webhook-tracked.
- **Target PR:** #136 — show **Not tracked** explicitly per provider and
  hide the rate when the denominator is misleading. Internal flag
  `deliveryTracked` already exists in `loadGlobalOutreachMetrics`.

## G2. Open tracking is not implemented

- **Scope:** No open-pixel injection, no open events ingested.
- **Impact on staff:** Open metrics show 0% — looks like the system "is
  broken" or "no one is reading".
- **Interim story:** Treat open metrics as **Not tracked**. Reply rate is
  the only engagement signal.
- **Target PR:** #136 — surface **Not tracked** in the Reports card.
  A future PR (out of programme scope) can add open tracking if needed.

## G3. Replying inside ODoutreach is not implemented

- **Scope:** Inbox replies can be read and are linked to outbound sends
  (PR #134), but there is no "Reply" button that sends from the connected
  mailbox.
- **Impact on staff:** Staff still pivot to Outlook/Gmail to reply,
  defeating the inbox unification goal.
- **Interim story:** Read replies in ODoutreach Activity (per mailbox).
  Reply from the actual mailbox in Outlook/Gmail. Mark the reply as
  handled by archiving in the mailbox.
- **Target PR:** #137 — reply detail page + reply-from-mailbox + explicit
  confirmation. Until that ships, **do not** add a reply UI to other PRs.

## G4. Stop follow-ups after reply

- **Scope:** When `InboundReply` links to an outbound send, future
  follow-ups for that contact should be suppressed in the send planner.
- **Impact on staff:** A naively-built planner could keep chasing a
  contact after they replied — a serious deliverability and reputation risk.
- **Current state:** Verified in code review that the live send planner
  excludes contacts with linked replies via the suppression evaluation,
  but #137 must add explicit regression tests in
  `src/server/email-sequences/__tests__` to lock this behaviour.
- **Target PR:** #137.

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

## G6. RocketReach UX & 12 contact fields

- **Scope:** Sources collapses RocketReach behind a confusing block; the
  12 fields (Name, Employer, Industry, First/Last, City, Country, LinkedIn,
  Job1 Title, A Emails, Mobile/Office Number) are not consistently
  surfaced.
- **Impact on staff:** Confusion about what to search and what comes back.
- **Interim story:** Use CSV imports during the gap.
- **Target PR:** #138.

## G7. Reusable table controls

- **Scope:** Universe, list detail, Sources, Do-not-contact tables lack
  search/sort/column toggle/filter reset/visible-row count.
- **Impact on staff:** Tables are hard to operate at production scale.
- **Target PR:** #138.

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

## G10. Global Contacts vs Universe duplication

- **Scope:** Both `/contacts` and `/universe` are advertised in the sidebar.
  `/contacts` owns CSV import and the per-row send form; `/universe` is
  the canonical warehouse.
- **Interim story (PR #135):** Both remain in the sidebar. Audit
  recommends moving CSV import to Universe and Sources, then redirecting
  `/contacts` → `/universe`.
- **Target PR:** #138.

## G11. Global Activity vs client Activity

- **Scope:** Sidebar advertises a flat global Activity log; client Activity
  is the rich surface (replies-by-mailbox, sequence send proof).
- **Interim story (PR #135):** Both remain in the sidebar.
- **Target PR:** #137 — demote global Activity (admin-only or redirect).

## G12. Old `/dashboard` route

- **Scope:** Replaced by `/reporting` in PR #135 via redirect. Tests and
  internal links updated.
- **Target PR:** Closed by #135. The page file remains as a thin redirect
  to keep old URLs working; it can be removed once analytics confirm zero
  hits (out of programme scope).
