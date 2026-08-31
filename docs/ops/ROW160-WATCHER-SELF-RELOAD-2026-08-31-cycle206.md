# Row 160 - the watcher reloads itself when its own script changes

Written 2026-08-31 by cycle 206.

## The problem, as measured (not guessed)

`relay-start.cmd` launches `relay-watch.ps1` once. PowerShell reads a script
ONCE, at launch, and runs from memory after that - merging a fix to the file
does nothing to a process already running the old code. `RESTART-REQUIRED.md`
records four restarts of exactly this shape; the worst (31 August) cost six
cycles (185-190) re-verifying work that had already correctly merged, because
the process making the reopen decision had never seen the fix. Every one of
those needed a human to notice and run `relay-start.cmd` by hand. Greg asked
for this directly on 31 August: a stale watcher is a blocker he cannot see,
and he should not have to notice it.

## What shipped

**`relay-watch.ps1`**

* `Test-WatcherSelfReloadNeeded` - pure, injectable `-HashCheck` - compares the
  hash captured at launch (`$script:LoadedScriptHash`) against a fresh read of
  the file on disk. Fail-safe: a missing launch hash, a read that throws, or a
  read that returns nothing is reported as "cannot tell", never as a reload.
* `Start-FreshWatcherProcess` - side-effecting, injectable `-Launcher` -
  spawns a new watcher running the SAME PowerShell host as the current
  process (`(Get-Process -Id $PID).Path`), passing `relay-watch.ps1`'s own
  path. A throwing launcher, or one that returns no process handle, is caught
  and reported as `Spawned = $false` rather than allowed to kill the caller.
* Wired at the very TOP of the main `while ($true)` loop, immediately after
  the HALT check and strictly before any row is picked or
  `Invoke-CycleAgent` is ever called. `Invoke-CycleAgent` is synchronous, so
  that point in the loop is reachable only once every cycle this process has
  started has fully finished, or on the very first iteration before any cycle
  has run at all - never mid-cycle, and never with a row still `IN PROGRESS`.
  On success it logs plainly and exits with a new, distinct code (`44`); on
  failure it logs plainly and falls through to carry on with the current
  (stale) process, per "fail safe, not fail shut" - the exact lesson of the
  two-hour brick this same file caused on 31 August.
* `Save-Status` now writes `scriptHash` and `processStartedAt` into every
  `STATUS.json` write, sourced from module-scope so every call site gets them
  for free. This is the "make staleness visible even when the reload does not
  fire" half of the brief - a human (or a future check) can see which code a
  given `STATUS.json` reflects without finding the process's PID.

**`relay-start.cmd`**

* Exit code `44` is handled distinctly from `42` (cycle-budget rollover) and
  `43`/other (real stop). On `44` the watcher has ALREADY spawned its own
  replacement (a separate, independent process) before exiting, so
  `relay-start.cmd` must not also start one - doing so would run two watchers
  at once, exactly the "new process must not fight the old one" failure the
  brief names. The `:reloaded` branch says so plainly and ends the batch
  script (`goto :eof`) rather than looping back to `:relayloop`.

**Tests, all four named in the brief, plus wiring proof:**

* `relay/watcher-self-reload.test.ts` (31 tests, both `pwsh` and `powershell`
  hosts) - dot-sources the shipped `relay-watch.ps1` with `-LoadOnly` and
  drives the real functions:
  1. unchanged hash does NOT flag a reload (injected hashes, and a real file
     read twice with nothing changed in between)
  2. changed hash DOES flag a reload (injected hashes, and the row-52
     scenario reproduced with real file I/O: a copy is loaded, really edited
     on disk afterwards, and re-hashed)
  3. the reload cannot fire mid-cycle - proven at source level (the live loop
     cannot be driven under `-LoadOnly` or without running a real cycle, same
     argument `stale-watcher-visible.test.ts` already makes for its own
     wiring backstop): the call site sits after the HALT check and strictly
     before `Invoke-CycleAgent` is ever invoked, and appears exactly once
  4. a failed spawn (a throwing launcher, and a launcher returning no process
     handle) leaves `Spawned = $false` and the CALLER still running - proven
     by the harness process itself completing normally rather than dying,
     which is what would happen if the exception were allowed to escape
  * Plus: `Save-Status` writes both new fields into a scratch `STATUS.json`
    (never the real one - `$StatusFile` is repointed before the call); and
    `relay-start.cmd` checks errorlevel 44 ahead of 43/42 and the `:reloaded`
    branch ends cleanly without a second spawn.
