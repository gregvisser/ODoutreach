# Cycle 206 - queue row 160: make the watcher reload itself when its own script changes

## What was asked

Greg asked directly on 31 August: a stale watcher is a blocker he cannot see,
and he should not have to notice it. `relay-watch.ps1` is read by PowerShell
once, at launch - a merge to the file does nothing to a process already
running the old code. `.bidlow/relay/RESTART-REQUIRED.md` records five
restarts of exactly this shape, the worst costing six cycles (185-190)
re-verifying already-merged work because the running process had never seen
the fix that would have stopped it looping. Row 160's brief: make the watcher
notice this itself, between cycles, and recover on its own - fail safe, never
fail shut, and prove all four required behaviours with tests that go red
first.

## Start-of-cycle sweep

`gh pr list --state open` returned none - nothing to clear before starting.

## What I found

`relay-watch.ps1` already had half of the "make staleness visible" machinery:
`Get-StaleWatcherNote` (from an earlier row) stamps every cycle log with the
hash the running process actually holds and says `RESTART REQUIRED` in as
many words when it differs from disk. What did not exist was any mechanism
for the watcher to act on that difference itself - it could only report,
never recover.

## What I built

* `Test-WatcherSelfReloadNeeded` (pure, injectable `-HashCheck`) - decides
  whether the file on disk has genuinely moved on from what this process
  loaded. Fail-safe: a missing launch hash, a disk read that throws, or one
  that returns nothing is reported as "cannot tell", never as a reload.
* `Start-FreshWatcherProcess` (injectable `-Launcher`) - spawns a new watcher
  on the SAME PowerShell host the current process is running under. A
  throwing or empty-handed launcher is caught and reported as a failed spawn
  rather than allowed to kill the caller.
* Wired at the very top of the main loop, immediately after the HALT check
  and strictly before any row is picked or `Invoke-CycleAgent` is ever
  called this iteration - so it can only run between cycles. On a genuine
  change it spawns the replacement, logs plainly, and exits with a new,
  distinct code (44); on any failure it logs plainly and carries on with the
  current (stale) process rather than stopping with nothing running.
* `Save-Status` now writes `scriptHash` and `processStartedAt` into every
  `STATUS.json` write - the "make staleness visible even when the reload
  does not fire" half of the brief.
* `relay-start.cmd` now handles exit 44 distinctly from 42/43, so it never
  starts a second watcher on top of the one `relay-watch.ps1` already
  spawned itself.

## Proof

* `relay/watcher-self-reload.test.ts` - 31 tests (both `pwsh` and
  `powershell`), dot-sourcing the shipped script with `-LoadOnly`, covering
  all four required proofs: unchanged does not reload; changed does
  (including a real-file-I/O reproduction of row 52's actual scenario -
  load a copy, edit it on disk, re-hash it); the reload cannot fire
  mid-cycle (proven at source level, the same way `stale-watcher-visible.test.ts`
  already proves its own wiring - the live loop cannot be driven under
  `-LoadOnly`); and a failed spawn leaves the current process running
  (proven by the test harness itself completing normally rather than dying,
  which is what would happen if the exception were allowed to escape).
* `relay-selftest.ps1` section 16 - 14 new checks against the same real
  functions, including the real-file-I/O reproduction and real `STATUS.json`
  writes to a scratch path. Self-test check count: **113 -> 127**.
* Red-first, proven by reverting the source: `git stash push -- relay-watch.ps1
  relay-start.cmd`, re-ran `relay/watcher-self-reload.test.ts` - 30 of 31
  failed (the 31st only asserts the test timeout budget itself). Restored
  with `git stash pop` - 31 of 31 passed.

## Gates

```
npm run lint        -> 0 errors
npx tsc --noEmit     -> 0 errors
npm test             -> 371 files, 3862 tests, all green
relay-selftest.ps1   -> SELF-TEST PASSED - 127 checks
```

`relay/powershell-timeout-budget.test.ts` maintains an explicit list of every
spec that drives a real PowerShell host; it had to be updated to include the
new file, and that update was itself proven necessary by the test failing
red before the edit.

Two unrelated tests (`src/instrumentation.test.ts`,
`src/lib/monitoring/sentry-config-wiring.test.ts`) timed out once under full
suite contention and passed cleanly in isolation - pre-existing flakiness,
not caused by this row; confirmed nothing in the change touches Sentry or
instrumentation.

## Merged

* PR #526 (code) - squash-merged. `verify` 5m44s, `E2E (Playwright)` 5m55s.
  Merge commit `0304924ded61d655191da06071f5a8516c7b7c70`.
