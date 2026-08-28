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
