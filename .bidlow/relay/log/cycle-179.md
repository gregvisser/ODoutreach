# Cycle 179 - row 138 (out-of-order headline on the deck)

## Sweep first

`gh pr list --state open` returned one PR: #487, cycle 178's own closing
commit for this row, mid-CI (`verify` still pending, `E2E (Playwright)` still
pending). Watched it with `gh pr checks 487 --watch --interval 20` rather than
guessing; both jobs went green (`verify` 4m20s, `E2E (Playwright)` 5m53s).
Merged with `gh pr merge 487 --squash --delete-branch=false`, confirmed by
`git ls-remote origin refs/heads/main` -> `2aff3845d9dabae3ce004ebabea1f960c5e24b68`.
No other open PRs after that merge.

Local working tree also carried two uncommitted leftovers from cycle 178's
own process exiting after it had already pushed PR #487 - the same pattern
cycles 171-178 already found:

- `.bidlow/relay/log/cycle-178.md` carried an uncommitted ~185-line
  addendum - the watcher's own end-of-cycle-178 footer (brief re-paste,
  timing, exit evidence, and a trailing note that cycle 178 had queued a
  background wait on PR #487's CI and ended before it landed).
- `.bidlow/relay/QUEUE.md` showed a one-line diff on row 124 that turned out
  to be CRLF-only noise (`diff` on the extracted row text was byte-identical
  once line endings were normalised) - discarded, not committed, since it
  carried no content change.

Recovered the real addendum the same way cycles 174-178 did: `git stash push
-u`, fast-forwarded local `main` to the new tip (`2aff384`), branched off it,
popped the stash, and committed the cycle-178 completion separately from this
cycle's own work (`5c763dc`).

## The row was already done - check main first, again

Per this repo's `CLAUDE.md` guidance, the first action was `git log --oneline
-15 main`, not new code. `main`'s HEAD was `71e9387` (cycle 177's close) at
the point this cycle read the queue; PR #487 (cycle 178's close) had not yet
merged, which is exactly why the sweep above mattered before touching row 138
at all.

## What this cycle actually did

Independently re-ran every gate row 138's Definition of Done names, rather
than trusting cycles 169-178's reports:

- `npx vitest run standards/bidlow-deck-out-of-order-headline.test.ts` ->
  **2 passed** (fires-and-names-the-project + stays-quiet-when-in-order).
- `npm run lint` -> 0 problems.
- `npm run typecheck` -> 0 problems.
- `C:\Bidlowprojects\_standards\bidlow-deck.mjs` on disk (grepped) still
  carries `export function estateOutOfOrder(live)` (line 264),
  `outOfOrderHeadline(ooo)` (line 278), the `.headline-ooo` CSS block, and is
  wired into `render()` via `const ooo = estateOutOfOrder(live);` and
  `${outOfOrderHeadline(ooo)}` placed above the `.tiles` row.
- The dated backup `bidlow-deck.mjs.bak-2026-08-31` and
  `docs/ops/DECK-OUT-OF-ORDER-HEADLINE-2026-08-31-cycle169.md` are both still
  present, unedited.

All green. No code was written and no redo was needed. `git ls-remote origin
refs/heads/main` -> `2aff3845d9dabae3ce004ebabea1f960c5e24b68`, and this
cycle's own gate output above was run against that exact commit's working
tree, not a cached claim.

## The cause, still unchanged, still not this row's file

`relay-watch.ps1` running a stale in-memory copy of itself is the standing
explanation for why row 138 keeps reopening after being closed on `main`. It
is not fixable from inside this row - row 138 names exactly one file it may
touch under `_standards` (`bidlow-deck.mjs`), and `relay-watch.ps1` lives in
this repo, not there, and is not named by this row either. A watcher fix is
inert until Greg runs `relay-start.cmd` by hand; this is recorded in
`QUEUE.md` and six prior cycle logs already and is not repeated in full here
again.

## A finding for a human, not acted on here

Nine cycles now (169-178, then this one makes ten) have taken row 138. The
first two (169, 170) did real work: shipped the feature and closed the row.
Every one since (171, 172, 173, 174, 175, 176, 177, 178, and now 179) has
spent a full cycle - gates re-run, a docs-only branch opened, CI waited on, a
PR merged - to reach the identical conclusion: nothing changed, because the
row's only remaining requirement is a watcher restart, which is not something
a cycle can do to itself (`relay-start.cmd` must be run by a person; a cycle
restarting its own watcher would not even take effect until the *next*
process, per this repo's own `CLAUDE.md` note on `relay-watch.ps1`). This is
no longer a one-off cost; it is a standing tax that has now consumed ten
cycles end to end. Repeating cycle 178's recommendation because nothing has
changed to weaken it: a human should either restart the watcher
(`relay-start.cmd`) or remove row 138 from the live queue. The restart has
been the stated blocker since cycle 166's own row (131) and has not happened
across at least thirteen cycles since.

## What "done" means for this cycle, in one sentence

Row 138's headline is live on `main` (`71e9387` originally, now `2aff384`
after this cycle's own PR-487 merge, confirmed equal to `origin/main`),
proven again by rerunning its own tests and gates with no code changed; the
only outstanding item, unchanged since cycle 172, is a watcher restart, which
is Greg's action, not code.

## Files touched this cycle

- `.bidlow/relay/log/cycle-178.md` (committed separately, `5c763dc` -
  completing cycle 178's own end-of-cycle footer, which was appended to the
  local working copy after cycle 178's own commit and had not yet been
  committed)
- `.bidlow/relay/QUEUE.md` (row 138 -> `DONE 179`)
- `.bidlow/relay/log/cycle-179.md` (this file)

No other file was changed. `bidlow-deck.mjs`, its backup, and the test file
were read and executed, not edited. No `.bidlow/STATE.md` update was needed
beyond what cycle 178 already recorded - nothing new happened to record.
