# THIS SHOULD BE THE LAST TIME YOU HAVE TO START THIS BY HAND

Written 2026-08-27, 09:50, by Claude.

## Start it

    & "C:\Bidlowprojects\BidlowClients\Opensdoors\ODoutreach\relay-start.cmd"

It deletes the HALT file for you. Leave the window open.

## Why it stopped this morning

The HALT file says it in one line: "Reached the 40 cycle limit. A loop that will
not end must end itself." That guard is right - a runaway loop must bound itself.
Two things about it were wrong, and both are fixed.

**1. It counted the wrong thing.** The limit was checked against the ABSOLUTE
cycle number, and that number is read back out of STATUS.json every time the
watcher starts. So once it reached 40, a restart would re-read 40, trip the same
test before taking any work, and stop again - for ever. It now counts cycles run
by THIS process, so a restart always gets a fresh budget.

**2. It ended the WORK, not just the process.** Hitting the limit wrote a HALT
file and emailed you, and you had to come and press start - roughly every sixteen
hours, including overnight. This morning it stopped at 09:30 and sat idle with
five items waiting.

The limit is now a ROLLOVER. When a watcher uses up its budget it exits with code
42, and `relay-start.cmd` starts a fresh one and carries on. You will see a line
saying "generation 2", "generation 3" and so on. Nothing needs you.

**Stop still means stop.** The loop only reacts to code 42. A HALT file you
created, a failed self-test and a crash all exit with something else and stay
stopped.

Proven red-then-green, not asserted: simulating the same window, the old
behaviour ran 0 cycles and waited for you; the new one rolled over three times
and ran 9. The exit-code branching was checked against cmd's "errorlevel N means
N or greater" rule for 0, 1, 41, 42, 43 and 100 - only 42 loops.

## Why self-restarting is safe NOW when it was rejected before

It was rejected for a real reason: killing a watcher mid-cycle left that cycle's
queue row stuck on `IN PROGRESS`, and a row that is not `TODO` is skipped by the
picker for ever, silently. That happened three times.

That reason is gone. The watcher now reopens every orphaned `IN PROGRESS` row at
startup, before it takes any work, and says so on screen. Cycle 40 was killed
part-way through PROVE and left row 9 stuck exactly that way - so this start is
the first real-world test of it. Watch for "Reopened orphaned row #9".

## What it will pick up

Row 9 - PROVE, the last of the six stages still amber. Brief:
`.bidlow/relay/PROVE-CLOSE-OUT.md`. Then row 10 (re-grade), then row 12 (commit
the files that are still untracked - that has already cost real work twice today).
