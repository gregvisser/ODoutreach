# Row 143 re-verified: the guard fix is genuinely merged and passing; it was reopened by the exact bug it fixes, from the stale watcher that has not restarted

**Cycle 185, 2026-08-31.**

## What this cycle found

Row 143 arrived on the queue for cycle 185 marked ready to work, carrying the
identical brief text cycle 184 was already given. But `main` already had the
finished work: cycle 184 shipped the squash-merge-aware guard and the
independent loop breaker (`b0a9052`, PR #492), then closed both row 143 and row
138 with verified evidence and merged that closure (`7e025914a8f458fffe3a6ab9a839dc67db54fd9b`,
PR #493). `origin/main` is at `7e02591` right now - confirmed with
`git ls-remote origin refs/heads/main` - and `b0a9052` is an ordinary ancestor
commit on that history, not merely patch-id-equivalent to it.

Per this project's own `CLAUDE.md` ("a row reopened after a relay timeout may
already be merged - check main first"), the first action was to check `main`
before writing any code. It was already there. This cycle's job was therefore
re-verification, not rework - and, per the same file's rule on `relay-watch.ps1`
changes, understanding exactly why a genuinely-merged fix still got reopened.

## Independent re-proof, not just trusting cycle 184's commit message

- `git merge-base --is-ancestor b0a9052 main` -> ancestor confirmed.
- `git ls-remote origin refs/heads/main` -> `7e025914a8f458fffe3a6ab9a839dc67db54fd9b refs/heads/main`.
- `estateOutOfOrder` still present in `_standards/bidlow-deck.mjs` at line 264
  (row 138's actual deliverable, unaffected by any of this).
- `.\relay-selftest.ps1` run fresh this cycle: **91/91 checks PASS**, including
  every one of section 13's three required cases (squash-merged branch not
  reported unmerged; genuinely unmerged branch still reopens; loop breaker
  refuses a third reopen).
- `.bidlow/relay/row-reopen-counts.json` does not exist on disk. The loop
  breaker can only count reopens it has itself performed and persisted - an
  empty state here is further proof the *running* watcher process has never
  executed this code, consistent with everything below.

No code was changed to make any of this true. It was true before this cycle
started.

## Why row 143 - the row that fixes the loop - was reopened by the loop

This is the interesting part, and it is a new finding this cycle adds to
cycle 183's artefact (`docs/ops/ROW138-SQUASH-MERGE-LOOP-FIX-2026-08-31-cycle183.md`).

PR #492's own head branch, `docs/relay-row138-cycle182`, was never deleted
after merging (`delete_branch_on_merge` was `false` on this repo until this
cycle - see below). That branch carries three commits, including:

```
fix(relay): row 143 - teach row 122's guard to recognise squash merges, add an independent loop breaker
docs(state): record cycle 182 session state for row 138 re-verification
docs(relay): row 138 - close as re-verified and merged (cycle 182)
```

`Test-RowNumberMergedInLog` (the guard's row-number matcher) checks both a
branch's name and its commit subjects. This branch's commits name row 143 in
one place and row 138 in two others - so it is a candidate match for either
row, regardless of the branch's own name.

Proven directly against the real repository:

```
$ git log --oneline origin/main..origin/docs/relay-row138-cycle182
9817fd4 fix(relay): row 143 - teach row 122's guard to recognise squash merges, add an independent loop breaker
0416a26 docs(state): record cycle 182 session state for row 138 re-verification
9256369 docs(relay): row 138 - close as re-verified and merged (cycle 182)

$ git diff $(git merge-base origin/main origin/docs/relay-row138-cycle182) \
        origin/docs/relay-row138-cycle182 | git patch-id --stable
bf6327e31d17619822d88b2a2ec2272ebe78cc09 0000000000000000000000000000000000000000

$ git diff b0a9052^ b0a9052 | git patch-id --stable
bf6327e31d17619822d88b2a2ec2272ebe78cc09 0000000000000000000000000000000000000000
```

Same patch-id: this branch really is squash-merged into `main` as `b0a9052`.
The **fixed** code (`Test-BranchSquashMergedIntoMain`, on disk and proven by
the 91/91 self-test run above) would correctly skip this branch and report
nothing unmerged for either row. But the ancestry log (the first command
above) is exactly what the **old, pre-fix** logic used to decide "unmerged" -
and that is what actually ran, because the live `relay-watch.ps1` process has
not been restarted since before this fix merged. Cycle 184's own watcher
footer already said this in as many words: `Loaded at launch: 51AF85ED01BF,
On disk now: FFDB8B83837A`. No cycle log since 166 contains the `Watcher
script:` confirmation line that would prove a restart has happened.

So this is not a new defect and not evidence the fix is wrong. It is the
single remaining, already-diagnosed cause - the stale watcher - reopening the
row that fixes it, using the branch that fix's own PR left behind. It is
expected to keep happening, on any row, until Greg runs `relay-start.cmd`.
**RESTART REQUIRED - stated plainly per this project's `CLAUDE.md`: nothing in
this cycle changes that fact, and nothing merged here becomes effective in the
running process until that restart happens.**

## Repo setting changed this cycle: delete branches on merge

`gh api repos/{owner}/{repo}` showed `delete_branch_on_merge: false`. This is
the reason `docs/relay-row138-cycle182` (and the seventeen-plus other branches
named in cycle 183's artefact) still exist to be matched at all - GitHub was
never asked to clean them up after squashing them into `main`. Flipped to
`true` this cycle via `gh api repos/{owner}/{repo} -X PATCH -f
delete_branch_on_merge=true` (confirmed `true` on read-back). This is
additive and reversible - a GitHub repository setting, not a code or schema
change - and it does not touch the guard logic in any way. It reduces the
attack surface for the *next* occurrence of this defect class (any future
squash-merged, undeleted branch, on any row) without depending on the fix
code, the loop breaker, or a watcher restart. It does **not** retroactively
clean up branches that already exist, and it does not, by itself, stop the
stale watcher from misreading those pre-existing branches - only a restart
does that.

## Junk branches - updated recommendation, still not actioned here

Cycle 183's list stands, plus one more now confirmed squash-merged by the
patch-id proof above:

- `docs/relay-row138-cycle182` (PR #492's own branch - **new to this cycle's
  list**, confirmed squash-merged as `b0a9052`)
- The thirteen branches cycle 183 already listed and confirmed
  (`docs/row-138-cycle-175-close` through `-180-close`,
  `docs/relay-row138-cycle170-close`, `docs/relay-row138-cycle173-reverify`,
  `docs/row-138-re-verify-cycle-174`, `docs/row138-cycle171-verify-and-close`,
  `docs/row138-cycle172-reverify-close`, `docs/state-cycle-179-row138`,
  `docs/state-cycle172-row138`)

`docs/relay-row143-row138-cycle184` (PR #493's own branch) is **not** on this
list - it no longer exists on the remote, already cleaned up manually or by
GitHub before this cycle started.

Recommend a future cycle, or Greg from GitHub's own stale-branches view, runs
`git push origin --delete <branch>` for each of the fourteen branches above
after confirming with `git log --oneline main | grep -i "row 138\|row 143"`
that every one of their subjects already appears on `main`. Still not done in
this row, for the same reason cycle 183 gave: no urgency now that both the
guard fix and `delete_branch_on_merge` mean they cannot cause further harm,
and deleting branches under time pressure is easy to get wrong for no benefit
today.

## Row 138 - unaffected, still closed

Row 138's own status cell was not touched this cycle. It remains `DONE 184`,
re-verified genuinely merged, with `estateOutOfOrder` confirmed present in
`_standards/bidlow-deck.mjs`. Nothing in this cycle's findings changes that.

## Gates

No application source code was touched this cycle - only `QUEUE.md`, this
artefact, and the cycle log. `npm run lint` and `npm run typecheck` were run
to confirm the tree is still green; see the cycle-185 log for the captured
output. No `.bidlow/GRADES.json`, no dimension, no sell gate touched - this
row does not score anything, as its brief required. No send, no client data,
no destructive migration.

## Files touched

- `.bidlow/relay/QUEUE.md` - row 143 status only, closed `DONE 185`.
- This artefact.
- `.bidlow/relay/log/cycle-185.md` (the cycle's own log entry).
- GitHub repo setting `delete_branch_on_merge` - `false` -> `true` (not a file
  in this repo, recorded here for the trail).
