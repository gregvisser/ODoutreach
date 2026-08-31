# Cycle 174 - row 138 (out-of-order headline on the deck)

## Sweep first

`gh pr list --state open` returned `[]`. No open PRs to clear.

## The row was already done - check main first, again

Row 138 arrived marked `IN PROGRESS 174` in the local working copy of
`QUEUE.md`. Per this repo's own `CLAUDE.md` guidance ("A row reopened after a
relay timeout may already be merged — check main first"), the first action
was `git log --oneline -20 main`, not new code.

That immediately showed the row closed for the FOURTH cycle running. `main`'s
last four row-138 commits: `76719ab` ("row 138 - re-verify already-merged
work, close reopened row a third time (cycle 173) (#482)"), `b1b9583`
("record cycle 172 session state for row 138 re-verification (#481)"),
`4480491` ("row 138 - re-verify already-merged work, close reopened row
again (cycle 172) (#480)"), `653da59` ("row 138 - verify already-merged
work, close reopened row (#479)"). `STATUS.json` confirms: `cycle: 174`,
`lastSelfQueued: 173` — the watcher dispatched this row again immediately
after cycle 173 closed it.

## Re-verified from scratch rather than trusting the committed text

1. `git rev-parse main` and `git ls-remote origin refs/heads/main` both
   return `76719abe7a9efe96c63247f797acf483829f4510` - local `main` is
   `origin/main`, exactly.
2. `C:\Bidlowprojects\_standards\bidlow-deck.mjs` on disk (grepped in full)
   carries `export function estateOutOfOrder(live)` (line 264),
   `outOfOrderHeadline(ooo)` (line 278), the `.headline-ooo` CSS block, and
   it is wired into `render()` via `const ooo = estateOutOfOrder(live);`
   (line 342) and `${outOfOrderHeadline(ooo)}` placed directly above the
   `.tiles` row (line 623) - before the existing headline count tiles, as
   the row asked.
3. The dated backup `bidlow-deck.mjs.bak-2026-08-31` exists in the same
   folder, taken before the original write. No other file under `_standards`
   shows signs of being touched by this row.
4. `standards/bidlow-deck-out-of-order-headline.test.ts` exists in THIS
   repo, not under `_standards`. Ran it directly: `npx vitest run
   standards/bidlow-deck-out-of-order-headline.test.ts` → **2 passed**
   (fires-and-names-the-project + stays-quiet-when-in-order).
5. `npm run lint` → 0 problems. `npm run typecheck` → 0 problems.
6. `docs/ops/DECK-OUT-OF-ORDER-HEADLINE-2026-08-31-cycle169.md` exists on
   disk with the before/after wording and the full list of files touched.

Every gate the row's Definition of Done names was run for real, this cycle,
on this tree, and all of it is green. No code was written and no redo was
needed - the brief is satisfied on `main` for the FIFTH cycle running (169
built it, 170 recorded state, 171/172/173/174 verified/re-verified it).

## The cause, unchanged since cycle 172, is still unaddressed

Cycles 172 and 173 both flagged the same finding, in the same words: the
watcher appears to be dispatching from a stale in-memory copy of
`relay-watch.ps1` (a loaded script hash that differs from the on-disk hash),
which is the most plausible explanation for why a row closed on `main` keeps
being handed back out as `IN PROGRESS`. This is not this row's file to touch
- row 138 names exactly one file it may write under `_standards`
(`bidlow-deck.mjs`), and `relay-watch.ps1` lives in THIS repo, not under
`_standards`, and is still not named by this row. Per this project's own
standing rule, a watcher fix is inert until Greg runs `relay-start.cmd` by
hand.

**This is now five cycles deep on one already-closed row.** Repeating the
same full re-verification a sixth time if this recurs again would not be a
better use of a cycle than saying, again, that the fix is a restart, not
code. If row 138 reopens again after this cycle, the next cycle should
treat that itself as confirmation the watcher has not been restarted, and
keep the re-verification to the minimum needed to requote the same
unchanged commit hash, rather than re-deriving the finding from scratch.

## What "done" means for this cycle, in one sentence

Row 138's headline is live on `main` (`76719ab`, confirmed equal to
`origin/main`), proven again by rerunning its own tests and gates rather
than trusting yesterday's report; the only outstanding item, unchanged
since cycle 172, is a watcher restart, which is Greg's action, not code.

## Files touched this cycle

- `.bidlow/relay/QUEUE.md` (row 138 status → `DONE 174`, with the
  re-verification trail and the repeated stale-watcher finding)
- `.bidlow/relay/log/cycle-173.md` (committing the watcher's own
  end-of-cycle footer for cycle 173, which was appended to the local
  working copy after cycle 173's own commit and had not yet been
  committed)
- `.bidlow/relay/log/cycle-174.md` (this file)

No other file was changed. `bidlow-deck.mjs`, its backup, and the test file
were read and executed, not edited - the row was already satisfied.
