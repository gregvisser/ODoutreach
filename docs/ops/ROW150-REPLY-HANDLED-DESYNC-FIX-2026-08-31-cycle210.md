# Row 150 (cycle 210) — closing the reply-handled desync between the two nested detail pages

**What this fixes:** a reply an operator marks "handled" on one detail page could still
show as answerable, with a live send/reply control, on the other reachable-from-it detail
page for the same conversation — a real path to a duplicate email reaching a real
prospect. Raised as finding 1 of row 135 / cycle 195
(`docs/ops/ROW135-SCREEN-WALK-PART1-2026-08-31-cycle195.md`).

## The root cause

There are two durable "somebody dealt with this" signals in this codebase for the same
conversation:

- `InboundReply.handledAt` — written only by `markInboundReplyHandled`
  (`src/server/inbox/mark-reply-handled.ts`), which the **reply-detail** page's "Mark
  handled" button calls.
- `InboundMailboxMessage.metadata.handling.handledAt` — written only by
  `markInboundMailboxMessageHandled` (`src/server/inbox/mark-inbound-message-handled.ts`)
  and by `replyToInboundMailboxMessage` (`src/server/inbox/reply-to-inbound-message.ts:438-452`,
  which auto-marks handled on send), both of which the **message-detail** page's controls
  call.

Row 132 (cycle 168) already taught the two aggregate views — the cross-client `/replies`
queue (`src/server/queries/replies-needing-a-person.ts:174-177`) and the client Activity
tab's Replies panel (`src/server/queries/client-outreach-replies.ts:190-197`) — to treat a
reply as handled if *either* signal is set. It never reached the two detail pages that
actually let an operator act on a single conversation:

- `loadClientLinkedReplyDetail` (`src/server/queries/client-linked-reply-detail.ts`, feeds
  the reply-detail page) read `InboundReply.handledAt` only.
- `loadInboundMessageDetailForClient` (`src/server/inbox/inbound-message-detail.ts`, feeds
  the message-detail page) read the mailbox-message metadata only.

So marking handled from one page never taught the other page's own query anything, and an
operator following the reply-detail page's own "Open inbox view to reply →" link
(`src/components/activity/client-linked-reply-detail.tsx:241-246`) could land on a message
page that still called the conversation "Unhandled" with a fully live Send-reply button.

## The fix

Applied the exact same OR the two aggregate views already use, in both directions, so all
four screens (`/replies`, the client Activity Replies panel, the reply-detail page, and
the message-detail page) now agree on whether a conversation is handled:

- `loadClientLinkedReplyDetail` (`src/server/queries/client-linked-reply-detail.ts`) now
  also looks up the correlated `InboundMailboxMessage`'s metadata handling state and folds
  its `handledAt` in as a fallback when `InboundReply.handledAt` is unset.
- `loadInboundMessageDetailForClient` (`src/server/inbox/inbound-message-detail.ts`) now
  also reads the correlated `InboundReply.handledAt` (already fetched by
  `findLinkedInboundReply` for the "this message is linked to a sequence reply" banner) and
  folds it into the returned `handling.handledAt` as a fallback when the message's own
  metadata has no handling block.

In both cases `InboundReply.handledAt` and the message's own metadata signal are each
preferred over the other loader's fallback when both happen to be set — same
first-signal-wins precedent the two aggregate views already established. No schema change,
no migration: this reuses the two existing durable fields exactly as row 132 designed them
to be read.

**Scope decision:** the row's brief offered a "better" option — converge on one durable
field written by both action paths, and have the message-detail page render the shared
`ReplyOwnershipBadge` component instead of its hand-rolled badge. Not done this cycle: it
is a larger, independently-reviewable change (a new write path touching both mark-handled
actions, plus a UI rework of the message-detail page), and the OR-fold above already fully
closes the desync this row exists to fix — once both loaders agree on `handledAt`, the
message-detail page's own existing `{handling.handledAt ? "Handled…" : "Unhandled"}` badge
and the reply-detail page's own `ReplyOwnershipCard` (which hides Claim/Mark-handled once
`isHandled` is true) both already react correctly to the corrected data. If Greg wants the
shared-component convergence too, it should be its own queue row.

## Proof it fires

Added dedicated red-first tests to both loaders' test suites, each proving the fold in
both directions (mark handled from A, B's own query now reports it) and that the
"native" signal still wins when both happen to be set:

- `src/server/queries/client-linked-reply-detail.test.ts` — two new cases: "falls back to
  the correlated mailbox message's own handled signal when `InboundReply.handledAt` is
  unset (desync fix)" and "`InboundReply.handledAt` still wins when both signals are set".
- `src/server/inbox/inbound-message-detail.test.ts` — new file (none existed before), 8
  cases including "falls back to the correlated `InboundReply`'s `handledAt` when the
  message's own metadata has no handling block (desync fix)" and "the message's own
  metadata signal wins when both are set".

**Verified red without the change**, by hand, this cycle:

```
$ git stash push -- src/server/queries/client-linked-reply-detail.ts
$ npx vitest run src/server/queries/client-linked-reply-detail.test.ts
 ❯ … row 150 — falls back to the correlated mailbox message's own handled signal …
   → expected null to deeply equal 2026-08-31T09:00:00.000Z
 Test Files  1 failed (1)
$ git stash pop   # restored, green again

$ git stash push -- src/server/inbox/inbound-message-detail.ts
$ npx vitest run src/server/inbox/inbound-message-detail.test.ts
 ❯ … row 150 — falls back to the correlated InboundReply's handledAt …
   → expected null to be '2026-08-31T09:00:00.000Z'
 Test Files  1 failed (1)
$ git stash pop   # restored, green again
```

Both fail red on the pre-fix code and pass green on the fix, in isolation from every other
change in this diff.

## Data / real-world action

None. No email was sent, no contact/list/sequence was created or deleted, and no gated
action (`autonomous-actor-guard.ts`) was invoked. This is a read-path fix only — the two
`markInboundReplyHandled` / `markInboundMailboxMessageHandled` write paths are unchanged.

## Gates run this cycle (real output)

- `npm run lint` — clean, 0 problems.
- `npm run typecheck` — clean, 0 errors.
- `npm test` — 3916 passing (376 of 377 files green). The one failing test
  (`relay/cycle-log-reaches-git.test.ts`) is expected and pre-existing: it fails because
  the previous cycle's log (`.bidlow/relay/log/cycle-209.md`) was still untracked at the
  start of this cycle, and its own assertion message says committing that file is this
  cycle's job — done as part of this same commit.

## Merge

Branch `fix/row-150-reply-handled-desync` → PR → green CI → merged to `main` (see cycle
log for the commit hash and the `git ls-remote` confirmation).
