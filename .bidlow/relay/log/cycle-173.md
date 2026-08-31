# Cycle 173 - row 138 (out-of-order headline on the deck)

## Sweep first

`gh pr list --state open --json number,title,mergeable,statusCheckRollup -R
gregvisser/ODoutreach` returned `[]`. No open PRs to clear.

## The row was already done - check main first, again

Row 138 arrived marked `IN PROGRESS 173` in the local working copy of
`QUEUE.md`. Per this repo's own `CLAUDE.md` guidance ("A row reopened after a
relay timeout may already be merged — check main first"), the first action
was `git log --oneline -10 main`, not new code.

That immediately showed the row closed for the third cycle running. `main`'s
last five commits: `b1b9583` ("record cycle 172 session state for row 138
re-verification (#481)"), `4480491` ("row 138 - re-verify already-merged
work, close reopened row again (cycle 172) (#480)"), `653da59` ("row 138 -
verify already-merged work, close reopened row (#479)"), `ae34785` ("record
cycle 170 session state for row 138 merge (#478)"), `5fe6cd3` ("row 138 -
merge out-of-order deck headline, close the row (#477)"). The committed
`QUEUE.md` at `HEAD` already read `DONE 172` for row 138, with cycle 172's
own full re-verification trail.

## Re-verified from scratch rather than trusting the committed text

1. `git rev-parse main` and `git ls-remote origin refs/heads/main` both
   return `b1b958377bfda289f97aae405a5a755429ebb4a1` - local `main` is
   `origin/main`, exactly.
2. `C:\Bidlowprojects\_standards\bidlow-deck.mjs` on disk (read in full)
   carries `export function estateOutOfOrder(live)` (line 264),
   `outOfOrderHeadline(ooo)` (line 278), the `.headline-ooo` CSS block, and
   it is wired into `render()` via `const ooo = estateOutOfOrder(live);`
   (line 342) and `${outOfOrderHeadline(ooo)}` placed directly above the
   `.tiles` row (line 623) - before the existing headline count tiles, as
   the row asked.
3. The dated backup `bidlow-deck.mjs.bak-2026-08-31` exists in the same
   folder (confirmed via directory listing), taken before the write, per
   the row's instruction. No other file under `_standards` shows signs of
   being touched by this row (`deck-plain.mjs`, `bidlow-intake.mjs`,
   `lib.mjs`, the checklists, `deck.cmd` all untouched).
4. `standards/bidlow-deck-out-of-order-headline.test.ts` exists in THIS
   repo, not under `_standards`, per the row's instruction. Ran it directly:
   `npx vitest run standards/bidlow-deck-out-of-order-headline.test.ts` →
   **2 passed** (fires-and-names-the-project + stays-quiet-when-in-order).
5. `npm run lint` → 0 problems. `npm run typecheck` → 0 problems.
6. `relay/queue-file-integrity.test.ts` run against the edited `QUEUE.md`
   before committing - 9 passed, table structure intact.
7. `docs/ops/DECK-OUT-OF-ORDER-HEADLINE-2026-08-31-cycle169.md` exists on
   disk with the before/after wording (real render of the real
   `C:\Bidlowprojects` tree, 5 of 8 live projects flagged) and the full list
   of files touched.

Every gate the row's Definition of Done names was run for real, this cycle,
on this tree, and all of it is green. No code was written and no redo was
needed - the brief is satisfied on `main` for the fourth cycle running (169
built it, 170 recorded state, 171 verified it, 172 re-verified it, 173
re-verifies it again).

## This is now four cycles running - the cause was already named, not fixed

`.bidlow/relay/log/cycle-172.md`'s own watcher-appended footer, from this
exact cycle, states plainly:

> **RESTART REQUIRED - this watcher is running a STALE copy of its own
> script.**
>   Loaded at launch: 51AF85ED01BF
>   On disk now:      E97F4D42A323

This is the same finding cycle 172 already flagged for Greg, still
unaddressed as of this cycle starting. A watcher dispatching from a stale
in-memory copy of `relay-watch.ps1` is the most plausible explanation for why
a row closed on `main` three times over is still being handed back out as
`IN PROGRESS` a fourth time. This is not this row's file to touch - row 138
names exactly one file it may write under `_standards` (`bidlow-deck.mjs`),
and `relay-watch.ps1` is not it. Per this project's own standing rule, a
watcher fix does nothing until Greg runs `relay-start.cmd` by hand; merely
noting it in a fifth cycle's log will not change that.

**Restarting the watcher is now the single highest-value action available on
this project.** Every cycle spent re-verifying an already-closed row is a
cycle not spent on open work elsewhere in the queue - four cycles have now
gone to this one row for zero net code change.

## What "done" means for this cycle, in one sentence

Row 138's headline is live on `main` (`b1b9583`, confirmed equal to
`origin/main`), proven again by rerunning its own tests and gates rather than
trusting yesterday's report; the only outstanding item, unchanged since
cycle 172, is a watcher restart, which is Greg's action, not code.

## Files touched this cycle

- `.bidlow/relay/QUEUE.md` (row 138 status → `DONE 173`, with the
  re-verification trail and the repeated stale-watcher finding)
- `.bidlow/relay/log/cycle-173.md` (this file)

No other file was changed. `bidlow-deck.mjs`, its backup, and the test file
were read and executed, not edited - the row was already satisfied.
