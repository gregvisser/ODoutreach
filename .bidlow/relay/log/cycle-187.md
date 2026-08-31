# Cycle 187 - row 143 (re-verification, third consecutive time)

## Sweep first

`gh pr list --state open` returned an empty list - no PRs to clear before
starting.

## Uncommitted leftover found at start

`git status` on `main` showed `.bidlow/relay/QUEUE.md` and
`.bidlow/relay/log/cycle-186.md` modified but not committed - cycle 186's own
watcher footer, and the picker's row 143 flip to `IN PROGRESS 187`. Local
`main` was already level with `origin/main` (`40b8bab`), so committed directly
as its own commit (`c4b68fa`) before starting new work, matching the pattern
cycles 174-186 already established for exactly this situation.

## Files changed

- `.bidlow/relay/QUEUE.md` (row 143 status cell only)
- `docs/ops/ROW143-REVERIFICATION-2026-08-31-cycle187.md` (new, dated artefact)
- `.bidlow/relay/log/cycle-187.md` (this file)

No application source was in scope and none was touched.

## What "done" looks like

Row 143's actual work (squash-merge-aware guard + loop breaker) is already
merged and proven by 91/91 self-test checks. This cycle's job was to check
`main` first (per this project's own `CLAUDE.md` on reopened rows), re-confirm
that proof still holds, and find and clear whatever branch is currently
tricking the still-stale live watcher process into reopening this row a third
time - not to write any new guard code.

## What must NOT be touched

Anything under `_standards` (not named by this row), any other client's data,
any real email send, `.bidlow/GRADES.json` or any dimension score, and row
122's original ancestry-based protection (must keep catching a genuinely
unmerged branch, not just the squash-merge case).

## Check `main` first (per this project's CLAUDE.md on reopened rows)

`origin/main` at cycle start: `40b8bab` (cycle 186's own PR #497 merge).
`b0a9052` (PR #492, the squash-merge guard + loop breaker) confirmed still an
ordinary ancestor. `estateOutOfOrder` still present in
`_standards/bidlow-deck.mjs` at line 264 with its `.bak-2026-08-31`. Fresh
`relay-selftest.ps1` run before touching anything: **91/91 PASS**, including
all three of section 13's required squash-merge/loop-breaker cases. Row 138
unchanged, still `DONE 184`.

## The actual work this cycle: a comprehensive branch sweep, not a reactive one

Cycles 185 and 186 each found and deleted the one specific branch that had
most recently triggered a reopen. This cycle instead swept **every** branch on
`origin` whose name or commit subjects mention row 138 or row 143, using the
same whole-branch patch-id method the shipped guard uses
(`Test-BranchSquashMergedIntoMain`: diff `merge-base..branch`, compare its
patch-id against every individual commit on `main` since that merge-base).

```
check_squash() {
  b="$1"
  mb=$(git merge-base origin/main "origin/$b")
  bpid=$(git diff "$mb" "origin/$b" | git patch-id --stable | awk '{print $1}')
  match="NO"
  for c in $(git rev-list "$mb..origin/main"); do
    cpid=$(git diff "$c^" "$c" | git patch-id --stable | awk '{print $1}')
    if [ "$cpid" = "$bpid" ] && [ -n "$bpid" ]; then match="YES ($c)"; fi
  done
  echo "$b -> squash-merged: $match"
}
```

Row-143 branches found (`docs/relay-cycle185-row143-hash`,
`docs/relay-cycle185-row143-reverify`, `docs/relay-row143-row138-cycle184`,
`docs/row143-cycle186-reverify`, `docs/state-cycle185-row143`) - all five
confirmed squash-merged cleanly by the method above, then found already gone
(`remote ref does not exist`) when the deletion commands ran seconds later:
`delete_branch_on_merge`, flipped on mid-cycle-185, is now working for
ordinary PR merges. Future row-143 cycles should not need this cleanup again.

Row-138 branches not among the six the brief names and protects: deleted
`docs/row-138-re-verify-cycle-174` (clean squash match against `10bc6ab`) and
`docs/state-cycle-179-row138` (not a clean whole-branch patch-id match, but
verified by direct content diff that `.bidlow/relay/log/cycle-179.md` on
`origin/main` is byte-identical to the copy in this branch, and its QUEUE.md
edit has been overwritten by five subsequent row-138 closes since - dead,
fully superseded content, not real unmerged work; this is one of the two
branches the original row-143 brief named by name as loop wreckage).

`git ls-remote --heads origin` filtered for "138" or "143" by branch name now
returns only the six protected `docs/row-138-cycle-175..180-close` branches
(plus two coincidental SHA1-substring false matches on unrelated branches,
confirmed by name/commit-subject inspection to not actually mention either
row).

**Finding recorded, not acted on (per the brief's own instruction to recommend
only):** re-checked those six against the same method - five are clean squash
matches, but `docs/row-138-cycle-180-close` is not, for the same
piecemeal-absorption reason as the branch just deleted (it's built on top of
the identical `aa1a4b4`/`87af51e` commits). If the watcher is ever restarted
while this branch still exists, the fixed guard could report it "unmerged" and
reopen row 138 once more before the loop breaker refuses a third reopen.
Recommend all six for deletion once reviewed - none represent real outstanding
work. Full detail in `docs/ops/ROW143-REVERIFICATION-2026-08-31-cycle187.md`.

## Gates

- `relay-selftest.ps1`: 91/91 PASS (unchanged before/after - branch deletion
  cannot affect the self-test's isolated fixture repo; re-run as a sanity
  check anyway).
- `npx vitest run relay/queue-file-integrity.test.ts`: 9/9 PASS (checked the
  QUEUE.md edit didn't reintroduce cycle 186's own pipe-character parser
  defect).
- No application source touched - lint/typecheck/full test suite not re-run
  for that reason.
- No send, no client data, no schema, no migration, nothing scored.

## Restart still required

Stated identically in cycles 185 and 186, and true again: the live
`relay-watch.ps1` process predates `b0a9052` and is still running the old
ancestry-only guard with no patch-id awareness. Only Greg running
`relay-start.cmd` loads the fix onto the running process. Nothing in this
cycle changes that. If row 138 or row 143 reopens again before that restart,
it is the same already-diagnosed cause recurring - the loop breaker caps it at
one more reopen before it refuses and says so in plain language, per the
self-test proof above.
