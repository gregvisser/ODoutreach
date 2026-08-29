# One restart, when the current cycle finishes

Written 2026-08-28 by Cowork supervision.

`relay-watch.ps1` has been hardened and committed (`04ddf66`). PowerShell reads a
script once, at launch, so **the running watcher is still executing the old code**.
Nothing is broken by waiting - the queue is moving - but the three fixes below are
inert until the next restart.

## How

Let the current cycle finish, then in the ODoutreach folder:

    relay-start.cmd

That is all. It clears HALT for you, reads the cycle number back out of
STATUS.json, and carries on where it left off. Nothing in the queue is lost.

## What the restart turns on

1. **PARTIAL rows are taken.** The picker used to accept only `TODO`, so a cycle
   that honestly reported "half done" stopped the queue dead. Row 59 was sitting
   at `PARTIAL 58` with real unfixed work in it and would have done exactly that.
   `BLOCKED` and `WONTFIX` still stop the relay, which is correct - those mean
   "not yours to take", not "unfinished".

2. **The relay repairs the one row it took itself.** On 2026-08-28 cycle 59
   shipped, merged and deployed half of row 40 and then wrote its status as
   `PARTLY DONE 59` - one word off the vocabulary. The row stopped parsing and
   eleven jobs waited seventy minutes for a human. Now: if the row the relay
   marked `IN PROGRESS` comes back unreadable, it puts a readable word in FRONT
   of the cycle's own wording - every character kept, in order - and releases the
   queue. Bounded at two repairs; the third emails Greg instead.

3. **The cycle brief names the six status words**, with cycle 59 as the worked
   example, so this stops happening at the source rather than being caught.

Plus four `Get-Content` calls that read UTF-8 files with no `-Encoding`, which
under Windows PowerShell 5.1 decode as cp1252. QUEUE.md's byte-order mark is
currently masking that - which is why the damage stopped at one pass instead of
compounding - but the queue's correctness should not depend on a BOM surviving
every editor that opens the file.

Proof: 20 checks in a harness driven by the real parser, red first, including
cycle 59's exact status cell. `relay-watch.ps1.bak-before-encoding-and-partial`
is the previous version if any of it needs backing out.

---

RESOLVED 2026-08-28 07:26 UTC: Greg ran relay-start.cmd at 08:25 local.
The watcher restarted on the new code, self-test passed 24 checks (including the
45-minute timeout and the tree-kill), and cycle 61 is running. No restart is
outstanding. Kept for the record.

---

# A SECOND RESTART — reopened 2026-08-28 by cycle 72, **RESOLVED 2026-08-29 by cycle 81**

> **Read the closure at the BOTTOM of this file before acting on anything below.**
> The second restart has happened and this section is kept only for the record.
> Nothing in it is outstanding.

**Do not read the "RESOLVED" note above as meaning there is nothing to do.** It
closed the three fixes listed at the top of this file. It did not close, and
could not have closed, the cycle-log destruction in queue row 52.

## Why the 07:26 restart could not have carried the log fix

The fix did not exist yet. Measured, not assumed:

    git show -s --date=iso-strict 3d7fef6   ->  2026-08-28T10:12:54+01:00
                                            =   09:12:54 UTC

    git log -S "Write-CycleLog" -- relay-watch.ps1
                                            ->  3d7fef6, and nothing else

`3d7fef6` ("the watcher's own log-writer was destroying cycle logs") landed **one
hour and forty-six minutes after** the only restart there has been, and it is the
sole commit that introduced the appending `Write-CycleLog`. PowerShell parses a
script once, at launch. So the running watcher has never held the fixed script,
and merging it again changes nothing.

## What it is still doing

Overwriting each cycle's real log with a short "finished" stub after the cycle
has already committed the real one. Rescued by hand in cycles 64, 70 and 71.

## The fix, and only Greg can do it

Let the current cycle finish, then in the ODoutreach folder:

    relay-start.cmd

Same command as before. It clears HALT, reads the cycle number back out of
STATUS.json, and carries on. Nothing in the queue is lost.

## Until then

Every cycle must check `git status` at start-of-cycle and restore its predecessor's
log from `main` if it shows as modified — **after diffing, not blind.** Cycle 72
was told to rescue `cycle-070.md` and found it already identical to `main`,
because cycle 71 had restored it; a blind `git checkout` is how cycle 70
overwrote cycle 69's log in the first place.

---

# RESOLVED 2026-08-29 by cycle 81 — measured, not assumed

**The second restart happened, the appending writer is running, and the manual
log-rescue step above is retired.** Do not perform it any more.

## The receipt

Row 52 set its own acceptance test: *"prove it by checking that the next cycle's
log still contains the agent's own prose underneath the watcher's block."* At the
start of cycle 81, `cycle-080.md` showed as modified in `git status`. That used to
mean the log had been clobbered. This time:

    git show HEAD:.bidlow/relay/log/cycle-080.md | wc -l   ->  214
    wc -l < .bidlow/relay/log/cycle-080.md                 ->  395
    git diff --stat .bidlow/relay/log/cycle-080.md         ->  181 insertions(+), 0 deletions

**181 insertions and zero deletions.** A truncating writer cannot produce that.
Line 1 on disk is still the agent's own heading, `# Cycle 80 - queue row 40: making
a finding in a log reach the next cycle`, and the watcher's block was ADDED at line
219. (`grep` finds the separator phrase twice in that file: line 179 is cycle 80
quoting it in prose — it is in the committed version too — and line 219 is the real
separator.)

Six consecutive cycles agree. Each opens with the agent's own heading and carries
exactly one `## The watcher's own record of this cycle` separator:

| log | lines | opens with |
|---|---|---|
| cycle-074 | 288 | agent's own heading |
| cycle-075 | 365 | agent's own heading |
| cycle-076 | 372 | agent's own heading |
| cycle-077 | 150 | `# Cycle 77 - finished` — **not a stub**; this is the shape `Write-CycleLog` writes when the agent left no log of its own |
| cycle-078 | 295 | agent's own heading |
| cycle-079 | 309 | agent's own heading |
| cycle-080 | 395 | agent's own heading |

## Why this file was wrong for a day

Nothing here was dishonest — it was written from the best evidence available on
2026-08-28, and that evidence was correct at the time. It went stale because a
restart leaves no trace in the repository. That is the actual lesson, and cycle 81
fixed it in code rather than in prose: see below.

---

# A THIRD RESTART — wanted, NOT urgent, nothing is broken without it

Cycle 81 added a **stale-watcher stamp** to `relay-watch.ps1`. Every cycle log now
ends up with one line naming the version of the script the running process
actually holds, and if the file on disk has moved on it says **RESTART REQUIRED**
in as many words, shows both hashes, and states that merging again is inert.

That is the durable answer to the question row 52 could not answer for ten cycles.
It is also, unavoidably, subject to the very defect it reports: **it is inert until
the watcher is restarted.** Nothing is broken in the meantime — logs are being
preserved correctly — so this is not urgent. Pick it up at the next natural
restart, whenever that is:

    relay-start.cmd

**How to know it worked:** the next cycle log will contain a line beginning
`Watcher script:`. If no cycle log ever contains that line, the restart did not
happen and the stamp is still inert — which is exactly the failure it was built to
make visible.
