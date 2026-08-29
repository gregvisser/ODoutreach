# Cycle 81 - queue row 52: the restart happened, and the reason nobody could tell

## Sweep first

`gh pr list --state open` returned nothing. No PRs to merge, none to leave a
comment on. That is the first clean sweep in a while and worth saying out loud,
because the standing warning in the brief is about a landfill of seventeen.

## What this row asked for, and what it actually needed

Row 52 wrote its own acceptance test, which made this cycle unusually easy to
judge:

> prove it by checking that the next cycle's log still contains the agent's own
> prose underneath the watcher's block.

Cycle 80 left it TODO deliberately - it had already seen five cycles' worth of
evidence but the row belonged to another cycle, and one more receipt costs
nothing. So the honest shape of this cycle was: **close it on evidence, not on
work.** I did that, and then did one piece of real work that the row itself asked
for and nobody had done.

## The evidence

At start-of-cycle, `git status` showed `.bidlow/relay/log/cycle-080.md` MODIFIED.
For ten cycles that exact signature has meant "the watcher just destroyed the
previous cycle's log, rescue it by hand". So I checked before believing it, which
the row explicitly warns to do - cycle 72 was told to rescue a file that had
already been rescued.

It was the opposite of a clobbering:

    git show HEAD:.bidlow/relay/log/cycle-080.md | wc -l   ->  214
    wc -l < .bidlow/relay/log/cycle-080.md                 ->  395
    git diff --stat .bidlow/relay/log/cycle-080.md         ->  181 insertions(+), 0 deletions

**181 insertions and zero deletions.** That single number settles it. A truncating
writer cannot produce a diff with no deletions. Line 1 on disk is still cycle 80's
own heading, and the watcher's block sits at line 219.

One thing that would have looked wrong if I had trusted a grep count: the phrase
`The watcher's own record of this cycle` appears TWICE in that file. Line 179 is
cycle 80 quoting the phrase in its own prose - it is present in the committed
version too - and line 219 is the real separator. Counting without looking would
have produced a false alarm.

Seven consecutive logs agree. 074, 075, 076, 078, 079 and 080 each open with the
agent's own heading and carry exactly one real separator. 077 opens
`# Cycle 77 - finished` and has none, and that is **not** a stub - it is the shape
`Write-CycleLog` writes when the agent left no log of its own to preserve. The row
already said so; I re-checked rather than take it on trust.

I could not inspect the running process directly - the PowerShell tool is denied
in this mode - but I did not need to. The on-disk behaviour is stronger evidence
than a process start time anyway: it is what the process actually did, not what it
was launched from.

**So the second restart happened, the appending writer is running, and the
standing instruction in row 52 to rescue your own log by hand is retired.**

## The part that was actually broken, and it was not the code

The code fix has been correct since `3d7fef6` on 2026-08-28. This row still burned
about ten cycles. None of them were spent on a hard problem. Cycles 64, 65, 70 and
71 each rediscovered the same thing from scratch by noticing a clobbered log in
`git status`, and each had to reason its way back to "the running process never
reloaded".

The reason it kept happening is simple and it is not a code defect: **a restart
leaves no trace in the repository.** There was no way to look at anything and see
which version of `relay-watch.ps1` the live process was holding. `git log` shows
what was merged. Nothing showed what was loaded. Those two were silently different
for four cycles.

Row 52 raised this itself, as its own open question:

> Worth asking whether the watcher should re-read its own script, or stamp its
> loaded version into each cycle brief so a stale instance is visible.

Nobody had done it. I did, because closing instance eleven without touching the
mechanism that produced it just queues up instance twelve.

## What I built

Three small pieces in `relay-watch.ps1`:

1. **The capture, at module scope** (`$script:LoadedScriptHash`). SHA256 of the
   script's own file, taken at load. That has to happen there because it is the
   only moment it is knowable - PowerShell reads a script once and then runs from
   memory, and nothing later can ask what it was started from once the file on
   disk has moved on. `$null` when it cannot be taken, and it stays `$null` rather
   than becoming a guess.

2. **`Get-StaleWatcherNote`**, pure - it takes both hashes as parameters and
   touches no disk, so a test can drive the stale branch, which is otherwise only
   reproducible by editing the script mid-cycle. Three outcomes, deliberately not
   two:
   - **same** -> stamp the version, one quiet line, no alarm.
   - **different** -> `RESTART REQUIRED` in as many words, both hashes shown, and
     the sentence that matters: merged changes are **INERT**. "I merged it" is the
     exact false conclusion that cost this row ten cycles, so the note contradicts
     it in words rather than leaving it to be inferred.
   - **unknown** -> say the check could not run. An unreadable hash is not a
     difference, and firing a restart alarm on every failed read is how a real
     alarm gets ignored.

