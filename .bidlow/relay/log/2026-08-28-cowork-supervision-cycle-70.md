# Cowork supervision, 2026-08-28 19:30-20:00 UTC - after cycle 70

Written by the Cowork half of the relay. Greg was away. Nothing here was asked of
him and nothing here waits on him except the two things named at the bottom.

## The relay is healthy. It was not stuck - it was refusing, correctly.

At 19:33 UTC `STATUS.json` read cycle 70, `lastOutcome: finished`, updated
19:29:59 UTC - four minutes old. No `HALT` file. No `NEXT.md`. Cycle 70 itself ran
14:17:34 to about 14:53, inside the healthy band and nowhere near the 45-minute
timeout, which is present in the watcher as `$CycleTimeoutMinutes = 45` with a
process-tree kill.

From 13:53 UTC the watcher had been waking, reading the queue, and writing
`SELF-QUEUE-NOTE.md` instead of a brief. Its reasoning was right and is worth
keeping: the next row in order was 48, row 48 is `BLOCKED`, and the relay does not
skip a blocked row because the order is the plan. **But that meant more than five
hours idle with real TODO work behind it**, and nothing inside the machine could
resolve it, because the block is a question only Greg can answer. Reordering is
the remedy the note itself names.

**That reorder has since happened and the relay is moving again.** Row 48 was
moved to the foot of the main table at about 19:38 UTC, the watcher self-queued at
19:45:01, and **cycle 71 is running on row 73 - the shadow-second-table merge**.
Its status is `running`, started 19:45:01 UTC.

## What cycle 70 actually achieved - verified against git, not believed

Every claim in the cycle-70 log was checked against `git log` and the files on
disk. All of it holds:

* `3b0363c` is on `main` - `.bidlow/STATE.md` updated, and the real 145-line
  `cycle-069.md` restored after cycle 70 committed a stub over it in #329.
  Confirmed by reading `main`'s copy: it is the real log, not the stub.
* `c64543e` (#328) is on `main`. That is the regression cycle 70 found and closed:
  `resolveDefaultSheetRange` took the FIRST tab unconditionally, which would have
  silently repointed any of the 32 healthy blocklists whose `Sheet1` was not
  first. An existing exact `Sheet1` now wins.
* Row 48's status cell reads `BLOCKED 70` and describes the state accurately.
* The PR chain #319 to #330 is present on `main` as sequential merges, which
  corroborates the "zero open PRs" claim. `gh` is not reachable from this side, so
  that one is corroborated rather than independently verified.
* Production running `c64543e` could NOT be verified from here - the direct App
  Service URL returns 403 to this network. Taken on the cycle's word and flagged
  as unverified rather than counted as proof.

**Verdict: cycle 70 did real work and reported it honestly, including its own
mistake.** No sign of the report-success-having-done-nothing pattern that this
project has recorded seven times.

## The finding this check turned up, which nobody had noticed

**The watcher restart on 2026-08-28 did not carry the fix it was performed for,
and cycle logs are still being destroyed.**

`RESTART-REQUIRED.md` marks itself RESOLVED at 07:26 UTC on the strength of Greg
running `relay-start.cmd`. That is wrong, and the timestamps prove it:

* Greg restarted the watcher at **07:26 UTC**.
* `Write-CycleLog` - the whole of row 51's fix, the thing the restart existed to
  activate - landed on `main` in `3d7fef6` at **09:12 UTC**.

The fix arrived one hour and forty-six minutes AFTER the restart. The process
running since 07:26 has therefore never held the fixed script, and row 52's
diagnosis - a stale PowerShell process holding a pre-fix script in memory - is
still exactly right, one restart later.

The damage since is measured, not assumed:

* Cycle 69's real 145-line log was clobbered on disk. It survived only because
  cycle 70 happened to notice and restore it from `06b8a37`.
* **Cycle 70's own log was then clobbered in turn, and nobody has rescued it.**
  `.bidlow/relay/log/cycle-070.md` on disk is the 155-line watcher stub - watcher
  boilerplate, the brief, and the agent's last stdout message. The real 129-line
  log survives only on `main` in `3b0363c`. The next cycle has been asked to
  restore it with `git checkout main -- .bidlow/relay/log/cycle-070.md` before it
  commits anything.

Every cycle from here loses its own account of itself until the watcher is
restarted again.

## Queue findings, verified on disk

Cowork could not write to `QUEUE.md` from its side this session, and by the time
that was clear cycle 71 was already rewriting the file. Editing it concurrently is
the precise hazard row 73 warns about, so these were handed to the next cycle in
`NEXT.md` with the evidence attached rather than being applied here.

* **The open-tracking row (49 before cycle 71's merge) - still true, and no
  longer Greg's.** `/api/track/` is still absent from `src/lib/public-paths.ts`,
  so the pixel is still behind the login and has still never recorded an open. But
  the row's own caution - decide whether opens should resume, because OpensDoors
  were told in writing that tracking is off - has expired.
  `src/lib/tracking/client-open-tracking.ts` replaced the global
  `OPEN_TRACKING_PIXEL` switch with a per-client opt-in that is off unless staff
  enable it AND the client's tracking domain is DNS-verified. Making the route
  reachable turns tracking on for nobody, so the written promise is now kept by
  construction rather than by a bug. **This is the work queued next.**
* **Row 47 - the symptom is gone and the evidence went with it.**
  `.bidlow/GRADES.json` is clean in `git status`, `closed_on` appears nowhere in
  `src/` or in GRADES.json, and CR-05 is still `status: OPEN`. The four red
  `grade-record.test.ts` tests the row describes cannot be failing - the
  uncommitted file was discarded, most plausibly by a between-cycle
  `git reset --hard origin/main`, and the signed Sentry Art.28 DPA evidence dated
  2026-08-28 went with it. Smaller job now, and a different one: add the optional
  `closed_on` field to the blocker schema in `src/lib/grade-record.ts`, then
  re-record the CR-05 evidence and commit it.
* **Row 52 - still TODO, and now measured rather than inferred.** See above.
* **Row 73 - the shadow table was worse than the row states, and cycle 71 is on
  it now.** The two tables disagreed about live rows: main-table rows 37, 38, 39
  and 41 all read `TODO` while the same work read `DONE 57`, `DONE 58`, `DONE 58`
  and `DONE 61` in the second table, and row 42 read `DONE 54` in one and `TODO`
  in the other. Five rows of finished work were sitting in the picker's path as
  TODO. With row 48 moved down they were close to being taken, so cycle 71 picked
  this up at the right moment.

## The two things that need Greg, and nothing else does

1. **Restart the relay watcher, once.** In the ODoutreach folder, run
   `relay-start.cmd`. It clears HALT, reads the cycle number back out of
   STATUS.json and carries on; nothing in the queue is lost. This is the only fix
   for the log destruction, no relay cycle can restart the process that runs it,
   and until it happens every cycle's own account of itself is overwritten.
   `RESTART-REQUIRED.md` currently says this is resolved. It is not.

2. **Answer the Train Hugger question in row 48.** Their "Domains" tab holds
   **291** domains today; we hold **373** stored from before 2026-08-14. Did they
   deliberately shorten the list - in which case confirm the shrink, and 82
   domains become contactable - or did rows go missing from the sheet, in which
   case put them back, re-sync, and nothing is lost? Until it is answered the 373
   stay blocked, which is the safe direction and costs only some unnecessary
   blocks. The guard refusing this is the guard working; it is not a fault.

## The hard rule, restated

Real email may be sent, and data deleted, ONLY for the `bidlowai` client. Every
other client may be built on, tested and measured, but nothing leaves the
building for them.
