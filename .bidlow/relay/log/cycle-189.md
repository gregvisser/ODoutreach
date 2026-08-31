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

**Merge commit hash: `eb3403512c0f4e69091172d5f5cc83bccbba06f1`.** Confirmed
with `git ls-remote origin refs/heads/main` -> `eb3403512c0f4e69091172d5f5cc83bccbba06f1 refs/heads/main`,
matching exactly. `gh pr view 498` confirms `state: MERGED, mergedAt:
2026-08-31T12:12:47Z`. This is filled in after the merge actually completed,
not guessed ahead of it - the exact mistake this cycle is correcting.

`gh pr merge --delete-branch` deleted the remote branch but then failed
locally on `Unable to create '.git/packed-refs.lock': File exists` - a
0-byte stale lock file, no `git.exe` process holding it (`tasklist /FI
"IMAGENAME eq git.exe"` returned no matches). Removed the stale lock,
deleted the local branch, checked out `main`, and fast-forwarded to
`eb34035` - confirmed by `git log --oneline -3` showing `eb34035` at HEAD as
the top commit, matching the PR merge. Not the same defect class as the
self-test's stale-index-lock case (different file, no live process, no
special handling needed - a plain stale-lock cleanup was correct here).

Re-ran both gates fresh against merged `main`: `relay-selftest.ps1` ->
**SELF-TEST PASSED - 91 checks**; `npx vitest run
relay/queue-file-integrity.test.ts` -> **9/9 PASS**.

## Scope discipline

Touched only `.bidlow/relay/QUEUE.md`, `.bidlow/relay/log/cycle-188.md` and
this file. Did not touch `_standards`, `relay-watch.ps1`,
`relay-selftest.ps1`, any sibling project folder, `.bidlow/GRADES.json`, or
any dimension/score. No email sent, no client data touched, no migration.


---

## The watcher's own record of this cycle

Everything ABOVE this line was written by the cycle itself, and is kept exactly as the cycle left it. Nothing above was edited, shortened or reordered.

This section is written by `relay-watch.ps1` after the cycle's process has
exited. It is the independent half of the record: the cycle above says what it
meant to do, and this says what actually moved on disk, how long it took, and
how the process ended. Where the two disagree, this half is the evidence.
# Cycle 189 - finished

Work happened. Evidence: a git ref moved, so something was committed; the working tree changed, so files were edited.

**RESTART REQUIRED - this watcher is running a STALE copy of its own script.**

  Loaded at launch: 51AF85ED01BF
  On disk now:      FFDB8B83837A

PowerShell reads a script once, at launch, and then runs from memory. Every
change merged to relay-watch.ps1 since this process started is INERT - merging
it again will not help. Stop this watcher and run relay-start.cmd, which clears
HALT and reads the cycle number back out of STATUS.json.

This is queue row 52's defect. It cost about ten cycles precisely because
nothing said this out loud.

Started 2026-08-31 13:00:27, took about 20.5 minutes.
How it ended: exit code 0.

Evidence checked: git refs on every branch, the working tree, and these
files named in the brief: _standards/bidlow-deck.mjs, bidlow/GRADES.json, bidlow/relay/QUEUE.md

## What it was asked to do

# Cycle 189 - queue item 143

This brief was written by the relay itself, off the top of QUEUE.md. Greg has
not read it. If it is wrong, say so in your log rather than working around it,
and correct QUEUE.md.

## The item, verbatim from the queue

