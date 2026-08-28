# Cycle 29 - finished



Work happened. Evidence: a git ref moved, so something was committed; the working tree changed, so files were edited; these files named in the brief changed on disk: relay-watch.ps1.



Started 2026-08-27 03:22:57, took about 31.7 minutes.

How it ended: exit code 0.



Evidence checked: git refs on every branch, the working tree, and these

files named in the brief: relay-watch.ps1, bidlow/relay/QUEUE.md



## What it was asked to do



# Cycle 29 - queue item 15

This brief was written by the relay itself, off the top of QUEUE.md. Greg has
not read it. If it is wrong, say so in your log rather than working around it,
and correct QUEUE.md.

## The item, verbatim from the queue

> **THE RELAY MUST SHOUT WHEN IT STOPS. Do this before Greg goes to bed.** Twice today the relay went quiet and only a human noticed: once when a cycle hung, once when a malformed QUEUE.md row made it idle for 30 minutes. Tonight it runs unattended before a meeting that decides whether Greg gets paid, and a silent idle costs the whole night. Fix: in `relay-watch.ps1`, if the loop has been idle more than 20 minutes while QUEUE.md still contains at least one TODO, EMAIL Greg using the same Resend key and `ALERT_TO_EMAIL` the job alerting already uses. Subject must say what to do, e.g. `ODoutreach relay STALLED - 5 jobs waiting, nothing running`. Send once per stall, not every 20 minutes. Also email on: the 40-cycle cap being reached, and a QUEUE.md row that cannot be parsed (say WHICH row — that is exactly what bit us). Do not rely on Claude's hourly check: that runs in a fresh cloud session which may have no access to this machine's folders, and it failed for precisely that reason today. **The relay must be able to raise the alarm entirely on its own.** Prove it fires by deliberately stalling it, exactly as the job alerting was proved.

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
  `DONE 29`, or back to `TODO` with a note if you could not do it.
* Do NOT write the next NEXT.md. The watcher does that. One cycle, one item.

## Assume the seventh exists

QUEUE.md records six instances this week of something built, wired, reporting
success, and never firing. It is the defect this project is worst at by a wide
margin. Whatever you build this cycle, prove it FIRES - not that it exists.





## What it did



Done, and merged to `main` as `40b6fbe` (PR #265, CI green).

## What now happens

The relay emails Greg itself, with no cloud session and nothing on the critical path but the laptop:

| Trigger | Behaviour |
|---|---|
| Idle > 20 min with a `TODO` waiting | `ODoutreach relay STALLED - 5 jobs waiting, nothing running` — **once per stall** |
| A row that can't be parsed | Names the row **number, line and text** — *which* row is exactly what bit us |
| Any stop, incl. the 40-cycle cap | Subject now carries how many jobs were left waiting |

An empty queue is deliberately not a stall — that's a finished night, and an alert that arrives when nothing is wrong is one you learn to delete unread.

## Proving it fires, not that it exists

`relay-stall-proof.ps1` stalls the **real** watcher in a sandbox (first unfinished row `BLOCKED`, three `TODO`s behind it), then asks GitHub whether a run appeared. Run **33033813517**, Resend id **ea2dff04-8885-4874-ba58-4b615e905013**.

That proof caught two defects on its first two runs that every unit test passed straight through:

1. `gh workflow run` infers the repo from the working directory's git remote. The relay detected its silence perfectly, then **couldn't report it**. The repo is now named explicitly.
2. Wiring the bad-row alert made `npm test` **send two real emails**. Fixed — and the mute can't be abused: the startup self-test *refuses to start the relay* while `RELAY_ALERT_SUPPRESS` is set, so it can only ever silence a harness. `RELAY_STALL_MINUTES` is clamped to 1–20, so it can only make the alarm fire sooner.

Gates: self-test 24 checks green (genuinely red-first — failed on `Get-StallVerdict` before the code existed); `npm test` 2463 passed / 256 files sending zero email; lint 0 errors; typecheck clean.

## One thing needs you, tonight

**The running relay does not have this yet.** Process 22600 started 22:57:42 last night and loaded the old script into memory — I found this by checking rather than assuming, because that is precisely the seventh instance the brief warned about, and it was about to be mine.

Close the relay window and run `relay-start.cmd`. ~15 seconds. I couldn't do it myself: cycle 29 was running *inside* that watcher, and restarting from within a cycle would kill it mid-flight. There's a blunt note at `.bidlow/relay/RESTART-REQUIRED.md`, and I sent the email too (run 33034699161).

## Not covered, not claimed
If the watcher **process** dies — window closed, machine asleep — nothing here can email you, because nothing is executing.

Also worth flagging, outside this item's scope: **QUEUE.md's corruption deepens every time the relay rewrites a row** — 60 lines re-mojibaked when it marked row 15 `IN PROGRESS`, before my cycle began. That's compounding, and it's queue item 11's territory.

Row 15 is `DONE 29`; all 33 rows parse; 14 jobs still waiting.

**Open questions: 1** — do you want the process-death gap closed (an external watchdog, e.g. a Scheduled Task that checks the heartbeat), or is a nightly restart enough?


