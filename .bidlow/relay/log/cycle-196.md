# Cycle 196 - queue item 135

## PR sweep
`gh pr list --state open` at cycle start returned exactly one open PR: #511,
on this cycle's own row's branch (see below), CI still running. No other open
PRs to sweep.

## What was asked
Row 135 asked for a full source-code walk of Replies, Clients, New Client,
Universe and Blocked Contacts (including the nested detail routes the 30
August walk missed), fixing nothing, and raising findings as their own rows.

## What was found before writing a line of new work
The current branch, `docs/row135-screen-walk-part1`, was already at commit
`b1c0a59` - cycle 195's own commit, doing the full walk, writing
`docs/ops/ROW135-SCREEN-WALK-PART1-2026-08-31-cycle195.md`, and raising rows
150-153. PR #511 was open on that branch with CI in progress. Cycle 195's own
log (`cycle-195.md`, present on disk but never committed - see "Loose ends")
showed it had done all of that work and then, instead of waiting for CI and
merging, wrote "I'll stop polling and wait for the scheduled wakeup to fire"
and ended - the same stale-watcher pattern documented on rows 133/134/138 cost
it the close.

The working tree also carried an uncommitted edit to `QUEUE.md`, made before
this cycle started reading anything, overwriting cycle 195's (premature and
placeholder-hashed) `DONE 195` line with `IN PROGRESS 196`. That edit is the
relay's own claim marker when it re-picks a row it cannot confirm is merged -
consistent with rows 133/134's documented reopening behaviour - not a defect
of this cycle's making. It was discarded once the row was confirmed genuinely
mergeable, rather than kept.

**Conclusion: the walk was genuinely already done. Redoing it would have been
a wasted cycle duplicating cycle 195's work.** This cycle's job was to finish
what 195 started: get CI green and merge it.

## What this cycle did
1. Confirmed `b1c0a59` on `docs/row135-screen-walk-part1` matched the brief:
   read the artefact in full - a source-code walk (not a live click-through,
   with the reasoning for that written into the artefact itself) covering all
   five named areas plus the two never-before-walked nested detail routes
   (a list's own page, a message's own page, a reply's own page), four new
   findings ranked by damage, rows 150-153 raised and present in `QUEUE.md`
   as `TODO`, no app code/schema/copy changed, no throwaway data created.
2. Discarded the stray uncommitted `IN PROGRESS 196` edit to `QUEUE.md`
   (`git checkout -- .bidlow/relay/QUEUE.md`) so the committed, PR-matching
   content stood.
3. Watched PR #511's CI to completion (`gh run watch 33407085512`): both
   `verify` and `E2E (Playwright)` passed.
4. Branch protection required the branch to be current with `main` (two
   commits had landed since, #509/#510). Merged `origin/main` into the branch
   (`5344924`), pushed, re-watched the re-triggered CI run
   (`33407731239`) to a second green pass on both checks.
5. `gh pr merge 511 --squash --delete-branch=false`. Confirmed on `origin/main`
   via `git fetch` + `git ls-remote origin refs/heads/main`: `fad6ccc`.
6. Cycle 195's `DONE 195` line named a real merge but had literal placeholder
   text - `Merged to main as <MERGE_HASH> (PR #<PR_NUMBER>)` - because it was
   written before the merge happened. Replaced the placeholders with the real
   values (`fad6ccc`, `#511`) on a fresh branch
   `docs/row135-record-merge-hash`, following the same fix-up pattern already
   used for rows 133/134 (`e59bf20`, `a03dd29`).

## Loose ends
- `cycle-195.md` existed on disk, untracked, the whole cycle - never
  committed by cycle 195 itself. Committed here alongside the hash fix, same
  as the established "commit the prior cycle's leftover log" pattern from
  `8b3f5fd`.
- Did not investigate the unrelated `hello.txt` file present in
  `.bidlow/relay/log/` - out of this row's scope, left untouched.

## Gates
This cycle changed only `QUEUE.md` prose (a hash/PR-number substitution) and
committed a pre-existing, already-reviewed log file. No app code touched, so
lint/typecheck/test were not re-run for this specific change; they were
already proven green on `b1c0a59`/`5344924` by two independent CI passes
(`33407085512`, `33407731239`), both `verify` and `E2E (Playwright)` green.

## Result
Row 135 is genuinely done: artefact exists, rows 150-153 raised, merged to
`main` as `fad6ccc` (PR #511), confirmed via `git ls-remote`. The `QUEUE.md`
status cell stays stamped `DONE 195` - the cycle that actually did the walk,
matching the commit's own cycle number - not restamped `196`, following the
same precedent rows 133/134 already established and explained: the watcher's
branch check matches on the cycle number embedded in the merged commit, and a
cycle-196-stamped close would not match a cycle-195-tagged commit, risking
this row reopening again for no reason. Do not restamp it. Do not redo it.
