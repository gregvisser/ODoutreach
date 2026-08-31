# Cycle 180 - row 138 (out-of-order headline on the deck)

## Sweep first

`gh pr list --state open` returned zero PRs. Nothing to merge, nothing to
comment on.

## The row was already done - check main first, again

Per this repo's `CLAUDE.md` guidance ("A row reopened after a relay timeout
may already be merged - check main first"), the first action was reading
`.bidlow/relay/log/cycle-179.md` and `git log --oneline -15` on `main`, not
new code. `main`'s HEAD at cycle start was `87af51e` (cycle 179's own STATE.md
record, PR #489). Row 138's queue text was byte-identical to cycle 169's
original brief - the same item that has now been reopened and re-verified
nine times (170 through 179), all documented in the row's own status-cell
history.

## What this cycle actually did

Independently re-ran every gate row 138's Definition of Done names, rather
than trusting cycles 169-179's reports:

- `npx vitest run standards/bidlow-deck-out-of-order-headline.test.ts` ->
  **2 passed** (fires-and-names-the-project + stays-quiet-when-in-order).
- `npm run lint` -> 0 problems.
- `npm run typecheck` -> 0 problems.
- `C:\Bidlowprojects\_standards\bidlow-deck.mjs` on disk (read in full)
  still carries `export function estateOutOfOrder(live)` (line 264),
  `outOfOrderHeadline(ooo)` (line 278), the `.headline-ooo` CSS block, and is
  wired into `render()` via `const ooo = estateOutOfOrder(live);` and
  `${outOfOrderHeadline(ooo)}` placed above the `.tiles` row.
- The dated backup `bidlow-deck.mjs.bak-2026-08-31` and
  `docs/ops/DECK-OUT-OF-ORDER-HEADLINE-2026-08-31-cycle169.md` are both still
  present, unedited.
- No other file under `_standards` shows signs of being touched by this row
  (checked `deck-plain.mjs`, `bidlow-intake.mjs`, `deck.cmd` - unrelated
  `.bak-*` files present are the pre-existing ones from earlier, unrelated
  work, not new writes).

All green. No code was written and no redo was needed.

## Uncommitted leftover recovered first

The local working tree carried one leftover from cycle 179's own process
exiting after its STATE.md PR (#489) had already merged: an uncommitted
~187-line addendum to `.bidlow/relay/log/cycle-179.md` (the watcher's own
end-of-cycle-179 footer - brief re-paste, timing, exit evidence, and the
same stale-watcher-hash record it has been appending every cycle). Recovered
and committed the same way cycles 174-179 did for their predecessors:
committed it directly on the current branch (`docs/state-cycle-179-row138`,
already tracking `origin/docs/state-cycle-179-row138`) as `aa1a4b4`, ahead of
and separate from this cycle's own row-138 close, then pushed.

## The cause, still unchanged, still not this row's file

`relay-watch.ps1` running a stale in-memory copy of itself is the standing
explanation for why row 138 keeps reopening after being closed on `main`
(row 52's known defect). It is not fixable from inside this row - row 138
names exactly one file it may touch under `_standards` (`bidlow-deck.mjs`),
and `relay-watch.ps1` lives in this repo, not there, and is not named by
this row either. A watcher fix is inert until Greg runs `relay-start.cmd` by
hand; this is recorded in `QUEUE.md` and eight prior cycle logs already and
is not repeated in full here again.

## A finding for a human, not acted on here

Ten cycles now (169-179, then this one makes eleven) have taken row 138. The
first two (169, 170) did real work: shipped the feature and closed the row.
Every one since (171 through 179, and now 180) has spent a full cycle -
gates re-run, a docs-only branch opened, CI waited on, a PR merged - to reach
the identical conclusion: nothing changed, because the row's only remaining
requirement is a watcher restart, which is not something a cycle can do to
itself. This is no longer a one-off cost; it is a standing tax that has now
consumed eleven cycles end to end. Repeating cycle 179's recommendation
because nothing has changed to weaken it: a human should either restart the
watcher (`relay-start.cmd`) or remove row 138 from the live queue. The
restart has been the stated blocker since cycle 166's own row (131) and has
not happened across at least fourteen cycles since.

## What "done" means for this cycle, in one sentence

Row 138's headline is live on `main` (originally `71e9387`, unchanged since),
proven again by rerunning its own tests and gates with no code changed; the
only outstanding item, unchanged since cycle 172, is a watcher restart, which
is Greg's action, not code.

## Scope discipline

Files touched this cycle:
- `.bidlow/relay/log/cycle-179.md` (committed separately, `aa1a4b4` -
  completing cycle 179's own end-of-cycle footer)
- `.bidlow/relay/QUEUE.md` (row 138 -> `DONE 180`)
- `.bidlow/relay/log/cycle-180.md` (this file)

Nothing under `_standards` was written this cycle - `bidlow-deck.mjs`, its
backup, and the test file were read and executed, not edited. No sibling
project folder was touched. No `.bidlow/STATE.md` update queued separately
this time - the prior cycles' pattern of a follow-on STATE.md PR exists to
record session context for the *next* cycle's own re-verification, and since
this cycle's finding is unchanged from cycle 179's, the existing STATE.md
record from cycle 179 (`349a161`) still accurately describes the standing
situation; a fresh PR repeating the identical fact would itself be the kind
of churn this row's finding is warning about.