> **STOP THE ROW-138 LOOP. ROW 122'S GUARD IS SQUASH-MERGE BLIND AND HAS BURNED AT LEAST NINE CYCLES SINCE 08:00 ON 31 AUGUST. THIS IS THE MOST URGENT ROW IN THE QUEUE AND IT COSTS REAL MONEY EVERY CYCLE IT IS NOT FIXED.** **WHAT IS HAPPENING, measured not guessed.** Cycle 169 did row 138's work correctly - `estateOutOfOrder` is present in `_standards/bidlow-deck.mjs` at line 264 and the file carries a `.bak-2026-08-31`. The work is DONE. But cycles 172, 173, 174, 175, 176, 177, 178, 179 and 180 have each taken row 138, re-verified that it was already merged, closed it again, and been reopened. `git ls-remote origin` shows the wreckage: `docs/row-138-cycle-175-close`, `-176-close`, `-177-close`, `-178-close`, `-179-close`, `-180-close` - one junk branch per wasted cycle, and `docs/state-cycle-179-row138` measures 2 commits ahead of `origin/main`. **Each cycle closes the row, pushes a branch whose name contains the row number, that branch is squash-merged so its commits never become ancestors of main, `Find-UnmergedPushedBranchForRow` then sees a pushed branch naming row 138 that is still ahead of main, and reopens the row. The next cycle repeats it and creates one more branch. It cannot terminate.** **THE ROOT CAUSE:** row 122's guard assumes a merged branch becomes an ancestor of `main`. **With squash merges it never does.** This repository squash-merges. So the guard is not merely wrong about row 138 - **it is a permanent loop generator for every row from now on.** That is why this is urgent rather than tidy-up. **THE WORK.** (1) Teach the guard to recognise squash merges. `git cherry main <branch>` marks commits already applied upstream with `-` by patch-id and is the standard answer; whichever method you choose, prove it recognises a squash-merged branch as merged. Do NOT simply widen the row-number match or add an exception for 138 - that treats the symptom. (2) Add a loop breaker that is independent of the merge logic: if the same row has been reopened by this guard more than twice, stop reopening it, close it, and write a plain line saying the guard gave up and why. A guard that can loop forever is worse than no guard, and this row is the proof. (3) Say in the artefact what should happen to the six junk `row-138-cycle-*-close` branches - recommend, do not delete them in this row. **PROVE IT FIRES:** a self-test case with a genuinely squash-merged branch asserting the row is NOT reopened; a case with a truly unmerged pushed branch asserting it IS reopened, so the original protection still works; and a case asserting the loop breaker stops a third reopen. All three must fail red without the change. The check count must rise above 74. **DO NOT** weaken or delete row 122's protection - a DONE with genuinely unmerged work behind it must still be caught. That defect was real and cost a whole readiness verdict on 30 August. **DO NOT SCORE ANYTHING:** no `.bidlow/GRADES.json`, no dimension, no sell gate. **THE HARD RULE, verbatim and not negotiable: real email may be sent, and data deleted, ONLY for the `bidlowai` client. Every other client may be built on, tested and measured, but nothing leaves the building for them.** **DEFINITION OF DONE:** the squash-merge fix and the loop breaker shipped, all three self-test cases passing and proven red without the change, row 138 closed DONE and STAYING closed across at least one subsequent cycle, a dated artefact under `docs/ops/`, and THE WORK MERGED TO `main` with the merge commit hash on `origin/main` quoted in your log and confirmed with `git ls-remote origin refs/heads/main`.

## The one rule

THE HARD RULE, and it is not negotiable:
Real email may be sent, and data deleted, ONLY for the `bidlowai` client.
Every other client may be built on, tested and measured. Nothing leaves the
building for them. This is enforced in `autonomous-actor-guard.ts`, not by
your good intentions. If a task seems to need a real send for anyone else,
that task is wrong - stop and write down why.

## FIRST, BEFORE ANY NEW WORK: CLEAR THE GREEN PULL REQUESTS

Do this at the START of every cycle, before you read the item below. It takes two
minutes and it is the difference between a queue and a landfill.

`gh pr list --state open` then, for every PR whose checks are GREEN: bring the
branch up to date if branch protection requires it, and MERGE it. Greg counted
SEVENTEEN open on 2026-08-28 and most were green - they had simply been opened and
abandoned.

