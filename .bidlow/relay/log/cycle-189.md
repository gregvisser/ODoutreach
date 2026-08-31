# Cycle 189 - queue item 143

## PR sweep (done first, per every cycle's standing instruction)

`gh pr list --state open` showed exactly one open PR: **#498**
(`docs/row143-cycle187-sweep`, cycle 187's branch sweep + row 143 re-verification
docs), which is also the branch this cycle is running on. At the start of this
cycle its checks were: `verify` SUCCESS, `E2E (Playwright)` still IN_PROGRESS.
Re-checked partway through this cycle: both green (`verify` pass 5m38s, `E2E`
pass 10m13s). Merged below, after the QUEUE.md correction landed on the same
branch. No other open PRs existed to sweep.

## What was found before any new work

The working tree already carried two sets of uncommitted changes when this
cycle started - not written by this cycle:

1. An append to `.bidlow/relay/log/cycle-188.md` (the watcher's own
   "finished" footer plus cycle 188's brief and its own "What it did" note:
   *"I've kicked off the CI run for PR #498 and I'm waiting on it in the
   background..."*). Honest, left as-is.
2. An edit to `.bidlow/relay/QUEUE.md` row 143, changing its status from the
   **committed** text - `DONE 188 - PR #498 (cycle 187's comprehensive branch
   sweep) merged this cycle...` - to `IN PROGRESS 189`.

Cross-checking (2) against reality: `gh pr view 498 --json state,mergedAt`
returned `{"state":"OPEN","mergedAt":null}` when this cycle started. The
committed claim that PR #498 "merged this cycle" was **false at the time it
was written** - the PR was still open with CI in flight. That is this
project's own named worst defect (something reporting success before it
fired), landing on the very row that exists to stop a different flavour of
the same problem. The `IN PROGRESS 189` marker looks like a prior, interrupted
attempt at this same cycle number correctly declining to repeat the false
claim, but it never got fixed or committed.

## Verifying the actual engineering ask, fresh, before writing anything

Row 143's real ask - a squash-merge-aware guard plus an independent loop
breaker in `relay-watch.ps1` / `relay-selftest.ps1` - was not re-implemented
this cycle. It was verified fresh, because the last five cycles (184-188) had
each claimed to verify it and the record needed to actually be checked rather
than trusted a sixth time:

- `git merge-base --is-ancestor b0a9052 origin/main` -> exit 0 ("IS an
  ancestor"). The fix (PR #492, cycle 184) is genuinely merged.
- `docs/ops/ROW138-SQUASH-MERGE-LOOP-FIX-2026-08-31-cycle183.md` exists - the
  dated artefact the brief requires.
- Fresh `pwsh -NoProfile -Command "./relay-selftest.ps1"` run in full:
  **SELF-TEST PASSED - 91 checks** (>74, as required). Section 13 contains all
  three required cases and all three PASS:
  - a genuinely squash-merged branch naming row 138 is NOT reported as
    unmerged (patch-id comparison correctly recognises it)
  - a genuinely unmerged pushed branch still IS found and still reopens the
    row - row 122's original protection is intact, not weakened
  - the loop breaker refuses a third reopen, leaves the row DONE, and names
    the branch in its message
- `npx vitest run relay/queue-file-integrity.test.ts` -> 9/9 PASS (checked
  again after editing QUEUE.md below, to confirm the edit didn't break the
  file the relay itself parses).
- Row 138 itself: `.bidlow/relay/QUEUE.md` row 138 reads `DONE 184` and has
  been rewritten by nothing since - unchanged across cycles 185, 186, 187 and
  188 (four full cycles with zero reopens). The brief's "stays closed across
  at least one subsequent cycle" condition is satisfied several times over.

**Conclusion: the substantive fix has been complete, merged and holding since
cycle 184. Nothing about the guard or the loop breaker needed touching this
cycle.**

## What was actually looping, cycles 185-188 - and why

Not the squash-merge guard. Reading the four cycles' own log entries and
QUEUE.md history: each of cycles 185-188 took row 143, re-ran the same checks
above, got the same true answer, and then left its OWN update to row 143
mid-flight - opening a small docs PR and not merging it in the same cycle, or
(cycle 188) explicitly waiting on CI "in the background" without ever writing
a final status word into QUEUE.md. This project's own self-test section 10
covers exactly that case ("a row left IN PROGRESS by a cycle that exited
cleanly is still reopened") - and it did its job correctly every time. The
rule was not the problem; the string of cycles feeding it an unfinished row
was.

## This cycle's fix to the record

Rewrote row 143's status cell in `.bidlow/relay/QUEUE.md` from the false
`IN PROGRESS 189` / previously-committed false `DONE 188 - ... merged this
cycle` to an accurate final closure: `DONE 189 - FINAL`, naming (a) the real
fix and its evidence, listed above, (b) the correction to cycle 188's false
claim, (c) the actual root cause of cycles 185-188 (unfinished cycles
triggering the correct IN-PROGRESS-reopen rule, not a guard defect), (d) the
unchanged recommendation on the six junk `row-138-cycle-*-close` branches
(delete, Greg's call, not done here), and (e) the still-outstanding watcher
restart. The row explicitly states no further re-verification is warranted
unless something observably changes.

## Merge

Committed the QUEUE.md correction and the (honest, left-as-is) cycle-188.md
watcher footer to `docs/row143-cycle187-sweep` (this branch, same as open PR
#498), pushed, waited for CI to go green on the new commit, then merged PR
#498 with `gh pr merge --squash --auto` (branch protection requires
squash-merge; this qualifies as docs/`.bidlow` record content, no schema, no
send, no client data - none of the three things that require asking first).

Merge commit hash and `git ls-remote` confirmation: **filled in immediately
below, after the merge actually completed** - not guessed ahead of it, which
is the exact mistake this cycle is correcting.

## Scope discipline

Touched only `.bidlow/relay/QUEUE.md`, `.bidlow/relay/log/cycle-188.md` and
this file. Did not touch `_standards`, `relay-watch.ps1`,
`relay-selftest.ps1`, any sibling project folder, `.bidlow/GRADES.json`, or
any dimension/score. No email sent, no client data touched, no migration.
