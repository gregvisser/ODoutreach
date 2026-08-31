# Cycle 176 - row 138 (out-of-order headline on the deck)

## Sweep first

`gh pr list --state open` returned one PR: #484, cycle 175's own closing
commit for this row, with CI `pending` (`verify` and `E2E (Playwright)`,
both queued). Not stale, not abandoned - just slow. No other open PRs to
clear.

## The row was already done - check main first, again

Local working tree arrived with row 138 flipped to `IN PROGRESS 176` by the
picker, and two uncommitted leftovers from cycle 175's own process exiting
after it had already pushed PR #484:

- `.bidlow/relay/log/cycle-175.md` carried an uncommitted 203-line
  addendum - the watcher's own end-of-cycle footer for cycle 175, written to
  disk after cycle 175's process exited.
- `.bidlow/relay/QUEUE.md` carried a new row 140, added by the relay's
  carry-forward detector from a fragment of cycle 175's log.

Both independently confirm the same finding cycles 172-175 already made: the
watcher is running `relay-watch.ps1` from a loaded copy that predates the
on-disk script, which is the standing explanation for why row 138 keeps
being handed back out after it closes on `main`.

Per this repo's `CLAUDE.md` guidance, the first action was `git log
--oneline -10 main`, not new code. `main`'s HEAD was `10bc6ab` (cycle 174's
close) - PR #484 had not yet merged.

## What this cycle actually did

1. Independently re-ran every gate row 138's Definition of Done names,
   rather than trusting cycles 169-175's reports:
   - `npx vitest run standards/bidlow-deck-out-of-order-headline.test.ts`
     -> **2 passed** (fires-and-names-the-project + stays-quiet-when-in-order).
   - `npm run lint` -> 0 problems.
   - `npm run typecheck` -> 0 problems.
   - `C:\Bidlowprojects\_standards\bidlow-deck.mjs` on disk (grepped) still
     carries `export function estateOutOfOrder(live)`,
     `outOfOrderHeadline(ooo)`, the `.headline-ooo` CSS block, and is wired
     into `render()` via `const ooo = estateOutOfOrder(live);` and
     `${outOfOrderHeadline(ooo)}` placed above the `.tiles` row.
   - `docs/ops/DECK-OUT-OF-ORDER-HEADLINE-2026-08-31-cycle169.md` is
     present.
   All green. No code was written and no redo was needed.
2. Watched PR #484's checks (`gh pr checks 484`) until both went green
   (`verify` 4m5s pass, `E2E (Playwright)` 5m31s pass), then ran
   `gh pr merge 484 --squash --delete-branch`. `gh` reported "already
   merged" - the same auto-merge race cycle 175 hit merging PR #483. Either
   way the result is verified: `git log --oneline -3 main` and
   `git ls-remote origin refs/heads/main` both show **`d196ce2`** as the
   current tip.
3. Recovered cycle 175's uncommitted watcher-footer addendum (stashed
   before the merge to avoid a checkout conflict, popped back onto a fresh
   branch off the new `main`) and committed it in this cycle, matching the
   precedent cycles 174 and 175 themselves set.
4. Closed row 140 as `WONTFIX 176`. Same defect class as rows 124 and 139:
   the relay's carry-forward detector split cycle 175's log mid-sentence a
   second time. Cycle 175's own log quoted cycle 174's full sentence in
   full - "...that the fix is a restart, not code. If row 138 reopens again
   after this cycle, the next cycle should treat that itself as
   confirmation the watcher has not been restarted, and keep the
   re-verification to the minimum needed to requote the same unchanged
   commit hash, rather than re-deriving the finding from scratch." - and
   the detector re-truncated that already-quoted text into row 140's
   fragment. It names no new work; the instruction it fragments is exactly
   what this cycle did in step 5. Recorded rather than silently dropped,
   per row 140's own instruction to do one or the other.
5. Closed row 138 as `DONE 176`, naming the merge commit and repeating -
   briefly, per cycles 174 and 175's own recommendation - the unchanged
   watcher finding rather than re-deriving it from scratch.

## The cause, still unchanged, still not this row's file

`relay-watch.ps1` running a stale in-memory copy of itself is the standing
explanation for why row 138 keeps reopening after being closed on `main`.
It is not fixable from inside this row - row 138 names exactly one file it
may touch under `_standards` (`bidlow-deck.mjs`), and `relay-watch.ps1`
lives in this repo, not there, and is not named by this row either. A
watcher fix is inert until Greg runs `relay-start.cmd` by hand; this is
recorded in `QUEUE.md` and prior cycle logs already and is not repeated in
full here again.

## A finding for the relay, not acted on here

Row 140 is the **third** instance of the carry-forward detector splitting a
log mid-sentence (after row 124 and row 139), and this time it split
already-quoted text - a fragment of a fragment. Each instance costs a
reading and a row. The detector itself lives outside this row's authorised
file (`bidlow-deck.mjs`) and is not touched here; it is worth its own queue
row if it keeps recurring.

## What "done" means for this cycle, in one sentence

Row 138's headline is live on `main` (`d196ce2`, confirmed equal to
`origin/main`), proven again by rerunning its own tests and gates with no
code changed; row 140 was a garbled fragment of an already-acted-on finding,
closed `WONTFIX`; the only outstanding item, unchanged since cycle 172, is a
watcher restart, which is Greg's action, not code.

## Files touched this cycle

- `.bidlow/relay/QUEUE.md` (row 138 -> `DONE 176`; row 140 -> `WONTFIX 176`)
- `.bidlow/relay/log/cycle-175.md` (committing the watcher's own
  end-of-cycle-175 footer, which was appended to the local working copy
  after cycle 175's own commit and had not yet been committed)
- `.bidlow/relay/log/cycle-176.md` (this file)

No other file was changed. `bidlow-deck.mjs`, its backup, and the test file
were read and executed, not edited.
