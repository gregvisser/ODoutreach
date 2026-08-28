# Cycle 21 - timed-out

KILLED. This cycle was still running after 45 minutes, so it
was stopped, along with every process it had started (6 in
total). The relay did NOT wait for it and has carried on to the next item.

Anything it had already written to disk is still there - a kill does not undo
work - so read the evidence below before assuming this item is untouched.

Started 2026-08-26 21:28:41, took about 45 minutes.
How it ended: killed at the 45 minute deadline.

Evidence checked: git refs on every branch, the working tree, and these
files named in the brief: relay-watch.ps1, bidlow/relay/QUEUE.md

## What it was asked to do

# Cycle 21 - queue item 32

This brief was written by the relay itself, off the top of QUEUE.md. Greg has
not read it. If it is wrong, say so in your log rather than working around it,
and correct QUEUE.md.

## The item, verbatim from the queue

> **THE WATCHER'S QUEUE PARSER MIS-READS ANY STATUS CELL THAT CONTAINS A PIPE, AND IT SILENTLY COST THE RELAY A WHOLE CYCLE ON 2026-08-26.** Measured, not assumed. In `relay-watch.ps1`, `Get-QueueRows` splits the whole row on the pipe character and then takes the status as `$parts[$parts.Count - 2]`. That is only correct when the row contains exactly four pipes. Item 31's status text quoted an Azure runtime string containing a literal pipe, so the row had five, `$parts.Count - 2` landed one field early, and the status was read as the fragment after that inner pipe instead of `DONE 18`. The watcher then wrote SELF-QUEUE-NOTE.md saying the next item had an unrecognised status and idled for the rest of the evening, with a fully green queue behind it. The evidence is still on disk: SELF-QUEUE-NOTE.md dated 2026-08-26 20:11:06 quotes a status beginning `20-lts`. `Set-QueueRowStatus` has the same defect and is worse, because it WRITES `$parts[$parts.Count - 2]` and would therefore overwrite the wrong half of such a row. **Do this.** Red-first, in a new test file for the relay tooling: build a fixture row whose status cell contains a pipe and assert the parser returns the real status token, then assert `Set-QueueRowStatus` rewrites that row without destroying the cell. Watch both go RED against the current implementation before changing it. **The fix is to stop splitting positionally.** Match the row with an anchored regex that takes the id from the front and the status from the LAST cell boundary followed by a recognised status keyword (TODO, DONE, BLOCKED, PARTIAL, IN PROGRESS, WONTFIX), so an inner pipe in either the item text or the status text cannot shift the columns. Rewrite `Set-QueueRowStatus` on the same anchor rather than on a field index. **Also add the guard that would have made this loud instead of silent:** when the watcher refuses to self-queue, the note it writes should name the raw row it could not parse, so a formatting fault reads as a formatting fault and not as a queue that has run out of work. **Done looks like:** a status cell containing a pipe is read and rewritten correctly, the new tests pass, and the old code is proved to have failed them first. **Do not touch** the queue rows themselves, the cycle logs, or anything under `src/`.

## The one rule

THE HARD RULE, and it is not negotiable:
Real email may be sent, and data deleted, ONLY for the `bidlowai` client.
Every other client may be built on, tested and measured. Nothing leaves the
building for them. This is enforced in `autonomous-actor-guard.ts`, not by
your good intentions. If a task seems to need a real send for anyone else,
that task is wrong - stop and write down why.

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
  If the decision is genuinely Greg's - money, a client relationship, an
  irreversible one-way door - stop and write down the question instead.
* Gates before you claim anything: `npm run lint`, `npm run typecheck`,
  `npm test`. Show the real output. A gate you did not run is not met.
* Commit and push when confident. Branch protection is ON, so it is
  branch -> PR -> green CI -> merge. Never push straight to `main`.
* If you deploy, verify the running commit by HASH against the DIRECT App
  Service URL (`app-opensdoors-outreach-prod.azurewebsites.net`), never the
  CDN-cached custom domain, and never liveness alone.
* Production migrations are real. `PRODUCTION_PRISMA_MIGRATE` is true, so
  merging a migration applies it to the live client database.
* When you finish, update this item's row in `.bidlow/relay/QUEUE.md` to
  `DONE 21`, or back to `TODO` with a note if you could not do it.
* Do NOT write the next NEXT.md. The watcher does that. One cycle, one item.

## Assume the seventh exists

QUEUE.md records six instances this week of something built, wired, reporting
success, and never firing. It is the defect this project is worst at by a wide
margin. Whatever you build this cycle, prove it FIRES - not that it exists.


## What it did