**Understand WHY this happens, because it is structural and not laziness.** A
cycle finishes its work, opens a PR, and ends. CI takes about five minutes. Nobody
ever comes back. So every cycle adds one and removes none, for ever. The only
place that can be fixed is here, at the start of the NEXT cycle.

Rules for the sweep:
* RED PRs are not yours to force. Read the failure, and either fix it as part of
  this cycle or say in your log why you left it.
* Merge order matters: branch protection requires each branch to be current, so
  every merge invalidates the next one. Take the docs and `.bidlow` record PRs
  first - they cannot conflict with code - then the code ones, updating as you go.
* `gh pr merge --auto` is better than update-then-race if auto-merge is allowed.
* A DESTRUCTIVE migration is still Greg's. Additive is yours.
* If a PR is genuinely not ready, say so in a comment on it, so the next cycle
  does not have to work that out again.

## Before you touch anything, write these four things down

1. **The files you are going to change.** Name them. If you cannot yet, your
   first job is to find out, and that reconnaissance IS the cycle.
2. **The red-first test.** Name the test file and what it asserts. Watch it FAIL
   before you make it pass. If the behaviour cannot go red first, say why, and
   prove the test is capable of failing by deliberately breaking the code and
   showing the red - that is this repository's established substitute.
3. **What "done" looks like** for this item, in one sentence a non-coder can check.
4. **What you must NOT touch.** Anything outside the files in (1).

## THIS PROJECT'S FOLDER, AND NOTHING OUTSIDE IT

You are working on ONE client system. Greg runs several side by side, and they
share one folder deliberately: `C:\Bidlowprojects\_standards` is the METHOD -
the hooks, the gates, the skills, the deck, the checklists - and it applies to
every project at once.

**Do not create, edit, move or delete anything under `_standards` unless the
queue row you are working on names that path explicitly.** A change made there
while doing client work does not stay with this client; it silently changes how
every other build is judged, including ones nobody is looking at today. If this
row's work seems to need a change to the method, STOP and write the case for it
into your log as a finding. Somebody will queue it as its own row, against the
standard, where it can be reviewed on its own terms.

The same goes for any sibling project folder - `BidlowClients\Kepak`,
`BidlowClients\Papaya`, `BidlowTools\*`. Read them if a row asks you to
compare something. Never write to them.

## The rules that apply to every cycle

* Do not stall on a question. Decide, record the decision and why, and continue.
  If the decision is genuinely Greg's - money, a client relationship, or one of
  the three named below - stop and write down the question instead. Note what
  changed on 2026-08-27: "an irreversible one-way door" used to sit in this list
  and was read as covering any production merge. It does not. Only (a), (b) and
  (c) below stop you now.
* Gates before you claim anything: `npm run lint`, `npm run typecheck`,
  `npm test`. Show the real output. A gate you did not run is not met.
* Commit and push when confident. Branch protection is ON, so it is
  branch -> PR -> green CI -> merge. Never push straight to `main`.
* **MERGING IS YOURS NOW. Greg decided this on 2026-08-27 and asked to stop being
  the bottleneck.** With green CI, MERGE AND DEPLOY WITHOUT ASKING. Do not park a
  finished, green PR and wait for him - a PR left open ROTS: #231 went from clean
  to 36 commits behind and CONFLICTING in a single day, and cost a whole cycle to
  rescue. Leaving it open is not the safe option, it is the expensive one.
* Three things still stop and ask, and they are the ONLY three:
  (a) a DESTRUCTIVE migration - anything that drops or alters an EXISTING table,
      column or type, or backfills over existing rows. Creating a NEW table, a new
      enum, or adding foreign keys to a new table is ADDITIVE and is yours to merge.
      The test is: does dropping what this adds restore today's behaviour exactly?
  (b) anything that touches or moves real CLIENT data.
  (c) anything that causes an EMAIL TO BE SENT. That one is absolute and it is on
      top of the hard rule about `bidlowai`, not instead of it.
  If it is none of those three, you do not need him. Merge it.
