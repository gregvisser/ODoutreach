# Cycle 163 - row 122

## Files changed

`relay-watch.ps1` and `relay-selftest.ps1` only, per the brief's own scope
line. No app code, no `.bidlow/GRADES.json`, no readiness verdict.

## The red-first test

`relay-selftest.ps1` section 11, two new pure-decision cases plus a real
scratch-git-repo pair, driving new functions `Find-UnmergedPushedBranchForRow`
and `Get-DoneWithUnmergedBranchStatus`. Watched RED first: `git stash push --
relay-watch.ps1` (leaving the new selftest assertions in place with none of
the new functions defined), reran `relay-selftest.ps1`, and it failed
immediately -

    Get-DoneWithUnmergedBranchStatus: ...relay-selftest.ps1:628
    The term 'Get-DoneWithUnmergedBranchStatus' is not recognized as a name
    of a cmdlet, function, script file, or executable program.

- before any of section 11's own assertions could even run. `git stash pop`
restored the fix; full self-test reran green, 74 checks (up from 68 before
this row - the six new PASS lines under section 11 in the transcript below
account for the rise the brief asks for).

## What "done" looks like

A cycle that closes its own row DONE while a pushed branch for that row sits
ahead of `origin/main`, unmerged, no longer stays silently closed - the
watcher rewrites it to PARTIAL and names the branch, so the next cycle picks
it back up and finishes the merge instead of the work sitting on a branch
forever, which is what actually happened to row 114/cycle 154 (PR #451) on 30
August.

## What must NOT be touched

Anything outside `relay-watch.ps1` / `relay-selftest.ps1`; `.bidlow/GRADES.json`;
any dimension score; `docs/ops/TUESDAY-READINESS-MEASUREMENT-2026-08-30.md`.

## What it did

**FIRST, the PR sweep.** `gh pr list --state open` showed exactly one open
PR: #461 (row 127's BOM fix, on the branch this cycle inherited: cycle 162
had committed and pushed it, written `DONE 162`, and ended - its own log said
plainly it was waiting on CI and would merge once green, with nothing left
running to do that. **This is row 122's own defect, caught live, on the very
branch this cycle started from**, before a single line of row 122's own fix
existed.) CI was still in progress when checked; it also turned out cycle
162's own log file, `.bidlow/relay/log/cycle-162.md`, was sitting untracked
in the working tree - the previous cycle wrote it but never committed it,
which `relay/cycle-log-reaches-git.test.ts` exists to catch and did, the
moment `npm test` ran. Committed it (`342acf0`, alongside the still-open
branch, since it documents that cycle's own session and the BOM-restoring
pre-commit hook was already active on that branch to protect QUEUE.md while
doing it), pushed, waited for CI, and merged #461 by hand once green -
exactly the human action row 122 exists to make automatic. Confirmed on
`origin/main` before starting row 122's own work.

**THEN row 122 itself**, on a fresh branch off the now-updated `origin/main`
(`fix/row122-unmerged-done-guard`), carrying forward only the uncommitted
`relay-watch.ps1` / `relay-selftest.ps1` diff already in the working tree
(unrelated to row 127's files, so no conflict).

Added two functions to `relay-watch.ps1`, placed directly beside row 121's
own DONE-without-merge guard and reusing its `Test-RowNumberMergedInLog`
matcher rather than inventing a second mechanism, as asked:

- `Find-UnmergedPushedBranchForRow` (I/O) - fetches `origin`, walks every
  `refs/remotes/origin/*` branch, keeps only ones with at least one commit
  ahead of `origin/main`, and checks whether the row number appears in either
  the branch's own name (this repo's convention, e.g. `fix/row127-queue-bom`)
  or its commit subjects - reusing the exact anchored `\brow\s*N\b` matcher
  row 103's orphan-reopen check already relies on, so "row 12" can never
  false-match inside "row 122".
- `Get-DoneWithUnmergedBranchStatus` (pure decision) - given a found branch
  name, rewrites `DONE <cycle> - ...` to
  `PARTIAL <cycle> - closed DONE but branch '<name>' is pushed ahead of
  origin/main and was never merged, ... Original: <original text>`; given no
  branch, returns the status unchanged.

