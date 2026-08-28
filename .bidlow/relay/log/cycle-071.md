# Cycle 71 - queue item 73, the shadow second table in QUEUE.md

## In one sentence

QUEUE.md had two tables and 80 rows; it now has one table and 65 rows, every row
has its own number, no job appears twice, and the harm the duplicates were doing
was demonstrated on the real watcher before it was removed.

## The pull request sweep

`gh pr list --state open` returned **nothing**. Zero open PRs. The sweep that the
brief rightly insists on was a no-op this cycle - cycle 70 and the Cowork
supervisor had already cleared the seventeen Greg counted this morning. Nothing
was left rotting and nothing red was left for me to explain.

## The brief was wrong in two places, and the truth was worse

The brief said rows 37-42 "appear in BOTH" tables and that the duplicated items
"appear again as 53-72". Both are inaccurate, and I am correcting them here and in
QUEUE.md rather than working around them, as the brief asks.

**What is actually true**, established by parsing the file rather than by reading
the summary:

* Rows 37-42 appear in both tables **holding different jobs**. Table one's #37 was
  "PR #297 has been open since cycle 49"; the second table's #37 was "owner request
  A, the setup-help templates". Same number, unrelated work. That is worse than
  the same job twice, not better.
* The duplicated *jobs* were **37-51 mirrored as 53-67** - fifteen pairs, not
  "53-72". The twin of N is N+16, exactly, including 48/64.
* Seven **numbers** appeared twice: 37, 38, 39, 40, 41, 42 and 69.

## Why duplicate numbers were actively dangerous, proved rather than argued

`Get-QueueRows` scans every line of the file, so both tables were in the picker's
list. `Set-QueueRowStatus` then finds a row **by number** and rewrites the **first
one it matches**, then returns.

I ran the shipped `relay-watch.ps1` against the pre-merge file:

```
Row #69 appears where, and saying what:
   line 359   DONE 62** - fixed, proven twice, and merged. The brief
   line 380   TODO

The picker walks in file order. The first #69 it would TAKE:
   line 380 - TODO

Now the relay finishes it and calls Set-QueueRowStatus 69 'DONE 71'.
AFTER the write:
   line 359   DONE 71      <-- the Sentry row's DONE 62 destroyed
   line 380   TODO         <-- the row actually worked on, unchanged
```

So the relay would have taken the do-not-contact read-quota item, and stamped its
result onto the Sentry item, wiping a real `DONE 62`. The row it actually worked
on stays `TODO`, so it comes back next cycle, and the next, for ever. Row #42 was
in the identical position: `DONE 54` above, `TODO` below.

This is the project's house defect in its purest form - the relay reported success
each time while the record it wrote was landing on the wrong row.

## What I did

**The merge, row by row.** 80 rows -> 65. The fifteen pairs were collapsed keeping
the more advanced status of each, adjudicated one at a time and written out
explicitly rather than by a rule, because **five of the fifteen genuinely
differed**:

| row | kept | why |
|---|---|---|
| 39 | `DONE 58` from the twin | table one still said TODO; cycle 58 had fixed it |
| 41 | `DONE 58` from the twin | table one still said TODO; the twin recorded the measurement |
| 43 | the twin's `TODO` | both TODO, but the twin carried live detail table one had lost |
| 46 | `DONE 58` from the twin | table one said `DONE 56` (pushed); `DONE 58` is when it landed on main |
| 48 | table one's `BLOCKED 70` | the twin was a stale `TODO`; cycle 70's verdict is later |
| 50 | table one's `DONE 64` | the twin was only a "DUPLICATE of row 50" marker |
| 51 | table one's `DONE 63` | the twin was a stale `TODO` |

Six survivors that collided by number were renumbered into free space - the second
table's 37-42 became **75-80**, and the second `#69` (the read-quota item) became
**81**. Each carries a note saying what it used to be. **Numbers 53-67 are retired**
and the prose at the top of the file now says so, because a cycle log from 58-64
that mentions one of them means the row now numbered sixteen lower.

**Verified nothing was lost.** 65 distinct jobs before, 65 after; zero jobs
dropped, zero invented, and every surviving status traceable to an original cell.

**The real watcher reads it**: 65 rows parsed, 0 unparseable, 0 duplicate numbers,
and the picker correctly identifies #74 as the next row to take.

## The thing I found that nobody was looking for, and it is load-bearing

`Invoke-SelfQueue` takes the first row in file order that is not `DONE` and not
`IN PROGRESS`. If that row is `BLOCKED` it writes a note and **idles** - it does
not skip past it, deliberately, because "the order is the plan".

