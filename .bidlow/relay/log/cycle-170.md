# Cycle 170 - row 138 (out-of-order headline on the deck)

## Sweep first

`gh pr list --state open` had exactly one PR: #476 (row 138, opened by cycle
169, branch `feat/row138-out-of-order-headline-cycle169` — the branch this
cycle started on). CI was still `IN_PROGRESS` when this cycle began. No other
PRs to clear.

## What cycle 169 actually did (verified, not assumed)

Cycle 169's log says it ran out of time waiting on GitHub Actions and never
wrote a status. Reading its diff and the working tree directly, before
touching anything:

- Edited `C:\Bidlowprojects\_standards\bidlow-deck.mjs` — confirmed on disk:
  `estateOutOfOrder`, `outOfOrderHeadline`, and the `.headline-ooo` CSS class
  are all present (`grep` at lines 264, 278, 383-391, wired into `render()`
  at line 342/623). This is the only file this row was authorised to touch
  under `_standards`, and it is the only one that changed there.
- Took the required dated backup: `bidlow-deck.mjs.bak-2026-08-31` exists
  alongside the file (confirmed with `ls -la`), pre-dating the edit.
- Opened PR #476 in this repo carrying exactly three files: a red-then-green
  test (`standards/bidlow-deck-out-of-order-headline.test.ts`) that imports
  the real `bidlow-deck.mjs` from its fixed `C:\` path (skips visibly on
  CI, which has no `C:\` drive, rather than passing silently), the
  `vitest.config.ts` include-glob change needed to run it, and a full
  before/after artefact at
  `docs/ops/DECK-OUT-OF-ORDER-HEADLINE-2026-08-31-cycle169.md` with the
  actual rendered HTML from a real run against the real estate (5 of 8
  projects flagged, matching the row's own "BUILD 7/8, ASK 2/8" shape) and
  the red-then-green test transcript.
- Ran lint (0), typecheck (0), and the full suite (367 files / 3815 tests,
  +1 file / +2 tests over baseline) before opening the PR — all recorded in
  the artefact.

I did not redo this work. It matches the brief: display-only, one file under
`_standards`, dated backup, wording that reads "building ahead of its own
questions", quiet on an in-order project (test 2 asserts `null`), and a
correct, stated answer to "does the deck have a test harness" (no — so the
tests live in this repo, importing the real file, not a copy).

## What this cycle did

The only thing cycle 169 left undone was watching CI through to merge.

- `gh pr checks 476 --watch` — both checks (`verify`, `E2E (Playwright)`)
  went from pending to `pass` (verify 5m37s, E2E 5m30s).
- `gh pr merge 476 --squash --delete-branch` — squash-merged, remote branch
  deleted.
- `git ls-remote origin refs/heads/main` → `3b6300eb8c87f7d1a249931a3f4d1cbcd82e9f0e`
  — this is the merge commit hash, confirmed on `origin/main`.
- `gh pr list --state open` after the merge → empty. No PRs left to sweep.
- Pulled `main` locally, re-ran `npm run lint` and `npm run typecheck` on the
  merged tree directly (not just trusting CI's report): both 0 problems.
- Updated row 138 in `QUEUE.md` from `IN PROGRESS 170` (set automatically
  when this cycle picked the row up) to `DONE 170`, naming the merge hash
  and what was verified.

## What I did NOT touch

No other file under `_standards`. No other project's `.bidlow/` files,
grades, or generated deck output. No schema, no migration, no email, no
client data. This cycle's only repo writes are `QUEUE.md` (this row) and
this log file.

## Hard rule

No email sent, no data deleted, for any client. This cycle watched CI,
merged a PR, and updated the queue.

Files touched this cycle: `.bidlow/relay/QUEUE.md` (row 138 status),
`.bidlow/relay/log/cycle-170.md` (this file). Everything else was cycle
169's work, verified rather than repeated.
