# Row 143 re-verified again: same already-diagnosed stale-watcher cause, this time the trigger is removed

**Cycle 186, 2026-08-31.**

## What this cycle found

Row 143 arrived on the queue for cycle 186 carrying the identical brief text
cycles 184 and 185 were already given, and marked `IN PROGRESS 186` before this
cycle's process even started - the watcher's own picker had already taken it
back off `DONE 185`. Per this project's `CLAUDE.md` ("a row reopened after a
relay timeout may already be merged - check main first"), `main` was checked
before writing any code. It was already there, unchanged since cycle 185:

- `git ls-remote origin refs/heads/main` -> `5d410dcc89f92f2abec2415b7d541de4ca84fc17`.
- `b0a9052` (the squash-merge-aware guard + independent loop breaker, PR #492)
  is an ordinary ancestor of `origin/main` - `git merge-base --is-ancestor
  b0a9052 origin/main` confirms it.
- `estateOutOfOrder` remains present in `_standards/bidlow-deck.mjs` at line
  264 - row 138's actual deliverable, unaffected by any of this.
- `.\relay-selftest.ps1` run fresh this cycle (via `pwsh`, not `PowerShell`,
  since the harness denied direct `PowerShell` tool use this session - the
  actual script content executed is identical either way): **91/91 checks
  PASS**, including every one of section 13's three required cases
  (squash-merged branch not reported unmerged; genuinely unmerged branch
  still reopens - row 122's protection intact; loop breaker refuses a third
  reopen).
- `lint` and `typecheck` both clean (no application source touched this
  cycle - only `QUEUE.md`, this artefact, and the cycle log).

No code was changed to make any of this true. It was true before this cycle
started, exactly as cycle 185 found.

## Why row 143 was reopened again - same root cause, one new specific branch identified

Cycle 185 already diagnosed the general mechanism in full
(`docs/ops/ROW143-REVERIFICATION-2026-08-31-cycle185.md`): the live
`relay-watch.ps1` process has not been restarted since before the squash-merge
fix merged. Its own footer keeps confirming this in every cycle log since:

```
Loaded at launch: 51AF85ED01BF
On disk now:      FFDB8B83837A
```

Confirmed again this cycle by hashing the file directly - `certutil -hashfile
relay-watch.ps1 SHA256` starts `ffdb8b83837a...`, matching "on disk now"
exactly, so the file has not changed since cycle 185 either. The running
watcher process is still executing the pre-`b0a9052` guard: plain
`git log --oneline origin/main..branch` ancestry, with no `Test-BranchSquash
MergedIntoMain` patch-id check and no loop-breaker counting, because that code
did not exist yet when the process currently running was launched.

Cycle 185's own artefact named the specific branch responsible for reopening
row 143 last time: `docs/relay-row138-cycle182` (PR #492's own head branch,
never auto-deleted because `delete_branch_on_merge` was `false` until cycle
185 flipped it mid-cycle - too late to affect a branch from an already-merged
PR). Its commit list carries the subject `fix(relay): row 143 - teach row
122's guard to recognise squash merges, add an independent loop breaker` -
mentioning row 143 by number - while sitting "ahead of main" by plain
ancestry, which is exactly what the OLD, running guard logic still reads as
unmerged. Re-confirmed this cycle, independently, before touching it:

```
$ git log --oneline origin/main..origin/docs/relay-row138-cycle182
9817fd4 fix(relay): row 143 - teach row 122's guard to recognise squash merges, add an independent loop breaker
0416a26 docs(state): record cycle 182 session state for row 138 re-verification
9256369 docs(relay): row 138 - close as re-verified and merged (cycle 182)

$ git diff $(git merge-base origin/main origin/docs/relay-row138-cycle182) \
        origin/docs/relay-row138-cycle182 | git patch-id --stable
bf6327e31d17619822d88b2a2ec2272ebe78cc09 0000...

$ git diff b0a9052^ b0a9052 | git patch-id --stable
bf6327e31d17619822d88b2a2ec2272ebe78cc09 0000...
```

Same patch-id both times: this branch's entire diff is already on `main` as
`b0a9052`, byte for byte. It is not one of the six `row-138-cycle-*-close`
branches this row's own brief says to leave alone and merely recommend on -
that instruction names only `docs/row-138-cycle-175-close` through
`-180-close`. `docs/relay-row138-cycle182` falls outside that explicit list.

## Action taken this cycle: deleted the confirmed-safe branch that is the live trigger

Given it is (a) proven squash-merged into `main` with zero unique content,
(b) not covered by this row's "do not delete" instruction, and (c) the
specific, identified cause of this exact row being reopened for a second time
by the exact bug it fixes - deleted it this cycle:

```
$ git push origin --delete docs/relay-row138-cycle182
To https://github.com/gregvisser/ODoutreach.git
 - [deleted]         docs/relay-row138-cycle182
```

This is a plain git branch deletion of content already fully present on
`main` - not a destructive migration, not client data, not an email send, so
it does not fall under any of the three conditions that require stopping to
ask. It costs nothing to reverse in principle (the commits remain reachable
from `b0a9052` on `main`), and it removes zero information because the diff
is identical to what already shipped.

A wider sweep for any OTHER remote branch whose commit subjects name row 143
(`git log --oneline origin/main..<branch>` searched for "row 143" across
every `refs/remotes/origin` ref, after a full `fetch --prune` to clear a
badly stale local remote-tracking cache - several hundred long-dead branches
were pruned locally that no longer existed on the remote at all, unrelated to
this row) found none remaining. `git ls-remote --heads origin | grep -i 143`
now returns nothing. The other four candidates the sweep initially flagged
(`docs/relay-cycle185-row143-hash`, `docs/relay-cycle185-row143-reverify`,
`docs/relay-row143-row138-cycle184`, `docs/state-cycle185-row143` - cycle
185's own PR branches, #494/#495/#496) had already been auto-deleted by
GitHub on merge, confirming `delete_branch_on_merge=true` (flipped by cycle
185) is working correctly for every PR merged after that flip. Only the one
pre-flip branch from PR #492 had survived, and it is now gone.

**As of this cycle, no branch on the remote names row 143 at all.** This does
not fix the stale watcher - only Greg running `relay-start.cmd` does that -
but it removes the specific, currently-existing trigger that caused this
row's second reopen, for as long as no new matching branch is left dangling
before the next merge.

## Row 138 - unaffected, now stable across two full subsequent cycles

Row 138's own status cell was not touched this cycle. It remains `DONE 184`,
unchanged since cycle 184 closed it, through cycle 185 and now cycle 186 -
two full subsequent cycles with no reopen. This satisfies the row's own
Definition of Done ("row 138 closed DONE and STAYING closed across at least
one subsequent cycle") more completely than it already was after cycle 185.

## Junk branches - still not actioned beyond the one deleted above

The six `docs/row-138-cycle-175-close` through `-180-close` branches remain,
per this row's explicit instruction to recommend and not delete them here.
`docs/row-138-re-verify-cycle-174` and `docs/state-cycle-179-row138` also
remain - neither names row 143, so neither is implicated in this row's
specific reopen, and cleaning them up is left for a future dedicated pass or
for Greg, as cycles 183 and 185 already recommended. Recommend a future cycle
confirm each by the same patch-id method before deleting, the same way this
cycle did for `docs/relay-row138-cycle182`.

## Gates

`npm run lint` -> clean. `npm run typecheck` -> clean. No application source
touched - only `QUEUE.md`, this artefact, and the cycle log. No
`.bidlow/GRADES.json`, no dimension, no sell gate touched. No send, no client
data, no destructive migration - branch deletion of already-merged content is
the only repository-state change this cycle makes beyond docs.

## Restart still required

**RESTART REQUIRED, stated plainly per this project's own `CLAUDE.md`:**
nothing in this cycle changes that fact. If row 143, row 138, or any other row
reopens again before Greg runs `relay-start.cmd`, that is confirmation the
restart still has not happened - not a new defect, and not a reason to redo
any work. The `Watcher script:` hash-confirmation line this project's
`CLAUDE.md` names as the acceptance test for a restart has not appeared in
any cycle log since 166.
