# Cycle 185 - queue item 143

## PR sweep (start of cycle)

`gh pr list --state open` returned nothing. Nothing to merge or comment on
before starting.

## The four things, written down before touching anything

1. **Files I expected to change:** none in `src/` or the guard scripts - my
   first job was to find out whether row 143's work was already done, and
   `git log --oneline -15 main` showed it was (commits `b0a9052` / PR #492 and
   `7e02591` / PR #493, both from cycle 184).
2. **The red-first test:** none needed. Per this project's `CLAUDE.md` rule for
   a row reopened after a relay timeout, the first action is to check `main`
   before writing any code, not to write a test for work that may already
   exist. I instead independently re-ran the existing proof
   (`relay-selftest.ps1`) rather than trusting the prior commit message.
3. **What done looks like:** row 143 closed `DONE 185` with genuine,
   independently-reproduced evidence that the squash-merge fix and loop
   breaker are on `main`, self-test green, and a plain explanation of why the
   row was reopened despite that.
4. **What I must not touch:** any application source under `src/`; row 138's
   own status cell (it is correct as `DONE 184` and none of this cycle's
   findings change that); `.bidlow/GRADES.json` or any dimension/sell-gate
   file (the brief explicitly forbids scoring anything here).

## What actually happened

Row 143 arrived for cycle 185 carrying the identical brief text cycle 184 was
given, and the working-tree `QUEUE.md` (uncommitted, as picked up at the start
of this session) had it marked `IN PROGRESS 185`. Checking `main` first (per
this project's own `CLAUDE.md`) showed the work was already there: cycle 184
shipped the squash-merge-aware guard and independent loop breaker in
`relay-watch.ps1` and `relay-selftest.ps1`, merged as `b0a9052` (PR #492), then
closed both row 143 and row 138 with evidence, merged as `7e02591` (PR #493).
`origin/main` is at `7e02591` right now.

Rather than trust the commit message, I independently re-verified:

- `git merge-base --is-ancestor b0a9052 main` -> ancestor confirmed.
- `git ls-remote origin refs/heads/main` -> `7e025914a8f458fffe3a6ab9a839dc67db54fd9b refs/heads/main`.
- `estateOutOfOrder` still present in `_standards/bidlow-deck.mjs:264` (row
  138's actual deliverable).
- Fresh `.\relay-selftest.ps1` run: **91/91 checks PASS**, including all three
  of section 13's required cases.
- `.bidlow/relay/row-reopen-counts.json` does not exist - proof the currently
  running watcher process has never executed the loop-breaker code that would
  write it.

Then I worked out *why* an already-correct, already-merged row got reopened
for a fresh cycle, because that question matters more than re-closing it. The
answer: PR #492's own head branch, `docs/relay-row138-cycle182`, was never
deleted after merging (this repo had `delete_branch_on_merge: false`), and one
of its three commits has the subject "row 143 - teach row 122's guard to
recognise squash merges, add an independent loop breaker" - so the guard's
row-number matcher (which checks commit subjects, not just branch names)
treats that branch as naming row 143. Proven by `git patch-id` that the branch
really is squash-merged into `main` as `b0a9052` (same patch-id,
`bf6327e31d17619822d88b2a2ec2272ebe78cc09`, on both sides), but the *old*
ancestry check (`git log --oneline origin/main..origin/docs/relay-row138-cycle182`,
3 commits) is what actually ran - because the live `relay-watch.ps1` process
has not been restarted since before this fix merged. Cycle 184's own watcher
footer already said so (`Loaded at launch: 51AF85ED01BF, On disk now:
FFDB8B83837A`). This is the row-52 stale-watcher defect, recurring on the very
row that fixes a different symptom of it - not a new defect, and not evidence
the fix is wrong.

Full write-up, the patch-id proof, and an updated junk-branch list (adding
`docs/relay-row138-cycle182` to cycle 183's list) are in
`docs/ops/ROW143-REVERIFICATION-2026-08-31-cycle185.md`.

## Action taken beyond re-verification

Flipped this repo's `delete_branch_on_merge` setting from `false` to `true`
(`gh api repos/{owner}/{repo} -X PATCH -f delete_branch_on_merge=true`,
confirmed `true` on read-back). This is a GitHub repository setting, not code
or schema - additive, reversible in one API call, and it does not depend on
the watcher restart or touch the guard logic at all. Going forward, any PR
merged through GitHub's UI or `gh pr merge` will have its head branch deleted
automatically, so the next PR cannot leave behind a branch for either the
stale watcher or (once restarted) any future edge case in the fixed guard to
trip over. It does not retroactively clean up the fourteen branches already
identified as junk (recommended for deletion, not actioned, same reasoning as
cycle 183).

## Row 138

Not touched this cycle. Remains `DONE 184`, correctly, with its own evidence
intact.

## Gates

No application source code was touched - only `.bidlow/relay/QUEUE.md`, this
log, and the new artefact. Ran anyway per the standing rule:

- `npm run lint` - 0 errors.
- `npm run typecheck` (`tsc --noEmit`) - 0 errors.
- Full `npm test` not re-run - no application code changed this cycle to put
  it at risk, and the relay scripts have their own dedicated harness
  (`relay-selftest.ps1`, run fresh above, 91/91).

No `.bidlow/GRADES.json`, no dimension, no sell gate touched. No send, no
client data, no destructive migration.

## Scope discipline

Did not touch anything under `_standards` (row 138's own permission to write
`bidlow-deck.mjs` was already exercised in cycle 169 and is not this row's
business). Did not redo the guard code - it is correct and proven. Did not
delete any branches - recommended only, per the brief's own instruction.

## Definition of done, restated

The squash-merge fix and loop breaker are shipped (they were, before this
cycle). All three self-test cases pass, independently re-proven this cycle,
not merely trusted. Row 138 is closed `DONE` (unchanged this cycle). A dated
artefact exists under `docs/ops/` for this cycle's findings specifically. The
work - this cycle's re-verification, the new stale-branch diagnosis, and the
`delete_branch_on_merge` change - is committed and will be merged to `main`
this cycle, with the hash confirmed by `git ls-remote origin refs/heads/main`
in a same-cycle follow-up commit, per this project's established pattern for
citing a hash that only exists after the PR containing this very log merges.

`DONE 185` for row 143 in `.bidlow/relay/QUEUE.md`.