So **a BLOCKED row placed above a TODO row silently stops the entire queue behind
it.** Row 48 went `BLOCKED` in cycle 70 and escaped doing that only by sitting at
the very bottom of the file by accident.

The obvious tidy-up when merging two tables is to sort the result by number. That
would have moved row 48 into the middle and halted the relay overnight. I nearly
did it.

This is not hypothetical: the Cowork supervision note written at 19:30 today,
which I found uncommitted, records that from 13:53 UTC the watcher spent **more
than five hours idle** for exactly this reason, with real TODO work behind it. So
the merged file deliberately keeps row 48 last, and
`relay/queue-file-integrity.test.ts` goes red if a `BLOCKED` or `WONTFIX` row ever
ends up above something still to be done.

## The test, red first

New `relay/queue-file-integrity.test.ts`, seven assertions against the **real**
QUEUE.md rather than a fixture - a fixture would only prove the assertions
compile. It went red before the merge and green after:

```
BEFORE                                            AFTER
x gives every row its own number                  ok
x does not carry the same job twice               ok
x keeps every row in one contiguous table         ok
ok has rows at all (guards against vacuity)       ok
ok has exactly one table header                   ok
ok every status is one of the six words           ok
ok BLOCKED rows sit below everything to do        ok
Tests  3 failed | 4 passed                        Tests  7 passed
```

One knock-on: `relay/powershell-timeout-budget.test.ts` flagged the new file,
because its detector matches any spec that says "PowerShell" and my comments
explain what `Get-QueueRows` does. The new file starts no host and finishes in
2ms; giving it a 30-second budget to satisfy a detector it only trips in prose
would blunt fail-fast on a fast test. That guard already handles this exact case
for itself by name-exclusion, calling it "the honest thing to write down", so I
followed its own precedent and added mine to the same list with the reason.

## What I deliberately did NOT fix, and why

`Set-QueueRowStatus` writing to the first matching row is a real defect in
`relay-watch.ps1`. Removing the duplicates removes today's trigger, and the new
test keeps them out **in CI** - but the watcher rewrites QUEUE.md locally between
cycles, where no test is watching.

I did not fix it, because my own brief put `relay-watch.ps1` off-limits and the
standard is one concern per diff. It is written up as **new row 82** with the
mechanism, the proof above, the line number, the recommended fix (count the
matches and refuse when there is more than one, exactly as that function already
refuses a row it cannot parse), and the note that `relay/queue-parser.test.ts`
already drives the real PowerShell so red-first there is easy.

## Also found: the log stubber is still running

The start-of-cycle `git status` showed `cycle-070.md` modified. The working tree
held a 155-line generic stub - *"Cycle 70 - finished. Work happened. Evidence: a
git ref moved"* - sitting on top of the real 129-line log committed as `3b0363c`,
which opens *"What I found before writing any code"*. I restored it with
`git checkout --` and did not commit the stub.

Row 51's fix for this is merged; row 52 says it is still not running. That is now
confirmed for a second consecutive cycle, and I have appended the dated evidence
to row 52 so the next cycle does not have to rediscover it.

I also found an untracked Cowork supervision note from 19:30 today. It is real
work by the other writer, so it is committed here rather than left to be lost -
the queue records four previous near-losses of exactly this kind.

## Gates

| gate | result |
|---|---|
| `npm run lint` | clean, no output |
| `npm run typecheck` | clean, no output |
| `npm test` | **309 files, 3051 tests, all passed** |

One caveat, reported rather than hidden: the first full run had a single failure,
`src/lib/monitoring/sentry-config-wiring.test.ts` timing out at 5000ms. It passes
on its own (4/4) and the very next full run was 3051/3051 green. It is a
load-dependent flake of the same class this repo already documented in
`powershell-timeout-budget.test.ts`, and nothing I changed is imported by it - my
diff is QUEUE.md and two files under `relay/`. Not chased further, but recorded.

## Open questions: 1

Numbers **53-67** are retired rather than reused. If Greg or a future cycle would
rather compact the table so the numbers run 1-N with no gaps, that is a five-minute
job now that there is only one table - but it would break every cycle log from 58
onwards that cites a row by number, so I left the gaps and documented them instead.

## Interrupted

This cycle was still marked 'running' when the watcher started again at 2026-08-28 21:12:23, so it was stopped part-way through.

Whatever it had already done on disk is done; whatever it had not is not. This note records that the cycle ended without finishing - it does NOT undo anything.