* PR #527 (QUEUE.md status update, quoting the hash above) - squash-merged.
  `verify` 6m18s, `E2E (Playwright)` 5m33s. Merge commit `90892c8af4f59e2fa5358b507045048646c79975`.
* Both confirmed on `origin/main` via `git ls-remote origin refs/heads/main`.

Full writeup: `docs/ops/ROW160-WATCHER-SELF-RELOAD-2026-08-31-cycle206.md`.

## THIS CHANGE IS INERT UNTIL GREG RESTARTS THE RELAY

Stated plainly, per this repository's own standing rule: `relay-watch.ps1`
and `relay-start.cmd` were edited this cycle, and PowerShell reads a script
once, at launch. The watcher process that is (or was, at the start of this
cycle) running was launched before this fix existed, so it is still running
the pre-fix code and cannot reload itself into a fix it has never loaded.
`.bidlow/relay/STATUS.json` is the receipt: at the start of this cycle it had
no `scriptHash` or `processStartedAt` field, because only the fixed
`Save-Status` writes those. Nothing is broken in the meantime and nothing
here is urgent on its own - but the specific defect this row exists to close
(a merged fix doing nothing until a human notices and restarts) is, by its
own nature, still true of THIS merge until Greg runs `relay-start.cmd` one
more time. After that one restart, this exact situation should stop
recurring on its own.

## Scope

Only `relay-watch.ps1`, `relay-start.cmd`, `relay-selftest.ps1`,
`relay/watcher-self-reload.test.ts`, `relay/powershell-timeout-budget.test.ts`,
the new artefact, and `QUEUE.md`'s row 160 cell were touched. No
`_standards`, no other client folder, no `.bidlow/GRADES.json`, no grade, no
sell gate. No client data, no migration, no email sent.


---

## The watcher's own record of this cycle

Everything ABOVE this line was written by the cycle itself, and is kept exactly as the cycle left it. Nothing above was edited, shortened or reordered.

This section is written by `relay-watch.ps1` after the cycle's process has
exited. It is the independent half of the record: the cycle above says what it
meant to do, and this says what actually moved on disk, how long it took, and
how the process ended. Where the two disagree, this half is the evidence.
# Cycle 206 - finished

Work happened. Evidence: a git ref moved, so something was committed; the working tree changed, so files were edited; these files named in the brief changed on disk: relay-start.cmd, relay-watch.ps1.

**RESTART REQUIRED - this watcher is running a STALE copy of its own script.**

  Loaded at launch: DF0DA734E35C
  On disk now:      3ABAA45FD1AB

PowerShell reads a script once, at launch, and then runs from memory. Every
change merged to relay-watch.ps1 since this process started is INERT - merging
it again will not help. Stop this watcher and run relay-start.cmd, which clears
HALT and reads the cycle number back out of STATUS.json.

This is queue row 52's defect. It cost about ten cycles precisely because
nothing said this out loud.

Started 2026-08-31 20:36:07, took about 62.1 minutes.
How it ended: exit code 0.

Evidence checked: git refs on every branch, the working tree, and these
files named in the brief: relay-start.cmd, relay-watch.ps1, bidlow/relay/RESTART-REQUIRED.md, bidlow/GRADES.json, bidlow/relay/QUEUE.md

## What it was asked to do

# Cycle 206 - queue item 160

This brief was written by the relay itself, off the top of QUEUE.md. Greg has
not read it. If it is wrong, say so in your log rather than working around it,
and correct QUEUE.md.

## The item, verbatim from the queue