3. **The wiring** - the note is computed fresh each cycle and passed into the
   lines `Write-CycleLog` writes. Re-hashing every cycle rather than once at
   startup is the whole point: the script can be replaced by a merge *during* a
   long-running watcher, and that is the case being detected.

## Red first, under both hosts

`relay/stale-watcher-visible.test.ts`, 14 tests. I watched it fail before it
passed - 11 failures, and I checked the reason rather than assuming: `The term
'Get-StaleWatcherNote' is not recognized`, under `pwsh` and under `powershell`
both. Not a harness bug.

Both hosts is not belt-and-braces. `relay-start.cmd` uses `powershell` (5.1); a
developer shell finds `pwsh` (7.x) first, and the two differ on exactly the things
these functions touch. Proving it under 7 and shipping to 5.1 would be testing the
wrong thing. A missing host fails rather than skips, matching the rule
`cycle-log-preserved.test.ts` already set.

The test I care about most does not inject hashes at all. It copies the real
script, dot-sources the copy so the launch-time capture runs for real, then
**edits the copy underneath the already-loaded process** and re-hashes it. That is
the row-52 scenario reproduced with genuine file I/O, and the alarm fires. Given
this repository's record, a passing test on injected strings would not have
convinced me the thing works.

## Two honest weaknesses, stated rather than buried

**The wiring test is the weakest test in the file, and I labelled it as such in
the file itself.** The call site sits inside the main loop, not in a function, so
proving the loop puts the note in the log means running a live cycle. I assert it
at source level instead - both that `$stalenessNote` holds the function's result
*and* that the log body includes it, and that the assignment precedes the call.
Asserting only the first would pass while the note went nowhere, which is this
repository's signature defect. My first version of that test asserted the wrong
thing - it looked for the function name inside the lines array, but the value is
computed one line above and passed by variable, which is better code. I fixed the
test, not the code.

**The stamp is inert until the watcher is restarted.** It is subject to the exact
defect it reports, and I am not going to pretend otherwise. Nothing is broken in
the meantime - logs are being preserved correctly - so this is not urgent and I
have not flagged it as such. The proof it took, when it happens, is that cycle
logs start containing a line beginning `Watcher script:`. If that line never
appears, the restart did not happen.

## The guard that caught me

The full suite failed once, on `powershell-timeout-budget.test.ts`. That file
keeps an explicit list of relay specs which start a PowerShell host, specifically
so the list cannot go vacuous and quietly stop checking anything. My new spec was
detected and was not in the list, so it failed. That is the guard doing its job,
and it is a good example of the pattern this project keeps asking for. I added the
spec and corrected a stale comment there that said "the three that exist" while
listing four.

## Paperwork that would have misled the next reader

`.bidlow/relay/RESTART-REQUIRED.md` still ended with a section headed
**"A SECOND RESTART *IS* OUTSTANDING"** and an instruction that every cycle must
rescue its predecessor's log by hand. Both are now false. Left alone, that file
would have sent every future reader chasing a closed problem - which is precisely
what it did to several cycles already, in the other direction.

Rewritten: the reopened section is marked RESOLVED with a pointer to the closure
at the bottom, the measurement is recorded in full, and the new non-urgent third
restart is described with its own how-you-know-it-worked test. I did not delete
the old sections. Nothing in them was dishonest - they were written from the best
evidence available on the day, and they went stale for the same reason the whole
row existed.

## Gates

    npm run lint       clean
    npm run typecheck  clean
    npm test           318 files, 3203 tests, all green

The relay suite alone: 10 files, 154 tests. That includes
`queue-file-integrity.test.ts`, which validates the REAL QUEUE.md against the six
status words - so `DONE 81` is proven parseable by the thing that parses it, not
by my eyes.

**One near-miss worth recording.** My first draft of the row-52 status text
contained a shell example with a pipe character in it. QUEUE.md rows are
pipe-delimited and the parser is a regex. That would have split the row, made the
status unreadable, and stopped the entire queue behind it - the exact failure the
brief describes cycle 59 causing for seventy minutes, committed by the cycle
writing a row *about* being careful. I caught it, removed the pipe, and then
counted: the row has exactly 4 pipes, and the last field reads `DONE 81 - ...`.

## What I did not touch

No application code, no schema, no migration, no client data, and nothing that
sends email. This cycle is confined to `relay-watch.ps1`, two files under
`relay/`, and two records under `.bidlow/relay/`. None of the three things that
require Greg were anywhere near it.

## For whoever picks up next

The manual log-rescue step is gone. Do not do it. If a cycle log shows as modified
in `git status`, run `git diff --stat` on it: **insertions with zero deletions is
the watcher working correctly**, and that is now the expected state.

**Open questions: 0.**


---

## The watcher's own record of this cycle

