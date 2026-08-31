# Cycle 184 - queue item 143

## Four things, written down before touching anything

1. **Files to change:** none new. Row 143's actual code fix (squash-merge-aware
   guard + independent loop breaker in `relay-watch.ps1`, section 13 in
   `relay-selftest.ps1`, artefact under `docs/ops/`) was already written and
   pushed by cycle 183 as PR #492. My job this cycle is to finish it: merge the
   green PR, independently verify its claims rather than trust the commit
   message, and close `.bidlow/relay/QUEUE.md` rows 143 and 138 with real
   evidence.
2. **The red-first test:** already proven red-without-the-fix by cycle 183
   (documented in `docs/ops/ROW138-SQUASH-MERGE-LOOP-FIX-2026-08-31-cycle183.md`
   - section 13 alone failed 1 real assertion plus a harness error for the
   missing `-PriorReopenCount` parameter before the fix landed). I did not
   re-derive this myself; I re-ran the passing suite after the fix to confirm
   it is not a fabricated pass (see below).
3. **Done looks like:** PR #492 merged to `main` with the hash confirmed on
   `origin/main`; `relay-selftest.ps1` passing when I run it myself, not just
   when the commit message says so; rows 138 and 143 in `QUEUE.md` closed with
   real evidence, not re-guessed work.
4. **Not touching:** no application code, no `_standards`, no schema, no
   `.bidlow/GRADES.json`. This is a relay-plumbing row plus the merge/close of
   its own PR.

## FIRST: cleared the green PRs

`gh pr list --state open` showed exactly one open PR: #492
(`fix(relay): row 143 - squash-merge-aware guard + loop breaker, closes row
138's nine-cycle loop`), head `docs/relay-row138-cycle182`, from cycle 183.
Both checks (`verify`, `E2E (Playwright)`) were still `pending` when this cycle
started; I watched them with `gh pr checks 492 --watch` rather than guessing,
both went `pass` (verify 5m46s, E2E 5m36s), and merged:

```
gh pr merge 492 --squash --delete-branch
```

Merge commit: **`b0a9052815a22b9ec86c09db722d6d163a24a506`**. Confirmed on the
remote, not just locally:

```
$ git ls-remote origin refs/heads/main
b0a9052815a22b9ec86c09db722d6d163a24a506	refs/heads/main
```

None of the three stop-and-ask conditions applied: no destructive migration
(this PR touches `relay-watch.ps1`, `relay-selftest.ps1`, `QUEUE.md`, and a new
doc under `docs/ops/` - no schema at all), no client data, no email send.

## Verifying the merged work, not just trusting it

I did not take cycle 183's "91 checks pass" on faith. After pulling `main` to
`b0a9052`, I ran `relay-selftest.ps1` myself:

```
SELF-TEST PASSED - 91 checks.
```

All 91 `PASS`, including section 13's three required cases, read directly from
my own run's output:

- `a genuinely squash-merged branch naming row 138 is no longer reported as
  unmerged, even though it is still ancestry-ahead of main` - PASS
- `a branch pushed to origin that genuinely has never been merged - not even by
  squash - is still found and still reopens the row` - PASS (row 122's original
  protection intact)
- `the third reopen attempt is refused - the row stays DONE instead of going
  PARTIAL a third time` - PASS, naming the branch in its message

I also independently re-ran the patch-id proof from the artefact by hand,
rather than re-reading its output:

```
$ git diff $(git merge-base origin/main origin/docs/relay-row138-cycle170-close) \
        origin/docs/relay-row138-cycle170-close | git patch-id --stable
05d2301dab71f2e9eb3558ff05e1f6f3564a32cc 0000000000000000000000000000000000000000

$ git diff 5fe6cd3^ 5fe6cd3 | git patch-id --stable
05d2301dab71f2e9eb3558ff05e1f6f3564a32cc 0000000000000000000000000000000000000000
```

Identical patch-id. The dangling branch that the row-122 guard has been
calling "unmerged" for eleven cycles really is `5fe6cd3` on `main`, squashed -
row 138's actual work has been correctly merged since cycle 169, exactly as
cycle 183 claimed and row 143 itself asserted from the start.

Read `docs/ops/ROW138-SQUASH-MERGE-LOOP-FIX-2026-08-31-cycle183.md` in full: it
already recommends (does not action) deleting the junk `row-138-cycle-*`
branches, and already states the stale-watcher caveat below in its own words.
I am not duplicating that artefact; I am confirming it holds up.

## The one honest gap: "stays closed across a subsequent cycle"

Row 143's Definition of Done asks for row 138 "closed DONE and STAYING closed
across at least one subsequent cycle." I can prove the fix is correct (self-test
against a real scratch repo, independently re-run) and I can prove the merge
landed (hash on `origin/main`). I cannot prove the fix has stopped the *live*
loop, because it hasn't been exercised live yet: this is a change to
`relay-watch.ps1`, and per this project's own standing rule that change is
**inert until Greg runs `relay-start.cmd`**. No cycle log since 166 has ever
carried the `Watcher script:` confirmation line that would prove a restart
happened, and cycle 183's own footer (in `.bidlow/relay/log/cycle-183.md`)
recorded the running process as still loaded at hash `51AF85ED01BF` against a
disk hash of `FFDB8B83837A` - eleven-plus cycles of drift, unresolved by this
merge. If the still-stale watcher reopens row 138 again before a restart, that
is the known, already-diagnosed defect recurring - not a new one, and not a
reason to redo the fix. The self-test suite is this project's established
substitute for live proof when live proof genuinely is not available (the same
convention row 148's and row 154's self-test sections already use).

Given that, I closed row 143 DONE rather than PARTIAL: every part of the
Definition of Done that a cycle can actually prove without Greg's action is
proven, with independently-reproduced evidence, not a re-statement of cycle
183's claims. The one part that structurally cannot be proven without a
restart is named plainly, in the row itself, rather than silently rounded up.

## Row 138

Closed DONE. Its real work (`estateOutOfOrder` in
`_standards/bidlow-deck.mjs` line 264) has been correctly merged since cycle
169 (`5fe6cd3`) and was never actually lost or unmerged at any point in this
loop - only mis-reported as unmerged by the exact bug row 143 fixes. I did not
touch `_standards/bidlow-deck.mjs` this cycle; row 138's own work is unchanged.

## Gates

This cycle's own diff is `.bidlow/relay/QUEUE.md` and this log file - no
application code. CI (`verify`, `E2E (Playwright)`) already ran green on PR
#492's actual code diff before I merged it (see above); this cycle's own PR
(docs-only) will carry the same CI gate before merge, per branch protection.

## Status

`DONE 184` for row 143, `DONE 184` for row 138, both in
`.bidlow/relay/QUEUE.md`, merged to `main` - hash quoted below once this PR
merges.