> **GREG ASKED FOR THIS DIRECTLY ON 31 AUGUST: a stale watcher is a blocker he cannot see, and he should not have to notice it. MAKE THE WATCHER RELOAD ITSELF WHEN ITS OWN SCRIPT CHANGES.** **THE PROBLEM, measured not guessed.** `relay-start.cmd` line 49 launches `powershell -ExecutionPolicy Bypass -File relay-watch.ps1`. PowerShell reads that script ONCE, at launch. Merging a fix to the file changes nothing about the running process. On 31 August that cost roughly ten cycles: rows 138 and 143 looped across cycles 172-190, row 134 across 193-194, row 136 across 198-199, and row 137 again at 201 - every one of them a finished, merged row being handed back because the reopen guard in memory predated its own fix. The cure each time was a human restarting `relay-start.cmd`, and nothing in the system asked for it. Queue row 52 already records this defect class; it has now recurred at scale. **THE WORK.** At the END of a cycle, after the log is written and before the next row is picked, compare a hash of `relay-watch.ps1` on disk against the hash taken when this process started. If they differ, the running process is stale: start a fresh watcher and exit cleanly, so the next cycle runs the current code. **BETWEEN CYCLES ONLY, NEVER MID-CYCLE** - a watcher that kills itself while `Invoke-CycleAgent` is running strands the row it is holding, which is exactly the failure `Get-StrandedRowActions` exists to clean up. Do not have a CYCLE restart the watcher; the watcher restarts itself, because only it knows a cycle has ended. **HAND OVER CLEANLY.** The new process must not fight the old one: the old process exits after spawning, `STATUS.json` and the cycle counter must survive the handover, and no row may be left `IN PROGRESS` across it. Prove the counter continues rather than resetting. **FAIL SAFE, NOT FAIL SHUT.** If the hash cannot be read, if the spawn fails, or if anything else goes wrong, LOG IT PLAINLY AND CARRY ON with the current process. A watchdog that can brick the relay is worse than a stale one - on 31 August a change to this same file bricked the relay for two hours before the self-test caught it. Do not repeat that shape. **SECOND HALF, AND IT MATTERS AS MUCH:** make staleness VISIBLE even when the reload does not fire. Write the loaded-script hash and the process start time into `STATUS.json`, and have the watcher say in its own log when the file on disk differs from what it is running. `.bidlow/relay/RESTART-REQUIRED.md` was written by cycle 194 as a human-readable escalation; that is the right instinct but nobody reads a file they do not know exists. **Greg's exact words: a blocker he cannot see is the problem.** **PROVE IT FIRES, do not merely build it:** a test that an unchanged file does NOT trigger a reload; a test that a changed file DOES; a test that the reload cannot fire mid-cycle; and a test that a failed spawn leaves the current process running rather than exiting. All four must fail red without the change, and the self-test check count must rise. **DO NOT SCORE ANYTHING:** no `.bidlow/GRADES.json`, no dimension, no sell gate. **THE HARD RULE, verbatim and not negotiable: real email may be sent, and data deleted, ONLY for the `bidlowai` client. Every other client may be built on, tested and measured, but nothing leaves the building for them.** **DEFINITION OF DONE:** the self-reload shipped and proven not to fire mid-cycle, staleness surfaced in STATUS.json and the log, all four tests passing and proven red without the change, a dated artefact under `docs/ops/`, and THE WORK MERGED TO `main` with the merge commit hash on `origin/main` quoted in your log and confirmed with `git ls-remote origin refs/heads/main`. A pushed branch is not a merge.

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
  `DONE 206`, or back to `TODO` with a note if you could not do it.

## THE STATUS CELL: SIX WORDS, AND ONLY SIX

The status cell of a queue row MUST BEGIN with one of exactly these six:

    TODO    DONE    BLOCKED    PARTIAL    IN PROGRESS    WONTFIX

Markdown bold around it is fine - `| **DONE 206 - ...** |` reads correctly.
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

* Finished it -> `DONE 206 - <what you did, and the proof>`
* Did some of it -> `PARTIAL 206 - <what is done, what is left>`. PARTIAL
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

Everything is clean, merged, and no PRs are left open. Here's a summary of cycle 206 / queue row 160:

**What shipped:** `relay-watch.ps1` now compares its own script hash against disk at the top of every loop iteration (after the HALT check, strictly before `Invoke-CycleAgent` — never mid-cycle). On a real change it spawns a fresh watcher on the same PowerShell host and exits cleanly (exit code 44); a failed hash read or failed spawn is fail-safe — logs plainly and carries on with the current process rather than bricking. `STATUS.json` now carries the running process's own script hash and start time on every write. `relay-start.cmd` handles exit 44 distinctly so it never double-spawns.

**Proof:** 31 vitest cases plus 14 new `relay-selftest.ps1` checks (113 → 127) cover all four required behaviors — unchanged doesn't reload, changed does, it can't fire mid-cycle (source-level proof), and a failed spawn leaves the process running. Proven red-first via `git stash`. All gates green (lint 0, typecheck 0, 3862 tests, self-test 127 checks).

**Merged:** PR #526 (code, `0304924`), PR #527 (QUEUE.md DONE status, `90892c8`), PR #528 (cycle log, `d9f9128`) — all confirmed on `origin/main`.

**Important caveat, stated in both the artefact and the cycle log:** this fix is inert until Greg restarts the relay one more time — the currently-running watcher process predates it and can't reload itself into existence. After that one restart, this exact class of problem (five recorded instances) should stop recurring on its own.



## Cross-project deck

regenerated C:\Bidlowprojects\bidlow-deck.html
