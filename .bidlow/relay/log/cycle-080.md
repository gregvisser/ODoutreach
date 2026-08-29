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


---

## The watcher's own record of this cycle

Everything ABOVE this line was written by the cycle itself, and is kept exactly as the cycle left it. Nothing above was edited, shortened or reordered.

This section is written by `relay-watch.ps1` after the cycle's process has
exited. It is the independent half of the record: the cycle above says what it
meant to do, and this says what actually moved on disk, how long it took, and
how the process ended. Where the two disagree, this half is the evidence.
# Cycle 80 - finished

Work happened. Evidence: a git ref moved, so something was committed; the working tree changed, so files were edited; these files named in the brief changed on disk: relay-watch.ps1.

Started 2026-08-29 01:20:12, took about 31.8 minutes.
How it ended: exit code 0.

Evidence checked: git refs on every branch, the working tree, and these
files named in the brief: relay-watch.ps1, relay/tracked-artefacts.test.ts, bidlow/relay/QUEUE.md

## What it was asked to do

# Cycle 80 - queue item 40

This brief was written by the relay itself, off the top of QUEUE.md. Greg has
not read it. If it is wrong, say so in your log rather than working around it,
and correct QUEUE.md.

## The item, verbatim from the queue

> **TRACKING A LOG MAKES IT DURABLE, NOT READ - THE RESIDUAL ROW 38 DELIBERATELY DID NOT CLAIM TO FIX.** Cycle 53 chose to track cycle logs and proved they reach git, which closes the "lost" half of row 38. The other half is untouched and must not be assumed closed. **The evidence that it is a real and separate problem: `cycle-050.md` was NEVER deleted.** It has been on disk, readable, the whole time. Cycle 52 still spent its entire reconnaissance re-deriving the finding inside it, because nothing downstream reads 50-odd old logs - the channel every cycle actually reads is QUEUE.md. So durability was never the binding constraint; attention was. Measured alongside it: of 13 non-boilerplate finding sections across the logs, 4 were never mirrored into QUEUE.md, and recovery in every one of those cases depended on an external supervisor happening to read the log later, at the cost of a cycle. **DO NOT solve this by making the agent promise to remember** - cycle 50 wrote "I'm queueing it as a new row" and then exited without doing so, and cycle 52 wrote "two things for you rather than for me" and did the same. A rule that relies on the author remembering is precisely what has already failed twice. Candidate mechanisms, none yet chosen: a close-gate in `relay-watch.ps1` that refuses to record a cycle as `finished` when its log states a queue intention while QUEUE.md was not modified by that cycle; or a machine-readable findings block the brief template requires and the watcher checks. **Weigh the false-positive cost seriously** - `relay/tracked-artefacts.test.ts` argues, correctly, that a gate that cries wolf gets ignored, which is how this repository got here. Whatever is built must be proved to FIRE against the real cycle-50 and cycle-52 logs, which are now IN GIT and can be replayed as fixtures - that is the concrete thing cycle 53's tracking change bought.

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
  `DONE 80`, or back to `TODO` with a note if you could not do it.

## THE STATUS CELL: SIX WORDS, AND ONLY SIX

The status cell of a queue row MUST BEGIN with one of exactly these six:

    TODO    DONE    BLOCKED    PARTIAL    IN PROGRESS    WONTFIX

Markdown bold around it is fine - `| **DONE 80 - ...** |` reads correctly.
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

* Finished it -> `DONE 80 - <what you did, and the proof>`
* Did some of it -> `PARTIAL 80 - <what is done, what is left>`. PARTIAL
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

Cycle 80 complete. Row 40 is `DONE 80`, merged as `01ba0f8`, deployed and verified by hash against the direct App Service URL.

## What the row asked for, and what I built instead

Row 40 offered two candidate mechanisms. I rejected both, and that rejection is the substance of the cycle.

A **machine-readable findings block the brief requires** is the same class of fix the row forbids two sentences earlier — it asks the author to remember a format, and cycle 50 remembered the *intent* ("I'm queueing it as a new row") and still exited.

The **close-gate as literally described** — refuse to record `finished` when the log states a queue intention *while QUEUE.md was not modified* — sounds right and **would have caught neither case**. Both cycles modified QUEUE.md; each stamped its own row `DONE` on the way out. The signal that separates them is the set of row **numbers** before and after: mirroring a finding creates a number that did not exist before. I corrected the row's wording rather than quietly building something different.

The watcher now reads the cycle's own words, and if the cycle handed something on while adding no new row, copies those sentences verbatim into QUEUE.md as a TODO row — the same licence `Repair-UnreadableQueueRow` already has. A note file was rejected on the row's own evidence: nobody reads those, which *is* the finding.

## Proof it fires

- **Red first** — 24 of 25 failed before the code existed, on both PowerShell hosts.
- **Real fixtures from git** — `cycle-050.md` and `cycle-052.md` replayed whole, yielding the exact two sentences row 40 quotes.
- **False-positive cost measured** — 5 of 78 real logs (6%), held to a ceiling of 12 **and a floor of 2**.
- **That ceiling caught a real bug on its first run**: `return ,$found.ToArray()` made an empty result a one-element array, firing on all 78 logs. A gate that cried wolf on night one, caught before shipping.
- **Fails closed** — the row is read back through the picker's own parser and rolled back if unparseable; it is placed *above* any BLOCKED row, since `Invoke-SelfQueue` idles rather than skips. Proved capable of failing by breaking that placement and watching the self-test go red.

Gates: lint 0 · typecheck 0 · **3188 tests / 317 files** (was 3162/316) · self-test **35/35**. Sweep: #348 was green and merged; #349 merged. Zero open PRs.

## Two things you should know

**Row 52 is stale and I mirrored that into QUEUE.md rather than only writing it here** — which is the mechanism this cycle built, used on itself. Its own acceptance test now passes: `cycle-074/075/076/078/079` each carry the appending writer's signature, and `cycle-079.md` went from 152 committed lines to 309 on disk. The watcher *added* 157 lines instead of replacing the file. The restart it asks for has already happened. I left the row TODO for its owner to close on evidence.

**This is inert until the watcher process is restarted.** PowerShell parses a script once at launch, so `relay-watch.ps1` changes never reach a running watcher. Row 52 is the record of what that cost last time — three cycles. Nothing here fires tonight unless `relay-start.cmd` is run.

Open questions: 0.

