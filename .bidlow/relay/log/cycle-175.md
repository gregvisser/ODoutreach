# Cycle 175 - row 138 (out-of-order headline on the deck)

## Sweep first

`gh pr list --state open` returned one PR: #483, cycle 174's own
re-verification PR for this same row, with CI still `pending` (`E2E
(Playwright)` and `verify`, both queued/running). Not stale, not abandoned -
just slow. No other open PRs to clear.

## The row was already done - check main first, again

Local `QUEUE.md` arrived with row 138 already flipped to `IN PROGRESS 175`
by the picker, and `.bidlow/relay/log/cycle-174.md` carried an uncommitted
202-line addendum: the watcher's own end-of-cycle footer for cycle 174,
written to disk after cycle 174's process exited but never committed
(cycle 174's PR #483 had already been pushed by then). That footer
independently confirms the same finding cycles 172-174 already made: the
watcher is running relay-watch.ps1 from a loaded copy (`51AF85ED01BF`) that
predates the on-disk script (`E97F4D42A323`), which is the most plausible
reason a row closed on `main` keeps being handed back out.

Per this repo's own `CLAUDE.md` guidance, the first action was `git log
--oneline -20 main`, not new code. `main`'s HEAD was still `76719ab` (cycle
173's close, PR #482) - PR #483 had not yet merged.

## What this cycle actually did

1. Independently re-ran every gate row 138's Definition of Done names,
   rather than trusting cycles 169-174's reports:
   - `npx vitest run standards/bidlow-deck-out-of-order-headline.test.ts`
     -> **2 passed** (fires-and-names-the-project + stays-quiet-when-in-order).
   - `npm run lint` -> 0 problems.
   - `npm run typecheck` -> 0 problems.
   - `C:\Bidlowprojects\_standards\bidlow-deck.mjs` on disk (grepped in
     full) still carries `export function estateOutOfOrder(live)`,
     `outOfOrderHeadline(ooo)`, the `.headline-ooo` CSS block, and is wired
     into `render()` via `const ooo = estateOutOfOrder(live);` and
     `${outOfOrderHeadline(ooo)}` placed above the `.tiles` row.
   - The dated backup `bidlow-deck.mjs.bak-2026-08-31` is present alongside
     four older, unrelated backups from before this row existed.
   - `docs/ops/DECK-OUT-OF-ORDER-HEADLINE-2026-08-31-cycle169.md` is present.
   All green. No code was written and no redo was needed.
2. Watched PR #483's checks (`gh pr checks 483 --watch`) until both went
   green (`E2E (Playwright)` 6m17s pass, `verify` 6m2s pass), then ran
   `gh pr merge 483 --squash --delete-branch`. `gh` reported it was
   "already merged" - cycle 174 had evidently queued an auto-merge before
   it exited, and it fired the moment CI turned green, moments before my
   own merge command ran. Either way the result is the same and verified:
   `git log --oneline -5 main` and `git ls-remote origin refs/heads/main`
   both show **`10bc6ab`** as the current tip.
3. Recovered cycle 174's uncommitted watcher-footer addendum to
   `cycle-174.md` (stashed before the merge to avoid a checkout conflict,
   popped back onto a fresh branch off the new `main`) and committed it in
   this cycle, matching the precedent cycle 174 itself set for cycle 173's
   leftover footer.
4. Closed row 139 as `WONTFIX 175`. It was not a real item: the relay's
   carry-forward detector split cycle 174's log **mid-sentence** and
   quoted only the fragment "code. If row 138 reopens again after this
   cycle, the next cycle should", which reads as an incomplete instruction
   because it is one. The full sentence in `cycle-174.md` is "...that the
   fix is a restart, not code. If row 138 reopens again after this cycle,
   the next cycle should treat that itself as confirmation the watcher has
   not been restarted, and keep the re-verification to the minimum needed
   to requote the same unchanged commit hash, rather than re-deriving the
   finding from scratch." That instruction is exactly what this cycle did.
   This is the same defect class the relay's own supervisor already closed
   once before, on row 124 (the "not mine to force" fragment) - recorded
   rather than silently dropped, per row 139's own instruction to do one or
   the other.
5. Closed row 138 as `DONE 175`, naming the merge commit and repeating -
   briefly, per cycle 174's own recommendation - the unchanged watcher
   finding rather than re-deriving it from scratch.

## The cause, still unchanged, still not this row's file

`relay-watch.ps1` running a stale in-memory copy of itself is the standing
explanation for why row 138 keeps reopening after being closed on `main`.
It is not fixable from inside this row - row 138 names exactly one file it
may touch under `_standards` (`bidlow-deck.mjs`), and `relay-watch.ps1`
lives in this repo, not there, and is not named by this row either. A
watcher fix is inert until Greg runs `relay-start.cmd` by hand; this is
recorded in `QUEUE.md` and `STATE.md` already and is not repeated in full
here again.

## What "done" means for this cycle, in one sentence

Row 138's headline is live on `main` (`10bc6ab`, confirmed equal to
`origin/main`), proven again by rerunning its own tests and gates; row 139
was a garbled fragment of a finding already acted on, closed `WONTFIX`; the
only outstanding item, unchanged since cycle 172, is a watcher restart,
which is Greg's action, not code.

## Files touched this cycle

- `.bidlow/relay/QUEUE.md` (row 138 -> `DONE 175`; row 139 -> `WONTFIX 175`)
- `.bidlow/relay/log/cycle-174.md` (committing the watcher's own
  end-of-cycle-174 footer, which was appended to the local working copy
  after cycle 174's own commit and had not yet been committed)
- `.bidlow/relay/log/cycle-175.md` (this file)

No other file was changed. `bidlow-deck.mjs`, its backup, and the test file
were read and executed, not edited.