Everything ABOVE this line was written by the cycle itself, and is kept exactly as the cycle left it. Nothing above was edited, shortened or reordered.

This section is written by `relay-watch.ps1` after the cycle's process has
exited. It is the independent half of the record: the cycle above says what it
meant to do, and this says what actually moved on disk, how long it took, and
how the process ended. Where the two disagree, this half is the evidence.
# Cycle 81 - finished

Work happened. Evidence: a git ref moved, so something was committed; the working tree changed, so files were edited; these files named in the brief changed on disk: relay-watch.ps1.

Started 2026-08-29 01:53:03, took about 26.9 minutes.
How it ended: exit code 0.

Evidence checked: git refs on every branch, the working tree, and these
files named in the brief: bidlow/relay/log/cycle-063.md, relay-watch.ps1, bidlow/relay/log/cycle-064.md, relay-start.cmd, bidlow/relay/RESTART-REQUIRED.md, bidlow/relay/QUEUE.md

## What it was asked to do

# Cycle 81 - queue item 52

This brief was written by the relay itself, off the top of QUEUE.md. Greg has
not read it. If it is wrong, say so in your log rather than working around it,
and correct QUEUE.md.

## The item, verbatim from the queue

> **ROW 51's FIX IS CORRECT, MERGED, AND STILL NOT RUNNING - THE WATCHER DESTROYED CYCLE 63's OWN LOG *AFTER* CYCLE 63 COMMITTED THE FIX.** Found by cycle 64 at start-of-cycle, not looked for. `git status` showed `.bidlow/relay/log/cycle-063.md` MODIFIED: the real 182-line log (committed in `5f21d86`) had been replaced on disk by a 156-line stub beginning `# Cycle 63 - finished` / `Work happened. Evidence: a git ref moved...`. Cycle 64 restored it from HEAD before committing anything, so nothing is lost - but understand WHY it happened, because the obvious reading is wrong. **The fix is genuinely on disk and genuinely correct**: `relay-watch.ps1:1831` now calls `Write-CycleLog` which APPENDS, and `:1853` even prints "the watcher's record was ADDED UNDERNEATH it - nothing was overwritten". Yet the log was TRUNCATED, not appended to. **The only thing that explains a truncating write from a script that no longer truncates is that the RUNNING watcher process still holds the pre-fix script in memory.** PowerShell parses a script once at launch; merging a new `relay-watch.ps1` does nothing to a watcher that was already running. So row 51 is DONE in the repository and INERT in production, and every cycle log will keep being destroyed until **the watcher process is restarted** - including this cycle's. That is the whole of the fix needed: restart it, then prove it by checking that the next cycle's log still contains the agent's own prose underneath the watcher's block. **This is instance eleven of the house defect and the nastiest variant yet** - not "built, wired, reports success, never fired", but "built, wired, TESTED GREEN, merged, and still not running", where the deploy step for a local script is a process restart nobody performs. Worth asking whether the watcher should re-read its own script, or stamp its loaded version into each cycle brief so a stale instance is visible. **CONFIRMED AGAIN BY CYCLE 65, 2026-08-28, and this is now three cycles in a row.** Start-of-cycle `git status` showed `.bidlow/relay/log/cycle-064.md` MODIFIED - the real 240-line log that cycle 64 committed to `main` had been replaced ON DISK by a 167-line stub opening `# Cycle 64 - finished / Work happened. Evidence: a git ref moved...`. Same signature, same stub text, one cycle later. Cycle 65 restored it with `git checkout HEAD -- .bidlow/relay/log/cycle-064.md` before committing anything, so nothing was lost - but that restore is now a manual step every cycle has to remember, and the cycle that forgets commits the stub over the real log permanently. The still-running watcher process has held the pre-fix script in memory since before commit `3d7fef6`. **A RESTART IS THE WHOLE FIX AND ONLY GREG CAN DO IT** - no relay cycle can restart the process that is running it. **FRESH EVIDENCE, cycle 71, 2026-08-28:** still firing. The working tree held a stubbed `cycle-070.md` starting "Cycle 70 - finished / Work happened. Evidence: a git ref moved" (155 lines) sitting on top of the REAL 129-line log committed as `3b0363c`, which opens "What I found before writing any code". Cycle 71 found it during the start-of-cycle `git status`, restored it with `git checkout --`, and did NOT commit the stub. That is the second consecutive cycle whose log had to be rescued by hand, so the merged fix is confirmed NOT running. **WHY IT SURVIVED THE ONE RESTART THAT DID HAPPEN - MEASURED BY CYCLE 72, AND THIS IS THE MISSING PIECE:** the restart Greg performed was at 07:26 UTC on 2026-08-28, and it could not possibly have carried this fix, because the fix DID NOT EXIST YET. `git show -s --date=iso-strict 3d7fef6` gives `2026-08-28T10:12:54+01:00` = **09:12:54 UTC** - one hour and forty-six minutes AFTER that restart - and `git log -S "Write-CycleLog" -- relay-watch.ps1` returns that commit and no other, so there is exactly one commit that introduced the appending writer and it landed after the only restart. The running watcher has therefore NEVER held the fixed script, and no amount of merging will change that. A SECOND restart is the entire remaining fix and only Greg can do it - `relay-start.cmd` in the ODoutreach folder, which clears HALT and reads the cycle number back out of STATUS.json. Until then, every cycle must keep rescuing its own log by hand at start-of-cycle. Cycle 72 also corrected `.bidlow/relay/RESTART-REQUIRED.md`, which still ended "No restart is outstanding" and would tell any reader this was closed. **NOTE for cycle 73+: cycle 72 found `cycle-070.md` on disk ALREADY IDENTICAL to `3b0363c`/`main` (129 lines, correct heading), so its own brief's instruction to rescue it was itself stale - cycle 71 had already restored it. Check `git status` and diff against `main` before restoring anything; do not restore blind.** **CYCLE 80, 2026-08-29 - THE RESTART HAS HAPPENED AND THIS ROW IS ALL BUT CLOSED. MEASURED, NOT ASSUMED.** This row's own acceptance test is quoted above: "prove it by checking that the next cycle's log still contains the agent's own prose underneath the watcher's block." That test now PASSES, and has for at least five consecutive cycles. `cycle-074`, `cycle-075`, `cycle-076`, `cycle-078` and `cycle-079` each open with the AGENT's own heading and each contain exactly one "The watcher's own record of this cycle" separator, which is the appending writer's signature - a truncating watcher leaves neither. `cycle-079.md` is the sharpest single receipt: 152 lines committed by cycle 79, 309 lines on disk afterwards, i.e. the watcher ADDED 157 lines instead of replacing the file. (`cycle-077.md` has no separator and that is NOT a stub - it opens "# Cycle 77 - finished", the shape Write-CycleLog produces when the agent wrote no log of its own to preserve.) So the running watcher does hold the fixed script, no cycle needs to rescue its own log by hand any more, and the standing instruction in this row to do so is now stale. Left TODO rather than closed by cycle 80 because this row belongs to another cycle and one more receipt costs nothing - but whoever takes it should expect to close it on evidence rather than on work.

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
  `DONE 81`, or back to `TODO` with a note if you could not do it.

