# Cycle 128 - queue item 103

## What it was asked to do

Row 103: a cycle killed at the 45-minute deadline can have its work merged and
its row reopened anyway, and the next cycle then redoes work that is already on
`main`. Cycle 125 finished row 101 and its PR merged as `#420`, but the timeout
fired before it could write `DONE 125`; the orphan-reopen wrote a bare
`TODO (reopened...)` and told cycle 126 nothing about the merged work. Fix the
watcher so a merged, timed-out row is reopened with a warning instead of a bare
TODO, without ever letting the watcher decide a row is DONE itself, and write
the standing rule into `RELAY-README.md` and `CLAUDE.md` because the code fix is
inert on any watcher process already running.

## What it did

**Queue sweep first.** One open PR, `#422` (row 102, branch
`docs/row102-reply-matcher-measurement`). Both CI checks were pending at the
start of the cycle; watched them go green (`verify` 5m22s, `E2E (Playwright)`
4m4s) and merged it (squash), then deleted the remote branch. No other open PRs.

**Read the two orphan-reopen paths** in `relay-watch.ps1` and quoted the exact
lines - the startup path (in the "ORPHANED IN PROGRESS ROWS ARE REOPENED AT
STARTUP" block) and the mid-run path (in the "A CYCLE THAT ENDED BADLY MUST
GIVE ITS ROW BACK" block). Both called `Set-QueueRowStatus` with a hand-built
`"TODO (reopened...)"` string and asked nothing first.

**Added two new pure functions plus one I/O wrapper**, placed before the
`-LoadOnly` early return so `relay-selftest.ps1` can drive them directly:

- `Test-RowNumberMergedInLog($LogText, $RowNumber)` - pure regex match,
  `\brow\s*<N>\b`, case-insensitive, anchored both sides so row 10 can never
  match inside "row 100".
- `Test-RowMergedOnMain($RowNumber, $RepoPath)` - runs
  `git log --oneline -300 main` and hands the text to the matcher above.
- `Get-OrphanReopenStatus($CycleNumber, $ReasonSuffix, $MergedOnMain)` - the
  one decision: `PARTIAL <cycle> - work may already be merged, VERIFY main
  BEFORE redoing (<reason>)` when merged, otherwise the original bare
  `TODO (<reason>)`. It has no third branch, and it never returns DONE.

Both reopen call sites now call `Test-RowMergedOnMain` before building the
status string and use `Get-OrphanReopenStatus` to build it, keeping every word
of the original reopen note.

**Red-first, honestly.** Wrote the new self-test section 8 in
`relay-selftest.ps1` FIRST, against real commit subjects from this repo's own
`git log` (the row-100 and row-101 landing commits). To prove it would fail
before the fix existed - not just assert that it should - `git stash push --
relay-watch.ps1` was used to remove the just-written implementation, leaving
only the test. Ran `relay-selftest.ps1`:

```
Test-RowNumberMergedInLog : The term 'Test-RowNumberMergedInLog' is not
recognized as the name of a cmdlet, function, script file, or operable
program.
```

Confirmed red. Ran `git stash pop` to restore the implementation, ran the
self-test again: section 8 passed all 8 new checks, self-test total went from
35 to 43. Full transcript of both runs, and the row's other before/after lines,
are in `docs/ops/RELAY-ORPHAN-REOPEN-VERIFY-MERGED-2026-08-30.md`.

**Wrote the standing rule in two places**, because the code fix does nothing
for a watcher process that is already running (PowerShell reads a script once
at launch - queue row 52's lesson): a new paragraph in `RELAY-README.md` under
"1. A stuck cycle gets 45 minutes, then it is killed", and a new section in
`CLAUDE.md`, "A row reopened after a relay timeout may already be merged -
check `main` first". Both say the same thing in different registers: if a row
was reopened after a timeout, `git log --oneline -10 main` for that row's
number is the first action, before any code, and if the merged work satisfies
the brief, verify and close it rather than redoing it.

**Gates, run and shown:**

- `npm run lint` - 0 problems.
- `npx tsc --noEmit` - 0 errors.
- `npm test` - first run surfaced ONE failure:
  `relay/cycle-log-reaches-git.test.ts` correctly caught that
  `.bidlow/relay/log/cycle-127.md` (written by cycle 127, never committed) was
  untracked. Per that test's own message and this repo's established
  convention, `git add .bidlow/relay/log/cycle-127.md` and reran - green.
  Full suite: 349 files, 3661 tests, all passing.
- `.\relay-selftest.ps1` - 43/43 checks green.

**QUEUE.md row 103** stamped `DONE 128` with the evidence summary; verified by
loading `relay-watch.ps1 -LoadOnly` and reading the row back through
`Get-QueueRows` to confirm it still parses (`Parsed=True`,
`StatusStart=DONE 128 - both orphan-reopen paths in...`).

**Branch and PR:** work was carried on `docs/row102-reply-matcher-measurement`
until `#422` merged, then moved to a fresh branch off updated `origin/main`,
`fix/relay-orphan-reopen-verify-merged-row103`, and pushed. PR opened and
merged (squash) once CI was green, per the standing merge-is-yours rule - none
of this touches a migration, client data, or a real send.

**Left alone, correctly:** an untracked file at the repo root,
`ODOUTREACH-PROJECT-INSTRUCTIONS.md`, sits outside this row's scope and outside
any queue item found this cycle. It was not touched, added, or deleted.

## Part 1 is inert tonight - said plainly, as row 103 requires

The `relay-watch.ps1` change (the `Test-RowMergedOnMain` /
`Get-OrphanReopenStatus` fix) is **INERT on any watcher process that is
currently running**. PowerShell reads a script once at launch and runs from
memory - queue row 52's own lesson, restated in this file's
`Get-StaleWatcherNote`. If a watcher process was started before this merge, it
is still running the OLD reopen code and will still write a bare TODO on the
next orphaned or timed-out row, until it is stopped and `relay-start.cmd` is
run by hand. This cycle did **NOT** restart the watcher - row 103 explicitly
forbids that. The documentation half (`RELAY-README.md` and `CLAUDE.md`) is
what protects tonight instead: it is read by a cycle immediately, regardless of
which code the watcher process itself is running.
