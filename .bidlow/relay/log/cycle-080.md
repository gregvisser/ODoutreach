# Cycle 80 - queue row 40: making a finding in a log reach the next cycle

## Sweep first

`gh pr list --state open` found **one** PR: **#348** (`fix/cycle-log-credential-gate`,
cycle 79's credential gate on cycle logs), with both checks still `IN_PROGRESS` -
it had been opened minutes earlier. Not green, so not mine to merge yet, and not
red either, so there was nothing to diagnose. I branched off its head rather than
off `main`, so this cycle's PR sits cleanly on top of it instead of racing it.

Nothing else was open. No PR was abandoned this cycle.

## What the row asked for, and why I did not build either thing it suggested

The row named two candidate mechanisms and explicitly left the choice open. I
rejected both, and the reasons are the actual content of this cycle.

**A machine-readable findings block that the brief requires** is the same class of
fix the row itself forbids two sentences earlier. It asks the author to remember a
format. Cycle 50 remembered the *intent* - it wrote "I'm queueing it as a new row"
- and still exited without doing it. A stricter thing to remember is not a fix for
forgetting.

**The close-gate as literally described** - refuse to record a cycle as `finished`
when its log states a queue intention *while QUEUE.md was not modified by that
cycle* - is the interesting one, because it sounds exactly right and **it would
have caught neither of the two cases this row is about.**

Both cycles modified QUEUE.md. Each stamped its own row `DONE` on the way out;
cycle 52's log opens "Row 36 is `DONE 52`, merged and deployed." A check on "did
the file change" is satisfied by every cycle that ever ran, including the two that
failed.

What separates them is narrower and it is the whole design: **mirroring a finding
means a row NUMBER exists that did not exist before.** So the watcher records the
set of row numbers before handing the brief over, takes it again afterwards, and
compares. Stamping your own row DONE does not create a number. Adding a row does.

I have corrected the row's wording in QUEUE.md rather than quietly building
something different, as the brief asks.

## The four things, written down before I touched anything

1. **Files.** `relay-watch.ps1`; a new `relay/unmirrored-finding.test.ts`;
   `relay/powershell-timeout-budget.test.ts` (its non-vacuity list is a hard-coded
   array of three spec names and a fourth PowerShell-driving spec makes it red);
   `.bidlow/relay/QUEUE.md`; this log. I added one file I had not predicted -
   `relay-selftest.ps1` - and say below why.
2. **Red-first test.** `relay/unmirrored-finding.test.ts`, asserting the detector
   fires on the real `cycle-050.md` and `cycle-052.md`, stays silent on
   `cycle-072.md`, and fires on a bounded minority of all 78 real logs.
3. **Done.** When a cycle writes down that it found something for the queue and
   then does not add a queue row, the relay puts that finding into QUEUE.md itself,
   in the cycle's own words.
4. **Not touched.** No schema, no migration, no send path, no `.gitignore`, no
   client data. Nothing outside the files above.

## What I built

Four functions in `relay-watch.ps1`, plus the wiring in the loop.

* **`Get-CycleOwnWords`** - the cycle's own text, with the brief and the watcher's
  own record cut out. This is not tidiness; see the trap below.
* **`Get-CycleHandoffPassages`** - the whole lines in which a cycle handed
  something on. Nine deliberately narrow patterns, capped at six passages.
* **`Get-UnmirroredFindingVerdict`** - a pure decision over (log text, row numbers
  before, row numbers after), so it can be driven from a test with any pair of
  sets instead of by running a real cycle and hoping.
* **`Add-QueueRowForHandoff`** - copies the cycle's sentences into a new `TODO`
  row, verbatim.

The relay interprets nothing. Every word after the arrow in the new row is the
cycle's own. That is the same licence `Repair-UnreadableQueueRow` already
operates under, and it is the only form in which "the relay writes to QUEUE.md"
is compatible with the standing rule that the relay never invents.

**A note file was considered and rejected on the row's own evidence.** Nobody
reads those. That IS the finding. `SELF-QUEUE-NOTE.md` was written into a file
nobody was reading while the relay sat silent for thirty minutes, and the fix that
day was to make it push. Here the push is into the one channel every cycle
demonstrably reads.

## Proving it fires, not that it exists

**Red first, and properly red.** 24 of 25 tests failed before the code existed -
`Add-QueueRowForHandoff : The term ... is not recognized` - on both PowerShell
hosts. The one that passed was the timeout-budget receipt.

**The fixtures are the real logs, from git.** `cycle-050.md` and `cycle-052.md`
are read off disk and fed in whole. 050 yields `I'm queueing it as a new row`;
052 yields `for you rather than for me`. Those are the exact two sentences the
queue row quotes, recovered by the detector rather than pasted into a fixture
written to make it pass. This is the concrete thing cycle 53's tracking change
bought, used for the purpose it was bought for.

**The false-positive rate is measured, not asserted.** The row demanded this and
`relay/tracked-artefacts.test.ts` is right about why. Over all 78 real cycle logs
the detector fires on **five**: 050, 052, 062, 070 and 076. The last three are
genuine handoffs - `## Note for the next cycle`, `## For the next cycle`, "the
next cycle should know it can occur" - so the class is real and the rate is 6%.
The test holds it to a ceiling of 12 **and a floor of 2**, because a detector that
matched nothing would pass every other assertion in the file while checking
nothing, which is this repository's most-recorded defect.

