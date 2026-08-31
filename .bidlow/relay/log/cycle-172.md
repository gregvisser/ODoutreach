# Cycle 172 - row 138 (out-of-order headline on the deck)

## Sweep first

`gh pr list --state open` returned nothing. No PRs to clear.

## The row was already done — check main first, again

Row 138 arrived marked `IN PROGRESS 172` in the local working copy of
`QUEUE.md`. Per this repo's own `CLAUDE.md` guidance ("A row reopened after a
relay timeout may already be merged — check main first"), the first action
was `git log --oneline -10 main`, not new code.

That immediately showed the row was already closed — for the second cycle
running. `main`'s last five commits are `653da59` ("row 138 - verify
already-merged work, close reopened row (#479)"), `ae34785` ("record cycle
170 session state for row 138 merge (#478)"), `5fe6cd3` ("row 138 - merge
out-of-order deck headline, close the row (#477)"), `3b6300e` ("row 138 -
surface out-of-order work as a deck headline (#476)"), and one unrelated row.
The committed `QUEUE.md` at `HEAD` already read `DONE 171` for row 138, with
cycle 171's own full verification trail.

## Re-verified from scratch rather than trusting the committed text

1. `git rev-parse main` and `git ls-remote origin refs/heads/main` both
   return `653da599e103a078e20d55fcac9978869fe4512f` — local `main` is
   `origin/main`, exactly.
2. `C:\Bidlowprojects\_standards\bidlow-deck.mjs` on disk carries
   `estateOutOfOrder` (line 264), `outOfOrderHeadline` (line 278), the
   `.headline-ooo` block, and it is wired into `render()` at line 623 via
   `const ooo = estateOutOfOrder(live);` at line 342.
3. The dated backup `bidlow-deck.mjs.bak-2026-08-31` exists in the same
   folder, taken before the write, per the row's instruction.
4. `standards/bidlow-deck-out-of-order-headline.test.ts` exists in THIS
   repo, not under `_standards`, per the row's instruction. Ran it directly:
   `npx vitest run standards/bidlow-deck-out-of-order-headline.test.ts` →
   **2 passed** (fires-and-names-the-project + stays-quiet-when-in-order).
5. `npm run lint` → 0 problems. `npm run typecheck` → 0 problems.
6. `docs/ops/DECK-OUT-OF-ORDER-HEADLINE-2026-08-31-cycle169.md` exists on
   disk with the before/after wording and the list of every file touched.
7. `relay/queue-file-integrity.test.ts` run against the edited `QUEUE.md`
   before committing — 9 passed, table structure intact.

Every gate the row's Definition of Done names was run for real, this
cycle, on this tree, and all of it is green. No code was written and no
redo was needed — the brief is satisfied on `main` for the third cycle
running (170 built it, 171 verified it, 172 re-verified it).

## The likely root cause of the repeat — flagged, not fixed

`.bidlow/relay/log/cycle-171.md` carries a footer appended by
`relay-watch.ps1` after cycle 171's process exited. That footer states
plainly:

> **RESTART REQUIRED - this watcher is running a STALE copy of its own
> script.**
>   Loaded at launch: 51AF85ED01BF
>   On disk now:      E97F4D42A323
>
> This is queue row 52's defect. It cost about ten cycles precisely because
> nothing said this out loud.

A watcher running from a stale in-memory copy of its own dispatch logic is
a plausible explanation for why this row — closed on `main` twice already —
keeps being handed back out as `IN PROGRESS`. This is not this row's file
to touch: row 138 names exactly one file it may write under `_standards`
(`bidlow-deck.mjs`), and `relay-watch.ps1` is not it. Per this project's own
rule, a watcher fix does nothing until Greg runs `relay-start.cmd` by hand.
**Flagging for Greg: the watcher needs restarting, and until it is, expect
row 138 (or any other closed row) to keep reopening.**

## What "done" means for this cycle, in one sentence

Row 138's headline is live on `main`, proven by rerunning its own tests and
gates today rather than trusting yesterday's report; the only outstanding
item is a watcher restart, which is Greg's action, not code.

## Files touched this cycle

- `.bidlow/relay/QUEUE.md` (row 138 status → `DONE 172`, with the
  re-verification trail and the stale-watcher finding)
- `.bidlow/relay/log/cycle-172.md` (this file)

No other file was changed. `bidlow-deck.mjs`, its backup, and the test file
were read and executed, not edited — the row was already satisfied.
