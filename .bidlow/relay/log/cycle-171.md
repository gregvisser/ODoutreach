# Cycle 171 - row 138 (out-of-order headline on the deck)

## Sweep first

`gh pr list --state open` returned nothing. No PRs to clear.

## The row was already done — check main first

Row 138 arrived marked `IN PROGRESS 171` in the local working copy of
`QUEUE.md`. Per this repo's own `CLAUDE.md` guidance ("A row reopened after a
relay timeout may already be merged — check main first"), the first action
was `git log --oneline -10 main`, not new code.

That immediately showed the row was already closed:

```
ae34785 docs(state): record cycle 170 session state for row 138 merge (#478)
5fe6cd3 docs(relay): row 138 - merge out-of-order deck headline, close the row (#477)
3b6300e feat(ops): row 138 - surface out-of-order work as a deck headline (#476)
```

`git ls-remote origin refs/heads/main` returned `ae347852d58ad778dc871f8e18980a9251c341cf`,
matching local `HEAD` exactly — local `main` is not behind. `git show
HEAD:.bidlow/relay/QUEUE.md` for row 138 already read `DONE 170 - ...` with
the merge hash `3b6300eb8c87f7d1a249931a3f4d1cbcd82e9f0e` named and the
verification cycle 170 did. So the `IN PROGRESS 171` text existed only as an
**uncommitted local edit** on top of an already-correct committed file — cause
not established (does not match a 45-minute relay-watch timeout; cycle 170's
own watcher-appended record shows it exited cleanly after 17.1 minutes), but
the shape is the same defect class this repo has already named: a reopened
row whose underlying work was never actually undone.

## What I verified independently, not by trusting the log

Rather than take cycle 170's log at its word, I re-ran the proof myself:

- `C:\Bidlowprojects\_standards\bidlow-deck.mjs` on disk carries
  `estateOutOfOrder` (line 264), `outOfOrderHeadline` (line 278), the
  `.headline-ooo` CSS block (lines 383-391), and it's wired into `render()`
  (`${outOfOrderHeadline(ooo)}` at line 623) — confirmed with `grep`, not
  assumed. This is the only file under `_standards` this row named, and the
  only one that changed there.
- The dated backup `bidlow-deck.mjs.bak-2026-08-31` exists alongside it,
  timestamped before the edit.
- `npx vitest run standards/bidlow-deck-out-of-order-headline.test.ts` — ran
  it myself: **2 passed**. This test imports the real `C:\Bidlowprojects\_standards\bidlow-deck.mjs`
  by its fixed path (skips visibly on CI, which has no `C:\` drive, rather
  than passing silently) and asserts both halves of the brief for real:
  `estateOutOfOrder` fires and names the project when a later stage is done
  ahead of an earlier open one, and returns `null` — adds nothing — when
  every project is in order.
- `npm run lint` on this tree: 0 problems.
- `npm run typecheck` on this tree: 0 problems.
- `docs/ops/DECK-OUT-OF-ORDER-HEADLINE-2026-08-31-cycle169.md` exists (176
  lines) — before/after rendered HTML and the file list.

Everything the brief's Definition of Done asks for is present and provably
working on `main` right now. Redoing it would have been pure waste and, per
this repo's own recorded incident (cycle 125 / row 101, 30 August), the exact
mistake this guidance exists to prevent.

## What this cycle did

- Corrected the local, uncommitted `QUEUE.md` regression: row 138's status
  cell had reverted to `IN PROGRESS 171` on disk while the committed file
  already said `DONE 170`. Replaced it with a `DONE 171` entry that names
  what was independently re-verified this cycle, so the record shows this
  cycle checked rather than skipped the row.
- Restored `.bidlow/relay/log/cycle-170.md`'s watcher-appended footer, which
  was present on disk but never committed (same pattern as cycle 169's log,
  which was committed alongside the row-close PR #477) — otherwise that half
  of the record would have been lost.
- Wrote this log.

## What I did NOT touch

No file under `_standards` — this row's authorised file was already correct
and needed no further edit. No other project's `.bidlow/` files, grades, or
generated deck output. No schema, no migration, no email, no client data. No
new code in `bidlow-deck.mjs` — the existing merged change already satisfies
the brief.

## Hard rule

No email sent, no data deleted, for any client. This cycle read git history,
ran existing tests/lint/typecheck, and corrected a queue-file regression.

Files touched this cycle: `.bidlow/relay/QUEUE.md` (row 138 status),
`.bidlow/relay/log/cycle-170.md` (restored the watcher's footer),
`.bidlow/relay/log/cycle-171.md` (this file).
