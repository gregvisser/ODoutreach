# Reply ownership — who is dealing with a reply, and is it still open

**Date:** 2026-08-31 · **Cycle:** 168 · **Queue row:** 132

## What Greg reported

> Replies in the activity view do not show read, or done — it just stays as
> waiting, and a human cannot tell whether somebody on the team has taken
> responsibility for it.

Two people can answer the same prospect, or everyone can assume somebody
else has — both are visible to the client and both cost a relationship.

## What already existed in the data model, before this row

Two mechanisms already existed, half-built and never surfaced where Greg
was actually looking:

1. **`ReplyClaim`** (table + `src/lib/inbox/reply-claim.ts` +
   `src/server/inbox/reply-claim.ts`) — an ADVISORY, 30-minute presence
   signal. Written automatically when a staff member opens either reply
   detail route. Shown **only** on those two detail pages, **only to other
   viewers** (`selectVisibleClaim` deliberately excludes the viewer's own
   claim — it exists to warn "somebody else has this," not to answer "who
   has this"), and **never in any list**. It is what the amber
   `ReplyClaimNotice` banner renders.
2. **`handledAt` / `handledByStaffUserId`** — durable, but stored only in
   `InboundMailboxMessage.metadata.handling` (a JSON sub-object, PR J), and
   only for replies correlated to a synced mailbox message. Webhook-ingested
   replies (`ingestionSource: "webhook"`) had **no way to be marked handled
   at all**. This durable flag does drive the cross-client `/replies` queue
   (`needsAPerson()`), but is invisible everywhere else.

Neither the client Activity → Replies panel
(`ClientOutreachRepliesPanel`) nor the linked-reply detail page
(`ClientLinkedReplyDetail`) rendered either signal. That is not a display
bug on top of existing data — no field existed there to surface. Per the
row's own instruction ("if a field is already there and merely unshown,
surfacing it is the smaller and better fix"), this was a hybrid: **surface**
the existing claim, and **extend** the handled concept onto `InboundReply`
itself so every reply — not only mailbox-synced ones — can carry it.

## What shipped

- **Schema (additive only):** `InboundReply.handledAt` (nullable
  `DateTime`), `InboundReply.handledByStaffUserId` (nullable `String`, FK to
  `StaffUser`, `onDelete: SetNull`). Migration
  `20260831061444_reply_ownership_fields`. Dropping these two columns
  restores today's behaviour exactly — nothing existing reads or writes
  them.
- **Pure logic** (`src/lib/inbox/reply-ownership.ts`,
  `selectDisplayClaim` added to `src/lib/inbox/reply-claim.ts`): folds the
  claim and the handled fact into one plain-English state — `unclaimed` /
  `claimed` / `handled` — and a `{text, tone}` label with no jargon.
  `selectDisplayClaim` differs from the pre-existing `selectVisibleClaim` in
  one deliberate way: it **includes** the viewer's own claim, naming it
  "You" — because a list row answering "who has this" needs "you" as a
  possible answer, unlike the warning banner.
- **Batched server loader**
  (`loadDisplayClaimsForSubjects` in `src/server/inbox/reply-claim.ts`):
  one query per client per screen render, not one query per row.
- **Durable "mark handled"** (`src/server/inbox/mark-reply-handled.ts`):
  idempotent, first-write-wins (mirrors the existing
  `markInboundMailboxMessageHandled`), and releases every live claim on the
  conversation the moment it fires — nobody is left seeing a stale "Sarah
  has this open" on a reply that is already dealt with.
- **Explicit actions:** `claimReplyAction` (extended, non-breaking, with an
  optional revalidate path), a new `releaseReplyClaimAction`, and a new
  `markReplyHandledAction`. Any staff member may claim, release or mark
  handled — advisory throughout, matching the pre-existing philosophy
  ("nothing here is locked"). An unclaimed reply is never defaulted to
  somebody: `resolveReplyOwnershipState` returns `unclaimed` unless a real
  claim or a real handled fact exists.
- **UI:** one reusable `ReplyOwnershipBadge`, used in three places —
  - `/replies` (cross-client "Replies waiting for a person"): a new "Who has
    this" column. Every row here is by definition still open, so only
    Unclaimed / Claimed-by shows.
  - Client Activity tab → Replies panel: each reply row now carries the same
    badge — Unclaimed / claimed-by-name / Handled by name — where before it
    showed nothing but the AI classification.
  - Reply detail page: a new `ReplyOwnershipCard` above the existing
    (unchanged) `ReplyClaimNotice` banner, with **Claim** / **Release** /
    **Mark handled** buttons, self-inclusive (shows "You have this" to the
    person who claimed it, which the passive banner never does).
- **Cross-client queue consistency:** marking a reply handled through the
  new mechanism ALSO removes it from the `/replies` "waiting" queue — the
  query now ORs the reply's own `handledAt` with the older
  mailbox-message-scoped signal, so a reply can never look handled in one
  place and still "waiting" in another.

## What was deliberately left alone

- `ReplyClaimNotice` and its locked-down wiring test
  (`reply-claim-wiring.test.ts`) — untouched. It still auto-claims on mount
  and warns other viewers; the new card is additive, not a replacement.
- The mailbox-message detail page's own "Mark handled" button
  (`inbound-message-reply-form.tsx` / `mark-inbound-message-handled.ts`) —
  untouched; it is a different, already-working route to the same durable
  fact for mailbox-synced replies.
- No "reopen" action — the brief asked for claim / release / complete, not
  un-completing a handled reply.

## Proof it fires

**Unit — red before green**, watched fail, then pass:
- `src/lib/inbox/reply-claim.test.ts` — `selectDisplayClaim` (5 new cases:
  self-claim reads "You", othersCount, staleness, empty).
- `src/lib/inbox/reply-ownership.test.ts` — new file, 10 cases covering
  `resolveReplyOwnershipState` (handled beats claimed; unclaimed is never
  manufactured) and `replyOwnershipLabel` (plain English for all three
  states, viewer vs. not).
- `src/server/inbox/reply-claim.test.ts` — `loadDisplayClaimsForSubjects`
  (4 new cases: empty input, batched keying incl. self, absent-claim
  omission, fail-closed to an empty map).
- `src/server/inbox/mark-reply-handled.test.ts` — new file, 6 cases:
  tenant re-check, not-found, first write, idempotent second write,
  releases the correlated subject, falls back to the reply's own id.
- `src/app/(app)/clients/[clientId]/activity/claim-actions.test.ts` and
  `.../replies/[replyId]/actions.test.ts` — new files proving the server
  actions call through with the right arguments and revalidate the right
  paths.
- `src/server/queries/client-linked-reply-detail.test.ts` and
  `client-outreach-replies.test.ts` — extended with the new `ownership`
  field, including the "you handled it" vs. "somebody else handled it"
  distinction.

**Integration — against real Postgres**
(`src/server/inbox/mark-reply-handled.integration.test.ts`, new, 6 cases):
Sarah claims a real `InboundReply` row; Bob is shown "Sarah Okafor has
this"; Sarah is shown "You"; Bob marks it handled and the row is durably
his; Sarah's now-stale claim is gone from the table (not merely hidden);
Sarah cannot steal ownership by marking it handled again.

**Deliberately broken to prove it can fail red**, then reverted: removed
the idempotency guard in `markInboundReplyHandled` and re-ran the
integration suite — the "does not steal it from Bob" case failed with a
real, wrong staff id (`cmtgv37sg… ` instead of Bob's `cmtgv37tq…`), proving
the test is capable of catching the regression it exists to guard. Guard
restored, suite re-confirmed green (12/12 across the two claim/handled
integration files).

## Gates

- `npm run lint` — 0 errors, 0 warnings.
- `npm run typecheck` — 0 errors.
- `npm test` — 366 files / 3813 tests, all green.
  (Three unrelated flakes were seen once during this cycle and re-verified
  clean: `relay/queue-file-integrity.test.ts`'s BOM check — QUEUE.md's BOM
  is known to go missing from the working tree outside any commit, per
  this repo's own CLAUDE.md, and the pre-commit hook restores it — and two
  Sentry-config tests that time out only under full-suite parallel load,
  matching the documented flake from the row-131 self-test work. Both pass
  individually and on a clean re-run; neither touches this row's files.)
- `npm run test:integration` — 15 files / 128 tests, all green, including
  the two claim/handled files above (12 tests).

## Hard rule

No email sent, no client data touched, no destructive migration. The
schema change is two new nullable columns with no backfill — dropping them
restores exactly today's behaviour.