## THE STATUS CELL: SIX WORDS, AND ONLY SIX

The status cell of a queue row MUST BEGIN with one of exactly these six:

    TODO    DONE    BLOCKED    PARTIAL    IN PROGRESS    WONTFIX

Markdown bold around it is fine - `| **DONE 81 - ...** |` reads correctly.
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

* Finished it -> `DONE 81 - <what you did, and the proof>`
* Did some of it -> `PARTIAL 81 - <what is done, what is left>`. PARTIAL
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

`.bidlow/STATE.md` is updated and merged. Cycle 81 is fully closed.

**On `main`:**
- `0b65cd4` — the row 52 fix (PR #350)
- `8b29c34` — the session record (PR #351)

Both merged with CI green on both checks. No open PRs, working tree clean.

## What STATE.md now records

**Row 52 closed on its own acceptance test** — `cycle-080.md` gained **181 lines with zero deletions**, which a truncating writer cannot produce. The manual log-rescue step every cycle was performing is retired, with the replacement rule written down: if a cycle log shows modified, run `git diff --stat`; insertions with zero deletions is the watcher working correctly.

**The class fix**, because closing instance eleven without touching what produced it just queues instance twelve. A restart leaves no trace in the repository — `git log` shows what was merged, nothing showed what was *loaded*. The watcher now hashes its own file at launch and stamps that into every cycle log, saying `RESTART REQUIRED` with both hashes and the word *INERT* when the running process is stale.

**The one outstanding item, marked non-urgent:** the stamp is inert until the watcher is next restarted — the very defect it reports. Nothing is broken meanwhile. `relay-start.cmd` at the next natural restart; you'll know it took when cycle logs carry a line beginning `Watcher script:`.

**Known weakness, not buried:** the wiring test is the weakest in that file and is labelled so in the file itself, because the call site sits inside the main loop and proving it end-to-end means running a live cycle.

**Near-miss carried forward:** never put a `|` in a QUEUE.md row, even inside code formatting. My first draft of the status cell had one inside a backticked example; it would have split the row and stopped the entire queue — committed by the cycle writing a row about being careful.

Nothing contradicts `.bidlow/PROJECT.json`. No production writes: no deploy, send, delete, schema change or migration.

**Open questions: 0.**