* If you deploy, verify the running commit by HASH against the DIRECT App
  Service URL (`app-opensdoors-outreach-prod.azurewebsites.net`), never the
  CDN-cached custom domain, and never liveness alone.
* Production migrations are real. `PRODUCTION_PRISMA_MIGRATE` is true, so
  merging a migration applies it to the live client database.
* When you finish, update this item's row in `.bidlow/relay/QUEUE.md` to
  `DONE 189`, or back to `TODO` with a note if you could not do it.

## THE STATUS CELL: SIX WORDS, AND ONLY SIX

The status cell of a queue row MUST BEGIN with one of exactly these six:

    TODO    DONE    BLOCKED    PARTIAL    IN PROGRESS    WONTFIX

Markdown bold around it is fine - `| **DONE 189 - ...** |` reads correctly.
Anything else does not. The relay reads QUEUE.md with a regex, and a status it
cannot read STOPS THE WHOLE QUEUE, on purpose: refusing to guess is the right
behaviour, and inventing is the one thing this relay will never do.

This is not hypothetical, and it is not pedantry. Cycle 59 built, merged and
DEPLOYED half of row 40 - good work, verified by commit hash - and then wrote its
status as `PARTLY DONE 59`. Two words, one of them not on the list above. The
row stopped parsing, the picker met it first, and the relay took nothing at all
for seventy minutes while eleven jobs waited behind it. `SUPERSEDED` did exactly
the same thing to row 38 the day before.

So, plainly:

* Finished it -> `DONE 189 - <what you did, and the proof>`
* Did some of it -> `PARTIAL 189 - <what is done, what is left>`. PARTIAL
  is TAKEN by the relay, so the next cycle picks the row straight back up. This is
  the right answer whenever you shipped part of a row.
* Could not start -> `TODO - <why>`
* Never invent a seventh word.
* Do NOT write the next NEXT.md. The watcher does that. One cycle, one item.

## Assume the seventh exists

QUEUE.md records six instances this week of something built, wired, reporting
success, and never firing. It is the defect this project is worst at by a wide
margin. Whatever you build this cycle, prove it FIRES - not that it exists.


## What it did

Cycle 189 is complete. Summary:

**What I found:** Row 143's actual engineering ask — a squash-merge-aware guard plus an independent loop breaker in `relay-watch.ps1`/`relay-selftest.ps1` — was already merged and holding since cycle 184 (`b0a9052`, PR #492). Cycles 185–188 had been repeatedly re-verifying the same true facts without ever cleanly finishing, and cycle 188's committed text made a **false claim**: "DONE 188 - PR #498 ... merged this cycle" while `gh pr view 498` showed it was still `OPEN` with CI in flight. That's the exact "reports success before it fires" defect this project is worst at, and it landed on the row created to fix a different instance of the same problem.

**What I did this cycle:**
1. Verified the fix fresh rather than trusting the log: `b0a9052` confirmed ancestor of `origin/main`; `relay-selftest.ps1` run live → **91/91 PASS** including all three required squash-merge/loop-breaker cases; `queue-file-integrity.test.ts` → 9/9 PASS; row 138 unchanged `DONE 184` across 4 subsequent cycles.
2. Corrected the false claim and closed row 143 **FINAL** in `QUEUE.md`, naming what actually caused cycles 185–188's waste (unfinished cycles, not a guard bug).
3. Merged PR #498 (`eb34035`) and a small follow-up docs PR #499 (`a0ea012`) recording the real hash — confirmed both via `git ls-remote origin refs/heads/main`.
4. Cleaned up a stale local `packed-refs.lock` (no live process held it) that blocked branch deletion.

The six junk `row-138-cycle-*-close` branches remain untouched — deletion is still Greg's call, per the brief. The watcher restart is still outstanding: no cycle log has yet shown a `Watcher script:` line naming a post-fix hash, so `relay-start.cmd` is still needed.

