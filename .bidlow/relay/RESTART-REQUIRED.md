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

---

# A FOURTH RESTART — URGENT, unlike the third: this one is actively costing money

Written 2026-08-31 by cycle 190. **This section exists because the "third
restart" section above says "wanted, NOT urgent, nothing is broken without
it", and that is no longer true. Do not read this file and stop at the section
above it — read this one.**

## What is actually happening

The live `relay-watch.ps1` process has not been restarted since before commit
`b0a9052` (cycle 184, PR #492 — the squash-merge-aware guard + independent
loop breaker that fixed row 138's nine-cycle loop). Every single cycle log
since then — 184, 186, 188, 189, and now 190 — has printed the same stamp,
unchanged:

    Loaded at launch: 51AF85ED01BF
    On disk now:      FFDB8B83837A

That stamp means exactly what it says: the running process still holds the
**pre-fix** guard — squash-blind, no loop breaker — in memory. Merging more
code to `relay-watch.ps1` does not change what that process is executing.
Only running `relay-start.cmd` does.

## The cost, measured

Since cycle 184 shipped the fix, **row 143 — the row created to track that
exact fix — has itself been caught in the loop it fixed**: closed DONE by
cycles 184, 186, 188 and 189, and reopened again for cycles 185, 187, 189 and
190. That is six cycles (185-190) spent re-verifying a fact that was already
true and already proven, because the process making the reopen decision has
never seen the code that would stop it. `.bidlow/relay/row-reopen-counts.json`
— the file the new loop breaker persists its count to — is empty on disk.
That is not a bug in the counting; it is proof the new code has **never once
executed in the live process**. The loop breaker exists, is tested (91
self-test checks, including the exact cases that should trigger it), and has
never fired for real.

## What will keep happening until the restart

Every cycle that closes row 143 (or any other row) by pushing a branch whose
name or commit message names that row's number risks the same reopen, for as
long as this process keeps running pre-`b0a9052` code. Cycle 190 checked
whether the specific branches involved were themselves the problem (leftover,
undeleted `docs/*row143*` branches) — they were not; GitHub deleted every one
of them correctly on merge (`deleteBranchOnMerge: true`, confirmed via `gh
repo view`), and `git ls-remote origin` shows none of them exist. The false
positive was this checkout's own unpruned local remote-tracking refs, not
anything live on `origin`. There is no branch-hygiene fix available here —
only the restart.

## The fix, and only Greg can do it

Let the current cycle finish, then in the ODoutreach folder:

    relay-start.cmd

Same command as every restart above. It clears HALT, reads the cycle number
back out of `STATUS.json`, and carries on. Nothing in the queue is lost.

**How to know it worked:** the next cycle log's `Watcher script:` line will
name `FFDB8B83837A` (or whatever hash `relay-watch.ps1` carries on `main` at
the time) instead of `51AF85ED01BF`, and row 143 will stop reopening.

## Until then

This is not a reason to keep re-deriving the diagnosis. A cycle that meets
row 143 reopened again should read this section, confirm the hash line still
shows `51AF85ED01BF`, and close it straight back to DONE citing this file —
not repeat cycles 185-190's investigation from scratch.
