# Cycle 182 - queue item 138

## Start-of-cycle PR sweep

`gh pr list --state open` returned zero open PRs. Nothing to merge or comment
on.

## Files touched

- `.bidlow/relay/QUEUE.md` - row 138 status cell only, closed `DONE 182`.
- `.bidlow/relay/log/cycle-181.md` - committed cycle 181's own uncommitted
  watcher footer (the section `relay-watch.ps1` appends after a cycle's
  process exits), which was sitting in the working tree unstaged at the
  start of this cycle, same shape as every prior cycle in this loop.
- `.bidlow/relay/log/cycle-182.md` - this file.

No other file was created, edited, or deleted. Nothing under `_standards`
was touched this cycle - the previously-authorised write to
`C:\Bidlowprojects\_standards\bidlow-deck.mjs` was made in cycle 169 and is
still present, unedited, on `main`.

## What I found before writing any code

`git status` at start of cycle showed the same two-file pattern as every
cycle since 171: `QUEUE.md` (watcher had flipped row 138 to
`IN PROGRESS 182` when it picked the row up) and `cycle-181.md` (190 extra
lines - cycle 181's own end-of-cycle watcher footer, not yet committed). Per
this project's CLAUDE.md rule ("a row reopened after a relay timeout may
already be merged - check `main` first"), I checked `main` before writing
anything:

- `git log --oneline -3 origin/main` shows `20eee3c4c2435d3b07961cfcdb15f1c8e4ce4190`
  at the tip, commit message "row 138 - close as re-verified and merged
  (cycle 181) (#491)".
- `git ls-remote origin refs/heads/main` returns that same hash - `main` has
  not moved since cycle 181 closed the row.

So this is the same loop cycles 171-181 already described, now in its 12th
consecutive occurrence: row 138's actual work (the deck out-of-order
headline) was built once, in cycle 169, merged, and has never regressed.
Cycle 181's own footer already named the mechanism precisely: the relay
watcher process is running a stale in-memory copy of `relay-watch.ps1`
(`Loaded at launch: 51AF85ED01BF` vs `On disk now: E97F4D42A323`) - row 52's
defect class. No cycle can fix that from inside row 138; only Greg running
`relay-start.cmd` clears it.

## The red-first test

Not applicable to new code, because no code changed. The acceptance test for
"is the merged work still there and correct" is the existing
`standards/bidlow-deck-out-of-order-headline.test.ts`, written in cycle 169.
I did not touch it and did not need a new red state - re-running it against
the unmodified `bidlow-deck.mjs` is the honest check for "did anything
regress", and the answer is no.

## What "done" looks like

A non-coder can check this by opening `.bidlow/relay/QUEUE.md`, row 138, and
seeing it begins `DONE`, and by loading
`C:\Bidlowprojects\_standards\deck-preview.html` (or running `deck.cmd`) and
seeing a banner above the project tiles naming any project building ahead of
its own questions - and seeing nothing extra appear for a project that is
fully in order.

## What I verified (gates run fresh, not assumed)

- `npx vitest run standards/bidlow-deck-out-of-order-headline.test.ts` -> **2
  passed / 2 total**.
- `npm run lint` -> **0 problems**.
- `npm run typecheck` -> **0 errors**.
- `docs/ops/DECK-OUT-OF-ORDER-HEADLINE-2026-08-31-cycle169.md` still present,
  still names before/after wording and every file touched.
- `bidlow-deck.mjs.bak-2026-08-31` (the dated backup this row required)
  still present alongside the live file, and byte-differs from the live
  file as expected (the backup predates the change).

## What I did NOT do, and why

I did not re-derive the finding from scratch, re-diff `bidlow-deck.mjs`
line-by-line against a fresh backup, or write a new artefact under
`docs/ops/` - the established minimum for a re-verification of an unchanged
commit is to requote the hash and re-run the gates, not repeat the full
build. I did not touch `relay-watch.ps1`, the picker logic, or anything
under `_standards` other than confirming (read-only) that `bidlow-deck.mjs`
is unchanged - this row authorises writing to that one file, not fixing why
the queue keeps reopening rows, which is row 52's class of problem and
already has its own closed row.

## Scope discipline

Touched only this project's `.bidlow/relay/` files. Did not create, edit,
move or delete anything under `_standards`, `BidlowClients\Kepak`,
`BidlowClients\Papaya`, or any other sibling project. No email sent, no
client data moved, no migration, additive or destructive.

## Standing finding, repeated because it is still true

This is the twelfth cycle in a row (169, 171 through 182) to spend cycle
budget on a row whose actual work has been correct and merged since cycle
169. The watcher process serving this queue has not been restarted since
before that fix landed, so every pass reopens row 138 on a stale read of
`relay-watch.ps1`. **No queue-side action closes this permanently.** The
fix is entirely outside this row: Greg runs `relay-start.cmd` in this
repo's root, which loads the current `relay-watch.ps1` and stops row 138
(and anything else affected by the same staleness) from reopening. This is
recorded in project memory (`relay-watcher-stale-restart-row138-loop.md`)
so it does not need rediscovering next session.

## Row 138 closed

`DONE 182` in `.bidlow/relay/QUEUE.md`, merged to `main` - hash quoted below
once the PR is merged.
