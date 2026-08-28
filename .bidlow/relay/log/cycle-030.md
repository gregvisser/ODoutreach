# Cycle 30 - finished



Work happened. Evidence: a git ref moved, so something was committed; the working tree changed, so files were edited.



Started 2026-08-27 03:55:40, took about 33.9 minutes.

How it ended: exit code 0.



Evidence checked: git refs on every branch, the working tree, and these

files named in the brief: bidlow/relay/QUEUE.md



## What it was asked to do



# Cycle 30 - queue item 19

This brief was written by the relay itself, off the top of QUEUE.md. Greg has
not read it. If it is wrong, say so in your log rather than working around it,
and correct QUEUE.md.

## The item, verbatim from the queue

> **TODAY — ONE COMMAND TO GO LIVE FOR THE MEETING, AND ONE TO GO BACK.** Greg has a client meeting and must NOT be flipping Azure settings by hand to prepare for it. Right now, making the system fully live for every client means unsetting `AUTONOMOUS_RELAY_ACTIVE`, which also removes the safety rail — two coupled things that should not be coupled, and a manual step before a meeting that decides whether he gets paid. Build `relay-golive.cmd` and `relay-resume.cmd`: **go-live** halts the relay cleanly after the current cycle, turns the autonomous gate off, VERIFIES against the direct App Service URL that sending is live for all clients, and prints in plain English what is now possible; **resume** puts the gate back on, confirms it, and restarts the relay. Neither may leave the system in a half state. Note for the record: a HUMAN clicking send in the app is already allowed today — the gate only stops machine-initiated sends — so a hand-driven demo works either way. This is about the SCHEDULED sending being genuinely live.

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
  `DONE 30`, or back to `TODO` with a note if you could not do it.
* Do NOT write the next NEXT.md. The watcher does that. One cycle, one item.

## Assume the seventh exists

QUEUE.md records six instances this week of something built, wired, reporting
success, and never firing. It is the defect this project is worst at by a wide
margin. Whatever you build this cycle, prove it FIRES - not that it exists.





## What it did



`.bidlow/STATE.md` updated and merged (`2f92a21`, PR #267, CI green).

The new section records, at the top of the file:

- **What was built** — `relay-golive.cmd` / `relay-resume.cmd` / `relay-gate.ps1` / `relay/gate-switch.test.ts`, with production on `6e980eb` verified by hash and queue row 19 at `DONE 30`.
- **Four decisions**, including the one-way-door-adjacent ones: the gate is written to `0` rather than unset so the allowlist survives; the safe half always goes first; the process table (not `STATUS.json`) decides whether the relay is running; an abort removes only a `HALT` file it created itself.
- **How each link was proven to fire** — red-first tests under both PowerShell hosts, and the real `-Mode proof` write against production, plus the end-to-end `relay-resume.cmd` run from the merged checkout that caught the LF-line-ending risk merging introduced.
- **What was deliberately not done** — go-live itself was never run, and why that is Greg's call.
- **Production writes** — two Azure app-setting writes, both reversed and verified; no client database touched, no mail sent.
- **Nothing half-done.** The one item left open is cosmetic wording in the resume summary, logged as pick-up item 2 rather than left silent.

Nothing discovered this session contradicts `PROJECT.json`.


