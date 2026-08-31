# Cycle 178 - row 138 (out-of-order headline on the deck)

## Sweep first

`gh pr list --state open` returned one PR: #486, cycle 177's own closing
commit for this row, with CI still `pending` on `E2E (Playwright)` (the
`verify` job had already passed). Not stale, not abandoned - just slow.
Waited for it, then re-checked: both jobs went green
(`verify` 5m37s pass, `E2E (Playwright)` 5m58s pass). Merged with
`gh pr merge 486 --squash --delete-branch=false`, confirmed by
`git ls-remote origin refs/heads/main` -> `71e93878efebca3c25c4c3e05286493f4d5cf71b`.
No other open PRs.

## The row was already done - check main first, again

Local working tree arrived on cycle 177's own branch
(`docs/row-138-cycle-177-close`) with row 138 flipped to `IN PROGRESS 178`
by the picker, and two uncommitted leftovers from cycle 177's own process
exiting after it had already pushed PR #486:

- `.bidlow/relay/log/cycle-177.md` carried an uncommitted ~200-line
  addendum - the watcher's own end-of-cycle-177 footer, written to disk
  after cycle 177's process exited.
- `.bidlow/relay/QUEUE.md` carried a new row 142, carried forward by the
  relay from a fragment of cycle 177's own log, plus the row-138 flip
  above.

This is the same pattern cycles 172-177 already found. Per this repo's
`CLAUDE.md` guidance, the first action was `git log --oneline -10 main`
(and reading `bidlow-deck.mjs` directly), not new code. `main`'s HEAD was
`4e5bb6b` (cycle 176's close) at the point the watcher launched this cycle;
PR #486 (cycle 177's close) had not yet merged.

## What this cycle actually did

1. Independently re-ran every gate row 138's Definition of Done names,
   rather than trusting cycles 169-177's reports:
   - `npx vitest run standards/bidlow-deck-out-of-order-headline.test.ts`
     -> **2 passed** (fires-and-names-the-project + stays-quiet-when-in-order).
   - `npm run lint` -> 0 problems.
   - `npm run typecheck` -> 0 problems.
   - `C:\Bidlowprojects\_standards\bidlow-deck.mjs` on disk (grepped) still
     carries `export function estateOutOfOrder(live)` (line 264),
     `outOfOrderHeadline(ooo)` (line 278), the `.headline-ooo` CSS block, and
     is wired into `render()` via `const ooo = estateOutOfOrder(live);` and
     `${outOfOrderHeadline(ooo)}` placed above the `.tiles` row.
   - The dated backup `bidlow-deck.mjs.bak-2026-08-31` and
     `docs/ops/DECK-OUT-OF-ORDER-HEADLINE-2026-08-31-cycle169.md` are both
     still present.
   All green. No code was written and no redo was needed.
2. Merged PR #486 (see Sweep above), then stashed the two uncommitted local
   files (`git stash push -u`), fast-forwarded a fresh local `main` to the
   new tip, checked out a new branch off it, and popped the stash back onto
   it - recovering cycle 177's uncommitted watcher-footer addendum and row
   142, matching the precedent cycles 174-177 set.
3. Closed row 142 as `WONTFIX 178`. Same defect class as rows 124, 139, 140
   and 141: the relay's carry-forward detector split cycle 177's own "A
   finding for the relay, not acted on here" section mid-sentence again -
   the source (cycle-177.md lines 84-91) is cycle 177 restating, in its own
   words this time rather than a quotation, the same detector-precision
   finding rows 139-141 already recorded. It names no new work; the
   underlying detector wrinkle is now confirmed five times over (124, 139,
   140, 141, 142), always on sentences discussing row 138's own reopening.
4. Closed row 138 as `DONE 178`, naming the merge commit, repeating the
   unchanged watcher finding, and stating plainly that this is the **sixth**
   consecutive cycle (173-178) to take this row and learn nothing new from
   it, because the picker re-adds row 138 to the queue as `IN PROGRESS`
   after every close on `main` regardless of the `DONE` status that same
   close just wrote to disk.

## The cause, still unchanged, still not this row's file

`relay-watch.ps1` running a stale in-memory copy of itself is the standing
explanation for why row 138 keeps reopening after being closed on `main`.
It is not fixable from inside this row - row 138 names exactly one file it
may touch under `_standards` (`bidlow-deck.mjs`), and `relay-watch.ps1`
lives in this repo, not there, and is not named by this row either. A
watcher fix is inert until Greg runs `relay-start.cmd` by hand; this is
recorded in `QUEUE.md` and five prior cycle logs already and is not
repeated in full here again.

## A finding for a human, not acted on here

Six identical cycles (173, 174, 175, 176, 177, 178) have now each spent a
full cycle - gates re-run, a docs-only branch opened, CI waited on, a PR
merged - to arrive at the same conclusion: nothing changed, because nothing
could have, because the row's only remaining requirement (a watcher
restart) is not something a cycle can do to itself. This is no longer a
one-off cost; it is a standing tax on every future cycle until one of two
things happens: a human restarts the watcher (`relay-start.cmd`), or a
human removes row 138 from the live queue. Recommending the latter as the
faster fix, since the restart has been the stated blocker since cycle 166's
own row (131) and has not happened across at least twelve cycles since.

## What "done" means for this cycle, in one sentence

Row 138's headline is live on `main` (`71e9387`, confirmed equal to
`origin/main`), proven again by rerunning its own tests and gates with no
code changed; row 142 was a fragment of an already-acted-on finding, closed
`WONTFIX`; the only outstanding item, unchanged since cycle 172, is a
watcher restart, which is Greg's action, not code.

## Files touched this cycle

- `.bidlow/relay/QUEUE.md` (row 138 -> `DONE 178`; row 142 -> `WONTFIX 178`)
- `.bidlow/relay/log/cycle-177.md` (committing the watcher's own
  end-of-cycle-177 footer, which was appended to the local working copy
  after cycle 177's own commit and had not yet been committed)
- `.bidlow/relay/log/cycle-178.md` (this file)

No other file was changed. `bidlow-deck.mjs`, its backup, and the test file
were read and executed, not edited. No `.bidlow/STATE.md` update was needed
beyond what cycle 177 already recorded - nothing new happened to record.