* `relay-selftest.ps1` section 16 (14 new checks, real functions, real file
  I/O for the row-52 reproduction, real `STATUS.json` fields) - the
  operational safety gate, not just CI. **Self-test check count: 113 -> 127.**

**Red-first, proven by reverting the source and re-running the same test
file** (`git stash` on `relay-watch.ps1` + `relay-start.cmd`, `npx vitest run
relay/watcher-self-reload.test.ts`, then `git stash pop`):

```
Before the change: 30 of 31 tests FAIL (the 31st only asserts the test
                    timeout budget itself, which does not depend on the fix)
After the change:  31 of 31 tests PASS
```

## Gates, run and shown

```
npm run lint        -> 0 errors
npx tsc --noEmit     -> 0 errors
npm test             -> 371 files, 3862 tests, all green after fixing
                        relay/powershell-timeout-budget.test.ts's explicit
                        spec list (it names every file that drives
                        PowerShell, by design, so adding a new one meant
                        updating that list too - proven itself by running
                        red first)
relay-selftest.ps1   -> SELF-TEST PASSED - 127 checks (up from 113)
```

Two unrelated tests (`src/instrumentation.test.ts`,
`src/lib/monitoring/sentry-config-wiring.test.ts`) timed out once under the
full 371-file suite's resource contention and passed cleanly (431ms/486ms) in
isolation - pre-existing flakiness under load, not a regression from this
row; nothing in this change touches Sentry or instrumentation.

## THIS CHANGE IS INERT UNTIL GREG RESTARTS THE RELAY

Per this repository's own standing rule: a change to `relay-watch.ps1`, or a
file it loads at launch, does nothing to the process already running it.
`.bidlow/relay/STATUS.json` proves the live process has not picked this up -
at the time of writing it still has no `scriptHash` or `processStartedAt`
field, which only the fixed `Save-Status` writes:

```json
{
    "cycle":  206,
    "lastOutcome":  "running",
    "updated":  "2026-08-31T20:36:07...",
    "lastSelfQueued":  205,
    "refusedAt":  null
}
```

That is expected and correct - it is direct, current evidence that the
running watcher predates this fix, exactly as `relay-watch.ps1`'s own header
comment describes ("PowerShell reads that script ONCE, at launch"). The
self-reload THIS ROW SHIPS is exactly what removes the need for this note
going forward: once Greg runs `relay-start.cmd` one more time, every
subsequent merge to `relay-watch.ps1` should reload the watcher on its own,
between cycles, without anyone noticing or acting.

**How to know it worked, without waiting for another restart:** the next
cycle log's `Watcher script:` line will name the hash `relay-watch.ps1`
carries on `main` at merge time, and the next `STATUS.json` write will carry
`scriptHash` and `processStartedAt`. From then on, if this file changes again
before the next restart, the running watcher should exit with `New watcher
started (PID ...) ... Handing over and exiting cleanly.` in its own log
between cycles, and `relay-start.cmd`'s window (if that is how the relay was
started) will print the `:reloaded` message instead of pausing on a "stopped"
message.

## Scope discipline

Nothing outside `relay-watch.ps1`, `relay-start.cmd`,
`relay-selftest.ps1`, `relay/watcher-self-reload.test.ts`, and
`relay/powershell-timeout-budget.test.ts`'s spec list was touched. No
`.bidlow/GRADES.json`, no dimension, no sell gate. No client data, no
migration, no email sent - this row is entirely about the relay's own
operating process.
