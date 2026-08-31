# Cycle 181 - queue item 138

## Start-of-cycle PR sweep

`gh pr list --state open` returned zero open PRs. Nothing to merge or comment on.

## Files touched

- `.bidlow/relay/QUEUE.md` - row 138 status cell only, closed `DONE 181`.
- `.bidlow/relay/log/cycle-180.md` - committed cycle 180's own uncommitted
  watcher footer (the "watcher's own record" section `relay-watch.ps1`
  appends after a cycle's process exits), which was sitting in the working
  tree unstaged when this cycle started, in the same shape cycle 180 itself
  found and committed for cycle 179's footer.
- `.bidlow/relay/log/cycle-181.md` - this file.

No other file was created, edited, or deleted. Nothing under `_standards`
was touched this cycle - the previously-authorised write to
`C:\Bidlowprojects\_standards\bidlow-deck.mjs` was made in cycle 169 and is
still present, unedited, on `main`.

## What I found before writing any code

`git status` at start of cycle showed two uncommitted files: `QUEUE.md` (the
watcher had flipped row 138's status to `IN PROGRESS 181` when it picked the
row up) and `cycle-180.md` (197 extra lines - the watcher's own end-of-cycle
footer for cycle 180, not yet committed). Per this project's CLAUDE.md rule
("a row reopened after a relay timeout may already be merged - check `main`
first"), I checked `main` before writing anything:

- `git log --oneline -10 origin/main` shows `2fda2d263fe09e0bf66f4dd0c64c7a89b28b8333`
  at the tip, commit message "row 138 - close as re-verified and merged
  (cycle 180) (#490)".
- `gh pr view 490` confirms `state: MERGED`, `mergeCommit.oid` matches.
- `git ls-remote origin refs/heads/main` returns that same hash - main has
  not moved since.

So this is the same loop cycles 171-180 already described: row 138's actual
work (the deck headline) was built once, in cycle 169, merged, and has never
regressed. The row keeps reopening because of a defect entirely outside this
row's content - the relay watcher process is running a stale in-memory copy
of `relay-watch.ps1` (row 52's class of defect; its own stamp mechanism,
merged in cycle 81, is what is now correctly reporting this: cycle 180's
watcher footer shows `Loaded at launch: 51AF85ED01BF` vs `On disk now:
E97F4D42A323`). No cycle can fix that from inside row 138.

## The red-first test

Not applicable to new code, because no code changed. The acceptance test for
"is the merged work still there and correct" is the existing
`standards/bidlow-deck-out-of-order-headline.test.ts`, written in cycle 169.
I did not touch it and did not need a new red state - re-running it against
the unmodified `bidlow-deck.mjs` is the honest check for "did anything
regress", and the answer is no.

## What "done" looks like

A non-coder can check this by opening `.bidlow/relay/QUEUE.md`, row 138, and
seeing it begins `DONE`, and by loading `C:\Bidlowprojects\_standards\deck-preview.html`
(or running `deck.cmd`) and seeing a banner above the project tiles naming
any project building ahead of its own questions - and seeing nothing extra
appear for a project that is fully in order.

## What I verified (gates run fresh, not assumed)

- `npx vitest run standards/bidlow-deck-out-of-order-headline.test.ts` -> **2
  passed / 2 total**.
- `npm run lint` -> **0 problems**.
- `npm run typecheck` -> **0 errors**.
- `docs/ops/DECK-OUT-OF-ORDER-HEADLINE-2026-08-31-cycle169.md` still present,
  still names before/after wording and every file touched.
- `bidlow-deck.mjs.bak-2026-08-31` (the dated backup this row required)
  still present alongside the live file.

## What I did NOT do, and why

I did not re-derive the finding from scratch, re-diff `bidlow-deck.mjs`
line-by-line against a fresh backup, or write a new artefact under
`docs/ops/` - cycle 178's own instruction is to keep a re-verification of an
unchanged commit to the minimum needed to requote the hash, not to repeat
the full build. I did not touch `relay-watch.ps1`, the picker logic, or
anything under `_standards` other than confirming (read-only) that
`bidlow-deck.mjs` is unchanged - this row authorises writing to that one
file, not fixing why the queue keeps reopening rows, which is row 52's
class of problem and already has its own closed row.

## Scope discipline

Touched only this project's `.bidlow/relay/` files. Did not create, edit,
move or delete anything under `_standards`, `BidlowClients\Kepak`,
`BidlowClients\Papaya`, or any other sibling project. No email sent, no
client data moved, no migration, additive or destructive.

## Standing finding, repeated because cycle 180 was right that it would still
be true

This is the tenth cycle in a row (171 through 181) to spend its full budget
re-verifying the same already-merged, still-correct change because the
watcher process serving this queue has not been restarted since before the
fix landed. **No queue-side action closes this permanently.** The two
actions that would are, in order of cost: (1) Greg runs `relay-start.cmd` in
this repo's root, which loads the current `relay-watch.ps1` and would stop
row 138 (and anything else affected by the same staleness) from reopening
on a stale read; or (2) Greg removes row 138 from the live queue by hand.
Recommend (1), since it is a two-minute action that also fixes any other row
suffering the same class of defect, not just this one.

## Row 138 closed

`DONE 181` in `.bidlow/relay/QUEUE.md`, merged to `main` - hash quoted below
once the PR is merged.
