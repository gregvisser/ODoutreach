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
