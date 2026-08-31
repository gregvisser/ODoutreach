# Cycle 167 - row 131 (reopened after a timeout; verified, not redone)

## PR sweep

`gh pr list --state open` returned one PR: #472 (`docs(relay): sync Cowork's
row 137 into QUEUE.md`), CI green (verify + E2E Playwright both passed),
`MERGEABLE`/`CLEAN`. Squash-merged as `e02ef4288d64f5b0733688e827cd472c71e78d1b`,
confirmed on `origin/main` via `git ls-remote origin refs/heads/main`.

## What this row actually was

Row 131 read `IN PROGRESS 167` at the top of this cycle, with no content -
the shape this project's own `CLAUDE.md` names explicitly: *"A row reopened
after a relay timeout may already be merged - check `main` first."* Before
writing any code, checked `git log` and `.bidlow/relay/QUEUE.md`'s own
committed history for row 131's number.

**It was already done.** `origin/main` (`1846552`, `#470`) already carried a
full `DONE 166` entry for this row, naming merge commit `dab2699` (PR #469,
squash-merged) as the fix, and `cba37ce` (`#471`) had synced further Cowork
rows on top of it since. The uncommitted local working tree, however, showed
row 131 rewritten to `IN PROGRESS 167` with no proof and
`.bidlow/relay/log/cycle-166.md` carrying a freshly appended watcher kill
record: a **second** dispatch, also labelled cycle 166, had spent 45 minutes
re-doing this already-finished row and was killed at the timeout deadline.
That kill record names its own cause: **the watcher process is running a
stale copy of its own script** - `Loaded at launch: 51AF85ED01BF`, `On disk
now: E97F4D42A323`. This is row 52's known defect (documented at length in
`.bidlow/relay/RESTART-REQUIRED.md`) recurring - and it is the same defect
row 131's own `DONE 166` text had already warned about under a different
hash pair, so this is at least the second time it has cost a full cycle.

## Verification performed (not a redo)

- `git merge-base --is-ancestor dab2699 origin/main` -> true, both before and
  after clearing PR #472 (now against `e02ef42`).
- Ran `relay-selftest.ps1` directly, fresh, against the current working
  tree: **83/83 checks green**, including all 9 section-12 assertions row
  131 added (the harness-crash-vs-genuine-failure split).
- `docs/ops/SELFTEST-HARNESS-VS-FAILURE-2026-08-31.md` is present and intact,
  267 lines.
- Confirmed the corrected QUEUE.md row 131 text still parses as a valid
  `DONE` row against the real `$QueueRowPatternStrict`/`$QueueRowPatternLoose`
  regex pair copied out of `relay-watch.ps1` (not eyeballed) - matched, status
  group read back as `DONE 166 - ...`.

No code in `relay-selftest.ps1` or `relay-watch.ps1` was touched this cycle.
The brief's four deliverables (fix committed, throw-vs-fail behaviour
implemented and reasoned, two new self-test cases proven red without the
change, merged to `main` with the hash confirmed) were all already true and
already evidenced in row 131's own `DONE 166` text and in
`docs/ops/SELFTEST-HARNESS-VS-FAILURE-2026-08-31.md`. Redoing them would have
produced no new information and risked drifting from the already-verified
fix.

## What changed on disk this cycle

- `.bidlow/relay/QUEUE.md`: row 131 restored to its true `DONE 166` text,
  with a dated cycle-167 addendum recording the reopen, the stale-watcher
  cause, and the fresh verification (so a future cycle that meets this row
  again does not have to re-derive any of this).
- `.bidlow/relay/log/cycle-166.md`: the watcher's own kill record for the
  second, erroneous dispatch is kept as-is - it is an accurate, independently
  written record of what happened and is this project's evidence trail, not
  mine to edit.

## The hard rule

No email sent, no data touched, for any client. This cycle only read
history, ran a local self-test, and corrected a status cell plus a log file.

## Restart still owed - said plainly, again

**This is not new work, it is the same fact recurring.** The watcher that
picked up cycle 166/167 is still executing code from before row 131's own
fix landed (confirmed by the kill record's own hash mismatch above), so a
future self-test harness crash on Greg's machine will be treated exactly as
before row 131 - a bare non-zero exit refusing to start - until he runs
`relay-start.cmd`. Nothing here changes that; if anything, this cycle is
itself the second cost of not having restarted yet. See
`.bidlow/relay/RESTART-REQUIRED.md` for the running history of this same
defect on rows 52 and 81.

## Gates

- `npm run lint` / `npm run typecheck` / `npm test` - not run this cycle;
  no application code, PowerShell relay script, or test file was touched.
  Only `.bidlow/relay/QUEUE.md` (docs) and this log changed.
- `relay-selftest.ps1` - run directly, 83/83 green (see above).

## Merge

PR opened from `docs/row131-correct-stale-reopen-cycle167` against `main`,
docs-only (QUEUE.md status correction + this log + cycle-166's own
watcher-written kill record). Merge commit hash to follow once CI is green
and the merge completes.