Wired both into the existing cycle-end block (the one that already runs
`Test-RowDefinitionOfDoneDemandsMerge` / `Get-DoneWithoutMergeStatus` against
the cycle's own just-closed row): the new branch check runs FIRST, and only
if it finds nothing does control fall through to the existing demands-a-merge
check, unchanged. This is deliberate and is the actual gap row 122 names:
row 114's own brief allowed an artefact-only close ("that is a complete
answer"), so `Test-RowDefinitionOfDoneDemandsMerge` correctly returns
`$false` for it and the old check never even looks - but row 114 still had
real code pushed and unmerged on a branch, which the old check was never
built to ask about at all. The new check asks a different, narrower
question - "is there a pushed branch naming this row, ahead of main" - and
does not care whether the row's own brief demanded a merge, so it catches
exactly this shape without disturbing row 121's carve-out for genuinely
artefact-only rows with nothing pushed.

**Proof it fires**, beyond the pure-decision cases the brief asked for by
name: section 11 also builds a real scratch git repository with a real bare
`origin` remote (`git init --bare`, not a mock), pushes a branch genuinely
ahead of `main` whose own commit message names row 122, and asserts
`Find-UnmergedPushedBranchForRow` actually finds it by walking real git -
then merges that branch into `main`, pushes, and asserts it stops being
found, which is the exact moment row 121's own carve-out must take back over.
A row number the branch does not mention is confirmed not found. All three
are genuine git operations against a throwaway repo under `$env:TEMP`,
cleaned up after.

## Gates

- `npm run lint` - 0
- `npm run typecheck` - 0
- `npm test` - 3758/3758 passed. Two Sentry tests
  (`src/instrumentation.test.ts`, `src/lib/monitoring/sentry-config-wiring.test.ts`)
  timed out once under full-suite parallel load and passed cleanly in
  isolation on the same run - a known flake class (network-call timeouts
  under contention), unrelated to `relay-watch.ps1`/`relay-selftest.ps1`, and
  not touched by this row.
- `npm run build -- --webpack` - succeeded.
- `relay-selftest.ps1` - 74/74 checks, red-first proven per above.

## Merge

PR #461 (row 127's BOM fix, this cycle's own PR-sweep merge, including this
cycle's own committed log file): squashed to `5f96977` on `origin/main`.

PR #462 (row 122 itself): squashed to `e7935b6` on `origin/main`, confirmed
with `git ls-remote origin refs/heads/main`:

    e7935b6d3be7b822a3a53a374ec1a40f14848ed6	refs/heads/main

## Scope discipline

Did not touch `.bidlow/GRADES.json`, any dimension score, or
`docs/ops/TUESDAY-READINESS-MEASUREMENT-2026-08-30.md`. Did not touch
`.githooks/pre-commit`, `scripts/relay/ensure-queue-bom.mjs`, or anything
else row 127 owns - that PR was merged as-is, untouched, before this row's
own work began. Did not touch `C:\Bidlowprojects\_standards` or any sibling
client folder.

**One thing worth naming rather than fixing here**: an untracked file,
`ODOUTREACH-PROJECT-INSTRUCTIONS.md`, sits at the repo root - draft Claude
Project instructions, referencing `C:\Bidlowbusiness\_odoutreach-handover\`.
Per the repository-boundary rule (decks, briefs and handover artefacts live
in `C:\Bidlowbusiness`, not in a client's code repository), this does not
belong here and this row did not add it. Left untouched rather than deleted -
it may be someone's in-progress draft - and flagged here rather than acted on,
since it is outside the files this row named.

**Also worth naming**: cycle 162's own log recorded that the watcher is
running a STALE copy of itself (loaded `B9E192203DEB`, on-disk `3118106EFA98`
at that time) and that `relay-start.cmd` needs to be run by hand to pick up
every merge since. That is still true after this row's own merge -
`relay-watch.ps1` changed again in this row, so **this fix is also INERT
until Greg restarts the watcher.** Nothing in this row's own work depends on
the running watcher already having row 121's or row 103's code active, so it
is safe to sit unrestarted for a while, but the newly-added guard will not
actually run mid-relay until that restart happens.
