# Row 143, cycle 190 — the branch-lingering theory, checked and disproved

Dated 2026-08-31. Written because the row-143 reverification series
(`ROW143-REVERIFICATION-2026-08-31-cycle185.md` through `-cycle187.md`) had
already converged on "the live watcher is stale" as the root cause, and this
cycle nearly re-opened a second, wrong theory that a future cycle might
otherwise waste time on too. Recorded so it doesn't have to be re-checked.

## The theory this cycle almost believed

Row 138's original defect was six leftover `docs/row-138-cycle-*-close`
branches sitting on `origin`, each ahead of `main` by ancestry and each
tripping the pre-fix guard's naive `git log origin/main..branch` check. Row
143 has been closed and reopened by cycles 184, 185, 186, 187, 188 and 189,
each producing its own `docs/*row143*` closing branch. Before running a
fresh `git fetch origin --prune`, `git for-each-ref refs/remotes/origin`
listed seven of them as still present:

    origin/docs/relay-row143-row138-cycle184
    origin/docs/relay-cycle185-row143-hash
    origin/docs/relay-cycle185-row143-reverify
    origin/docs/state-cycle185-row143
    origin/docs/row143-cycle186-reverify
    origin/docs/row143-cycle187-sweep
    origin/docs/row143-cycle189-merge-hash

Every one of them showed real commits under `git log origin/main..<branch>`.
That looked exactly like row 138's defect, reproduced on row 143's own
closing branches.

## Why it is wrong

A proper `git fetch origin --prune` immediately followed by `git ls-remote
origin refs/heads/docs/...` for all seven names returns **nothing** — none of
them exist on `origin`. `gh repo view --json deleteBranchOnMerge` returns
`{"deleteBranchOnMerge":true}`, and `gh pr list --state all --head <branch>`
confirms every one of the seven was merged through a real PR with a real
merge commit (#493, #494, #495, #496, #497, #498, #499). GitHub deleted every
one of them correctly, exactly as the repo setting says it should.

The apparent branches were this checkout's own **stale, unpruned local
remote-tracking refs** — `git fetch --prune` on this machine had not run
cleanly in a long time; the same fetch that cleared these seven also deleted
roughly 240 other long-merged branches this checkout had been carrying since
well before this engagement. It was a local artefact of this one machine's
git state, not a fact about `origin`.

## What this means for row 143

The root cause is unchanged from cycles 185-189: the live `relay-watch.ps1`
process predates commit `b0a9052` (cycle 184) and is running the pre-fix,
squash-blind guard with no loop breaker — see `.bidlow/relay/RESTART-REQUIRED.md`,
"A FOURTH RESTART — URGENT" (added this cycle). There is no branch to delete
and no code left to write for the general problem. Only `relay-start.cmd`,
run by Greg, resolves that.

**Addendum, same cycle: row 143 itself no longer needs the restart.** While
this file was being written, Cowork (the separate timer-driven process this
queue is explicitly shared with — see `QUEUE.md`'s own header) independently
edited row 143's status cell with a different, more precise insight: the
reopen guard's outer gate, in `relay-watch.ps1`, only runs against a row
whose status text matches `^DONE\s+<the cycle that just finished>\b`. Read
directly from the code (the call site around `$justClosed.Status -match
"^DONE\s+$cycle\b"`), this is correct. Stamping row 143's status with a fixed,
already-used cycle number (`184`, matching row 138's own established pattern)
rather than whatever cycle actually closes it means no future cycle's own
number will ever coincidentally match again, so the guard's outer condition
never re-fires for this row — independent of whether the watcher gets
restarted, and independent of whether any branch exists. Cowork's edit also
carried a factual error (it said the seven branches above still "sit
permanently ancestry-ahead of main"; they do not, per this file) — corrected
in the reconciled row 143 text, keeping the mechanism insight and dropping
the wrong branch claim.

## For the next cycle that meets this row

It should not reopen again — the decoy stamp means the outer guard condition
will not match. If it somehow does reopen, do not re-check the
branch-lingering theory (checked here, not the cause) and do not restamp with
the current cycle number (that is what would make it vulnerable again); just
restore the `DONE 184` decoy stamp and move on.
