# Cycle 6 - finished

Work happened. Evidence: a git ref moved, so something was committed; the working tree changed, so files were edited; these files named in the brief changed on disk: relay-watch.ps1, RELAY-README.md.

Started 2026-08-26 09:01:35, took about 47.2 minutes.

Evidence checked: git refs on every branch, the working tree, and these
files named in the brief: relay-watch.ps1, RELAY-README.md, bidlow/relay/QUEUE.md

## What it was asked to do

# Cycle 6 - queue item 13

This brief was written by the relay itself, off the top of QUEUE.md. Greg has
not read it. If it is wrong, say so in your log rather than working around it,
and correct QUEUE.md.

## The item, verbatim from the queue

> **THE RELAY MUST SURVIVE ITS OWN FAILURES WITHOUT GREG.** This is now top priority — it is the difference between autonomous and "Greg watches a window". Three parts, all in `relay-watch.ps1`: (a) a per-cycle TIMEOUT — a hung `claude -p` currently blocks the watcher forever and only a human can clear it; kill the child after 45 minutes, record the cycle as `timed-out`, and CARRY ON to the next; (b) on failure or timeout, EMAIL GREG using the same Resend key and `ALERT_TO_EMAIL` the job alerting already uses — he should learn the relay died from his inbox, exactly as he learns a job failed, not by looking at a window; (c) a Windows Scheduled Task that starts the watcher at logon so a reboot does not silently end the run. Write the task registration as a small script he runs once, and explain it in `RELAY-README.md` in plain English.

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
  `DONE 6`, or back to `TODO` with a note if you could not do it.
* Do NOT write the next NEXT.md. The watcher does that. One cycle, one item.

## Assume the seventh exists

QUEUE.md records six instances this week of something built, wired, reporting
success, and never firing. It is the defect this project is worst at by a wide
margin. Whatever you build this cycle, prove it FIRES - not that it exists.


## What it did

Done, and every part proven to fire rather than merely built.

## What shipped — PR #227 and #228, both merged, CI green

**(a) A 45-minute deadline per cycle.** A hung `claude -p` used to block the watcher forever with only a person able to clear it. Now the cycle is killed and the relay takes the next item itself.

The kill takes the **whole process tree**. `claude.exe` is a launcher — killing the parent while its children live on looks *identical in the log* to a clean recovery. That is the assertion I watched go red: breaking the kill to a parent-only `Stop-Process` produced `FAIL no process from the killed cycle is still running`, grandchild alive, exactly as predicted.

**(b) Greg is emailed** on a timeout, a failure, a refusal to start, or a full stop. Each email says whether the relay is still running and which log to open.

**(c) A logon Scheduled Task** so a reboot does not silently end a run. It deliberately does *not* go through `relay-start.cmd`, which deletes `HALT` — a reboot quietly clearing a deliberate stop is how you get a runaway.

**The gate that keeps it honest:** `relay-selftest.ps1` runs at every start and the relay refuses to run if it fails. A timeout only matters on the one night something hangs, which is the exact shape of a thing that rots unnoticed.

## Evidence

| Check | Result |
|---|---|
| Self-test | 11/11 green, watched **red first** |
| Timeout fires | hung tree killed at 9.3s vs 8s deadline, 2 processes confirmed gone |
| Email fires | real send, Resend id `d6435f90-3e8c-4658-8ea3-a41b4d96713c` — dispatch *and* the run checked |
| Real agent still works | `claude -p` through the new file-stdin path: exit 0, output captured, 27.4s |
| Scheduled task | registered, read back, `-Prove` → result 0 |
| lint / typecheck / tests | 0 errors / clean / **2197 passing** |
| Deploy | `94d02a9f…` on the direct App Service URL, matching the merge |

## One thing you must do

**Restart the relay.** PowerShell loaded `relay-watch.ps1` into memory at 08:30; the running watcher still has the *old* no-timeout behaviour and will until it restarts. Shipped, merged, green, and not running is a fresh route to this project's signature defect, so I have written it into QUEUE.md as a standing finding rather than assume it is obvious.

## Two decisions I made, both reversible

**Email goes via GitHub Actions, not a local Resend call.** The item said to use the same key and `ALERT_TO_EMAIL` as the job alerting — both are GitHub Secrets and neither is on this laptop. Rather than copy a production secret onto a machine, the watcher dispatches `relay-alert.yml`, which sends with the identical key and recipient. Cost: no internet or an expired `gh` login means no email, which is why the self-test checks the login at every start.

**I left the Scheduled Task installed.** The item said you would run it once; I ran it to prove it works and did not remove it. `.\relay-install-task.ps1 -Remove` undoes it.

## Also fixed, from a mistake I made mid-cycle

Dot-sourcing `relay-watch.ps1` to reach one function **started a live relay** — it self-queued item 4, marked its row `IN PROGRESS 7`, overwrote `CURRENT.md` and launched a real cycle. I killed it and restored everything. Left alone, row 4 reading `IN PROGRESS 7` would have made the relay skip the eight-dead-mailboxes item **permanently**, since self-queueing only takes `TODO`. The `-LoadOnly` guard now exists because of this, and both lessons are recorded in QUEUE.md.

**Open questions: 2.** Should the relay refuse to run at all when the `gh` login has expired (it currently does — fail-closed, no alerting means not autonomous), and do you want the Scheduled Task left installed?

