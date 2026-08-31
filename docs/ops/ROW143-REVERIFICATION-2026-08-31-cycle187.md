# Row 143 re-verification, cycle 187 (2026-08-31)

## Why this cycle exists

Row 143's actual work — the squash-merge-aware guard plus the loop breaker in
`relay-watch.ps1` (`Test-BranchSquashMergedIntoMain`, the updated
`Find-UnmergedPushedBranchForRow`, and the row-138-specific loop breaker) — was
built, tested and merged to `main` once, in cycle 184, as `b0a9052` (PR #492).
Cycles 185, 186 and now 187 have each been re-dispatched to this same row, not
because the fix is wrong, but because of one already-diagnosed, unrelated
cause: **the live `relay-watch.ps1` process is still running a stale, pre-fix
copy of itself, loaded into memory at process start.** PowerShell reads a
script once, at launch. Merging a fix to the file on disk changes nothing about
what an already-running process executes. Only Greg running `relay-start.cmd`
loads the fix. This is queue row 52's known defect class, recurring.

The stale process implements the OLD guard: pure ancestry (`origin/main..branch`
non-empty ⇒ "unmerged"), with no patch-id awareness at all. So it reopens row
143 (and would reopen row 138) whenever it finds *any* pushed branch on origin
whose name or commit subjects mention that row number and which sits ahead of
`main` by plain ancestry — regardless of whether that branch's content already
landed via squash merge. Every cycle's own closing commits get pushed on a
branch before merging; if that branch isn't deleted after merge, it becomes the
next cycle's trigger. This cycle did a full, systematic sweep for every such
branch rather than reacting to one at a time.

## What was checked first (per this project's CLAUDE.md: check `main` before doing anything)

- `origin/main` at cycle start: `40b8bab` (cycle 186's own merge, PR #497).
- `b0a9052` (the squash-merge guard + loop breaker) confirmed still an ordinary
  ancestor of `main`.
- `_standards/bidlow-deck.mjs` still carries `estateOutOfOrder` at line 264 with
  its `.bak-2026-08-31` — row 138's actual work, untouched.
- Fresh `relay-selftest.ps1` run, before any change this cycle: **91/91 PASS**,
  including all of section 13's three required squash-merge/loop-breaker cases.
- Row 138's own QUEUE.md cell: unchanged, still `DONE 184`, now stable across
  three subsequent cycles (185, 186, 187) rather than the two the original
  Definition of Done required.

No application code needed to change. No new guard logic was written this
cycle — the fix is already correct and already proven by the self-test. What
this cycle did was clear the specific, real, currently-existing triggers that
keep firing the still-stale live process.

## The uncommitted leftover found at cycle start

`git status` showed `.bidlow/relay/QUEUE.md` and `.bidlow/relay/log/cycle-186.md`
modified but not committed — the watcher's own end-of-cycle-186 footer, and the
picker's row 143 status flip to `IN PROGRESS 187`. Local `main` was already
level with `origin/main` (`40b8bab`), so this was committed directly as its own
commit before any new work, matching the pattern cycles 174-186 already
established for this exact situation.

## Full sweep: every branch on origin whose name or commit subjects mention "138" or "143"

Ran `git for-each-ref refs/remotes/origin`, filtered every branch still ahead
of `origin/main` by plain ancestry, and checked each one against the row's own
number using the same anchored matcher the shipped guard uses (so "row 143"
cannot false-match "cycle 143" or "pr143").

**Branches naming row 143** (all created by rows 143's own cycles 184-186
recording their merge hashes, session state, or re-verification text on a
short-lived branch before the PR was squash-merged):

| Branch | Status found |
|---|---|
| `docs/relay-cycle185-row143-hash` | Already gone — auto-deleted on merge before this cycle checked |
| `docs/relay-cycle185-row143-reverify` | Already gone — auto-deleted on merge |
| `docs/relay-row143-row138-cycle184` | Already gone — auto-deleted on merge |
| `docs/row143-cycle186-reverify` | Already gone — auto-deleted on merge |
| `docs/state-cycle185-row143` | Already gone — auto-deleted on merge |

All five were confirmed, before they disappeared, to be genuinely
squash-merged into `main` by whole-branch patch-id (the same method
`Test-BranchSquashMergedIntoMain` uses: diff of `merge-base..branch` matched
the patch-id of a single commit on `main`) — see the git session output copied
into this cycle's log. Their disappearing mid-cycle is itself good news: it
confirms `delete_branch_on_merge`, flipped on during cycle 185, is now working
correctly for ordinary PR merges, so **future row-143 cycles should not leave
new dangling branches behind at all.**

**Branches naming row 138, not among the six the brief protects:**

| Branch | Status found | Action |
|---|---|---|
| `docs/row-138-re-verify-cycle-174` | Whole-branch diff patch-id matches `10bc6ab` on `main` — cleanly squash-merged | Deleted (`git push origin --delete`) |
| `docs/state-cycle-179-row138` | See below — NOT a clean single-commit patch-id match, but content confirmed fully present/superseded on `main` | Deleted (`git push origin --delete`) |

`docs/state-cycle-179-row138` needed closer checking because it did not match
the guard's patch-id test the way the others did. It carries two commits: one
(`87af51e`, a `STATE.md` update) individually patch-id-matches a commit
already on `main` (`349a161`). The other (`aa1a4b4`, a `cycle-179.md` log
append plus a row-138 QUEUE.md status edit) matches no commit on `main`
individually or as part of the whole-branch diff — **not because the work is
missing, but because its content was absorbed into `main` piecemeal across
several later commits rather than landing as one clean squash of this exact
branch.** Verified directly: `.bidlow/relay/log/cycle-179.md` as it exists on
`origin/main` today is **byte-identical** to the copy in this commit (`diff`
returns nothing, both 297 lines). The QUEUE.md row-138 status text this commit
wrote has been overwritten by five subsequent closes since (175 through 184)
and is pure history now. Nothing in this branch is real, un-landed work; it is
dead, fully superseded content, and this branch is one of the two the original
row-143 brief named by name as loop wreckage (`docs/state-cycle-179-row138
measures 2 commits ahead of origin/main`).

**Branches deliberately left alone — the six the brief named:**

`docs/row-138-cycle-175-close` through `-180-close`. Re-checked each by the
same whole-branch patch-id method:

| Branch | Squash-merged cleanly? |
|---|---|
| `docs/row-138-cycle-175-close` | Yes — matches `d196ce2` |
| `docs/row-138-cycle-176-close` | Yes — matches `4e5bb6b` |
| `docs/row-138-cycle-177-close` | Yes — matches `71e9387` |
| `docs/row-138-cycle-178-close` | Yes — matches `2aff384` |
| `docs/row-138-cycle-179-close` | Yes — matches `c665959` |
| `docs/row-138-cycle-180-close` | **No** |

**A genuine residual finding, not fixed this cycle:** `docs/row-138-cycle-180-close`
is built on top of the same `aa1a4b4`/`87af51e` commits as the
`docs/state-cycle-179-row138` branch above, so its whole-branch diff also
doesn't patch-id-match a single commit on `main` — for the identical reason
(piecemeal-absorbed content bundled with a genuinely-squashed close commit).
**This means that if the live watcher is ever restarted and later re-examines
row 138 while this branch still exists, the fixed guard could still report it
as "unmerged" and reopen row 138 once**, exactly as the original bug did. The
loop breaker is the backstop here: a second reopen from the same branch is
still allowed (matching row 122's original protection), but a third is
refused outright — proven by section 13 of the self-test. This is a narrower
edge case than the one row 143 was written to fix (a branch whose diff
comingles superseded content with a real squash, rather than a plain 1:1
squash), and it only affects branches nobody has deleted yet. **Recommendation
carried forward exactly as the brief asked, not acted on in this row:** once a
person has looked at the six `docs/row-138-cycle-*-close` branches and is
satisfied nothing in them is needed, delete all six. Their content is either a
clean squash match (five of them) or fully superseded (the sixth) — none of
them represent real outstanding work.

## Result of the sweep

`git ls-remote --heads origin` filtered for "138" or "143" by branch name now
returns only the six protected `docs/row-138-cycle-*-close` branches (plus two
unrelated hash-substring false matches — `docs/state-cycle-116` and
`feat/client-scoped-contacts-route`, whose SHA1s happen to contain the digits
"138" or "2138" but whose names and commit subjects do not mention either row).
No live trigger for a false row-143 or row-138 reopen remains, beyond the one
named and deliberately left in place above.

## Gates

- `relay-selftest.ps1`: 91/91 PASS, unchanged, before and after this cycle's
  branch deletions (branch deletion cannot affect the self-test, which uses an
  isolated throwaway repo fixture — re-run anyway as a sanity check).
- No application source touched. `lint`/`typecheck`/`npm test` not re-run for
  this reason — only `.bidlow/relay/QUEUE.md`, this artefact, and the cycle
  log changed.
- No send, no client data touched, no schema, no migration, nothing scored.

## Restart still required

Nothing in this cycle changes the standing fact, stated identically in cycles
185 and 186: **the live `relay-watch.ps1` process predates `b0a9052` and is
still running the old ancestry-only guard.** Only Greg running
`relay-start.cmd` loads the fix. Until then, any *new* branch pushed and left
undeleted whose name or commits mention row 138 or row 143 can still trigger
one more false reopen — capped at two, by the loop breaker, before it refuses
to reopen a third time and says so in plain language.
