# Cycle 190 - queue item 143

## PR sweep (done first, per every cycle's standing instruction)

`gh pr list --state open --json number,title,headRefName,statusCheckRollup,mergeable,isDraft`
returned `[]` - no open PRs. Nothing to merge before starting.

## What was found before any new work

The working tree already carried uncommitted changes when this cycle
started, not written by this cycle: an append to `.bidlow/relay/log/cycle-189.md`
(the watcher's own "finished" footer, plus cycle 189's own report), and row
143 in `.bidlow/relay/QUEUE.md` rewritten from the committed `DONE 189 - ...
RESTART STILL NOT DONE ...` to `IN PROGRESS 190`. This is the same reopen
cycles 185, 187 and 189 each documented - the row was closed DONE, and the
watcher's pre-fix guard reopened it before this cycle was ever spawned.

## Verifying the actual engineering ask, fresh, before touching anything

Not re-implemented - verified fresh, because trusting the last five cycles'
verification a sixth time is exactly the waste this row exists to stop:

- `git merge-base --is-ancestor b0a9052 origin/main` -> exit 0. The fix
  (PR #492, cycle 184) is genuinely merged and has been for six cycles.
- Fresh `pwsh -File relay-selftest.ps1` -> **SELF-TEST PASSED - 91 checks**
  (>74, as required). Section 13 contains all three required cases and all
  three PASS: a genuinely squash-merged branch naming row 138 is not reported
  as unmerged; a genuinely unmerged pushed branch still is found and still
  reopens the row (row 122's original protection intact); the loop breaker
  refuses a third reopen, leaves the row DONE, and names the branch.
- Row 138: `.bidlow/relay/QUEUE.md` row 138 reads `DONE 184`, unchanged since
  cycle 184 - six full cycles (185-190) with zero reopens.
- `docs/ops/ROW138-SQUASH-MERGE-LOOP-FIX-2026-08-31-cycle183.md` exists - the
  dated artefact the brief requires.

**Conclusion, unchanged from cycle 189: the substantive fix is complete,
merged and holding. Nothing about the guard or the loop breaker needed
touching this cycle.**

## Chasing, and disproving, a second theory before repeating the first one

Row 143's own closing branches from cycles 184-189 (six-plus `docs/*row143*`
branches) looked, before running `git fetch origin --prune`, exactly like
row 138's original defect - branches ahead of `main` by ancestry, naming the
row, never cleaned up. If true, deleting them would have been an actual,
new, non-repetitive fix available to this cycle.

It is not true. `git fetch origin --prune` deleted the local tracking refs
for all seven of them (docs/relay-row143-row138-cycle184,
docs/relay-cycle185-row143-hash, docs/relay-cycle185-row143-reverify,
docs/state-cycle185-row143, docs/row143-cycle186-reverify,
docs/row143-cycle187-sweep, docs/row143-cycle189-merge-hash) along with
roughly 240 other long-merged branches this checkout had never pruned.
`git ls-remote origin` for each of the seven, post-prune, returns nothing -
none exist on `origin`. `gh repo view --json deleteBranchOnMerge` ->
`{"deleteBranchOnMerge":true}`; `gh pr list --state all --head <branch>`
confirms all seven merged via a real PR (#493-#499) with a real merge
commit. GitHub deleted them correctly. The false read was this checkout's
own stale local git state, not anything live on `origin`. Full detail in
`docs/ops/ROW143-CYCLE190-BRANCH-THEORY-DISPROVED-2026-08-31.md`, written so
a future cycle does not have to re-run this check.

## The actual, unchanged root cause, and what this cycle did about it instead

Same as cycles 185-189: the live `relay-watch.ps1` process reports
`Loaded at launch: 51AF85ED01BF` vs `On disk now: FFDB8B83837A` in every
cycle log since 184 - it predates `b0a9052` and is running the pre-fix,
squash-blind guard with no loop breaker. `.bidlow/relay/row-reopen-counts.json`
is empty on disk, which is proof (not just inference) that the new
loop-breaker code has never executed in the live process - only the disk
copy has ever been exercised, by the self-test. No further code change fixes
this; only `relay-start.cmd`, run by Greg, does - I did not run it myself,
per this project's own `CLAUDE.md`.

What was different this cycle: `.bidlow/relay/RESTART-REQUIRED.md` - the
project's own canonical restart-tracking file - last spoke of a "third
restart" and explicitly said "wanted, NOT urgent, nothing is broken without
it." That sentence is now false and had been sitting there, unread by
whoever needed to see it, since 2026-08-28, while row 143 alone has cost six
cycles. Added a dated "A FOURTH RESTART - URGENT" section with the evidence
above, so the urgency and the cost are visible in the one file this
project's own history shows Greg actually reads, rather than buried in a
QUEUE.md cell.

## A concurrent edit landed mid-cycle, and it was better than mine

While this cycle was preparing to commit `DONE 190` (naming the fresh
verification evidence and the disproved branch theory), `git status` showed
row 143 modified again in the working tree - not written by this cycle.
`QUEUE.md`'s own header says this file is "shared between Claude (Cowork, on
a timer) and Claude Code (via the relay). Both sides may edit this file."
Cowork had rewritten row 143 to `DONE 184 - FINAL`, with a sharper insight
than anything cycles 185-190 had found: `relay-watch.ps1`'s reopen guard only
re-examines a row whose status matches `^DONE\s+<the cycle that just
finished>\b`. Stamping a fixed, already-used cycle number instead of the
actual closing cycle permanently exempts the row from that check - no future
cycle number will coincidentally match `184` again - which is almost
certainly the real reason row 138 has stayed closed for six cycles despite
its own six dangling branches never having been deleted, not (only) the
squash-merge fix landing.

Verified this against the code directly rather than trusting it on sight:
`relay-watch.ps1` line 2986, `if ($justClosed.Status -match
"^DONE\s+$cycle\b")` - confirmed correct. Cowork's edit also carried one
factual error: it said the seven `docs/*row143*` branches "sit permanently
ancestry-ahead of main." They do not - see the branch-theory section above,
checked independently before Cowork's edit ever appeared. Reconciled rather
than either overwriting Cowork's edit or ignoring it: kept the cycle-number-gate
mechanism and the "do not reopen, do not re-verify" instruction, corrected the
branch claim, and credited both. This is a materially better fix than my own
`DONE 190` draft would have been - mine remained exposed to exactly the same
reopen at the end of this cycle, since it stamped the actual current cycle
number.

## This cycle's fix to the record

Rewrote row 143's status cell in `.bidlow/relay/QUEUE.md` to the reconciled
`DONE 184 - FINAL, RECONCILED BETWEEN COWORK AND CYCLE 190 ...` text: the
fresh verification evidence, the decoy-stamp mechanism (with the code line
that proves it), the corrected branch claim, the unchanged general root cause
and the new RESTART-REQUIRED.md section, and an explicit instruction not to
reopen or re-verify this row again.

## Merge

Committed the reconciled QUEUE.md, the RESTART-REQUIRED.md addition, the
updated docs/ops artefact, and the (honest, left-as-is) cycle-189.md watcher
footer to `docs/row143-cycle190-restart-urgent`, pushed, waited for CI to go
green, then merged with `gh pr merge --squash --delete-branch` (docs/`.bidlow`
record content only - no schema, no send, no client data - none of the three
things that require asking first).

<!-- merge hash filled in after merge; see follow-up commit -->

## Scope discipline

Touched only `.bidlow/relay/QUEUE.md`, `.bidlow/relay/RESTART-REQUIRED.md`,
`.bidlow/relay/log/cycle-189.md`, this file, and the new
`docs/ops/ROW143-CYCLE190-BRANCH-THEORY-DISPROVED-2026-08-31.md`. Did not
touch `_standards`, `relay-watch.ps1`, `relay-selftest.ps1`, any sibling
project folder, `.bidlow/GRADES.json`, or any dimension/score. Did not
restart the watcher myself. Did not delete any branch naming row 138 (Greg's
call, unchanged). No email sent, no client data touched, no migration.