**The ceiling caught a real bug on its first run**, and this is the strongest
argument for having written it that way. My first version ended
`return ,$found.ToArray()` - the comma operator, added out of habit to stop
PowerShell unrolling a single-element result. For an EMPTY result it returns a
one-element array *containing* the empty array, so `@(...).Count` was 1 for every
log ever written and the detector fired on **all 78 of them**. A gate that cries
wolf on night one, caught before it shipped, by the assertion that exists to catch
exactly that. The comment on that line now says so.

## Two traps that would have made this noise, and how each was closed

**The brief is inside every log.** Every cycle log embeds the whole brief under
`## What it was asked to do`. Cycle 72's brief - written by Greg, not by the cycle
- contains "If you believe otherwise, that is a separate finding, not this cycle."
Scanning the raw log fires on the *instruction*. Measured: 6 of 78 logs match
untrimmed, 5 when the brief is cut out, and `cycle-072` is precisely the
difference. There is a test for that one log by name.

**Where the row goes is not cosmetic.** `Invoke-SelfQueue` takes the first row in
file order that is not DONE and not IN PROGRESS, and **idles** when that row is
BLOCKED - it does not skip past it, because the order is the plan. So a row
appended to the bottom of the table would be buried behind a permanent stop, and
would also go red in `queue-file-integrity.test.ts`, which exists because that
nearly happened to row 48. The new row is inserted immediately ABOVE the first
BLOCKED or WONTFIX row instead.

## Fails closed, in three places

* The row is written and then **read back through `Get-QueueRows`** - the picker's
  own parser. Anything short of a clean, parseable `TODO` row rolls the file back
  to the exact original lines. A row the relay could not read would stop the whole
  queue: the seventh-word failure, caused this time by the relay itself.
* Pipes in the quoted prose become `/` and newlines collapse to spaces. A raw pipe
  would be the `NODE|20-lts` defect written by the watcher; a newline would split
  one row into two lines and cut the table in half.
* No table to anchor to means it refuses and changes nothing, rather than
  inventing a table.

Only a cycle that ended NORMALLY is checked. A killed cycle has already had its
row given back, and reading a handoff out of a half-written sentence is exactly
the cry-wolf failure this is built to avoid.

**What is emailed is the failure, not the success.** A queue row that arrives by
itself needs no announcement. A finding the relay could not carry has nowhere to
go, and that one pushes.

## The wiring, and the one thing I did not add to my own file list

A detector nobody calls is the house defect, so the loop now captures the row
numbers before the agent starts and runs the check after the log is written.

The loop cannot be dot-sourced - everything below `if ($LoadOnly) { return }` is
unreachable from a test - so I added **section 7 to `relay-selftest.ps1`**, which
the watcher runs on every start and refuses to run if it fails. It performs the
same composition the loop performs, on the real machine, against the real script:
read the rows, judge the log, carry the words, read the queue back, check the
placement. Eleven checks. It also replays the real `cycle-050.md`, so the detector
is held against true history at every start and not only in CI.

**Proved capable of failing:** I deliberately removed the above-the-BLOCKED-row
placement and watched section 7 go red naming the wrong order -
`it is placed ABOVE the BLOCKED row ... (order was 1,2,3,4)` - then restored the
file and confirmed the diff was clean.

## A separate finding, and I am mirroring it rather than describing it

Row 52 says the running watcher still holds the pre-fix script, that every cycle
must rescue its own log by hand, and that only Greg can fix it with a restart.
**That is now stale, and its own acceptance test says so.**

Row 52 states the test itself: "prove it by checking that the next cycle's log
still contains the agent's own prose underneath the watcher's block." I checked
five consecutive cycles. `cycle-074`, `075`, `076`, `078` and `079` each open with
the *agent's* own heading and each contain exactly one
`The watcher's own record of this cycle` separator - the appending writer's
signature, which a truncating watcher leaves neither of. `cycle-079.md` is the
sharpest receipt: 152 lines committed by cycle 79, **309 lines on disk
afterwards**. The watcher added 157 lines rather than replacing the file.

`cycle-077.md` has no separator and that is NOT a stub: it opens
`# Cycle 77 - finished`, which is the shape `Write-CycleLog` produces when the
agent wrote no log of its own to preserve.

I have written this into row 52's cell in QUEUE.md rather than leaving it here,
which is the entire point of the row I was working on. I did not close row 52 -
it belongs to another cycle, and one more receipt costs nothing - but whoever
takes it should expect to close it on evidence rather than on work.

## Gates

* `npm run lint` - 0
* `npm run typecheck` - 0
* `npm test` - **3188 passed / 317 files** (was 3162 / 316)
* `relay-selftest.ps1` - **35 checks passed**

## Honest limits, stated rather than rounded up

* The four functions and their composition are proved on the real machine at every
  watcher start. The single line inside the `while` loop that calls them cannot be
  dot-sourced, and is verified by reading rather than by running.
* Like every change to `relay-watch.ps1`, this is **inert until the watcher process
  is restarted** - PowerShell parses a script once at launch. Row 52 is the record
  of what that cost last time. Nothing here fires tonight unless the watcher is
  restarted; the evidence above says a restart has already happened once, so the
  path is known to work.
* The detector reads English prose with regular expressions. It will miss a
  handoff phrased in a way none of the nine patterns anticipate. It is a floor
  under the current failure, not a proof that no finding can ever be stranded.

**Open questions: 0.**
