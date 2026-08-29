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
