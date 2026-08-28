# Cycle 11 - finished

Work happened. Evidence: a git ref moved, so something was committed; the working tree changed, so files were edited.

Started 2026-08-26 12:23:38, took about 34.6 minutes.

Evidence checked: git refs on every branch, the working tree, and these
files named in the brief: bidlow/relay/QUEUE.md

## What it was asked to do

# Cycle 11 - queue item 20

This brief was written by the relay itself, off the top of QUEUE.md. Greg has
not read it. If it is wrong, say so in your log rather than working around it,
and correct QUEUE.md.

## The item, verbatim from the queue

> **DEADLINE 31 AUG — VERIFY OPEN TRACKING IS OFF IN PRODUCTION.** Greg told the client in writing that tracking is off and that it was the cause of the domain mismatch. `isOpenTrackingPixelEnabled()` returns TRUE unless `OPEN_TRACKING_PIXEL` is exactly `off`. Confirm the live Azure value. If it is anything but `off`, that is a broken written promise on the single point the client cares most about. Report the actual value.

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
  `DONE 11`, or back to `TODO` with a note if you could not do it.
* Do NOT write the next NEXT.md. The watcher does that. One cycle, one item.

## Assume the seventh exists

QUEUE.md records six instances this week of something built, wired, reporting
success, and never firing. It is the defect this project is worst at by a wide
margin. Whatever you build this cycle, prove it FIRES - not that it exists.


## What it did

`.bidlow/STATE.md` written and merged (#236, CI green). Local main is at `4af4403`; Cowork's in-flight queue edit is left uncommitted and untouched, as it's theirs.

The state record covers what the hook asked for:

- **What changed** — the fail-closed fix to the open-tracking kill-switch (#235), live on `9ef2de9`.
- **What's half-done and exactly where** — item 20 is TODO; only its "report the live Azure value" clause is complete. The per-client setting defaulting to OFF, the verified-DNS gate, and the link-rewriting half are unbuilt, and it's a 31 August commitment.
- **Decisions, including the boundary I didn't cross** — I deliberately did not open the production DB firewall to a workstation IP, which means the last step of my evidence is inference rather than measurement. That's recorded as a limitation, not rounded up. No one-way doors were touched: no schema change, no migration, no config change, no send.
- **What to pick up first** — item 18, added by Cowork mid-cycle and sitting above item 20: can you actually send tonight, after seven weeks of silence.
- **Contradictions with PROJECT.json** — none. `CLASSIFY.json`'s 2026-08-23 note that prod reads `OPEN_TRACKING_PIXEL=off` was re-confirmed live today and remains accurate.

The headline stands: **the live value is exactly `off`, and the promise to the client holds** — but the switch enforcing it was one careless keystroke from silently breaking that promise, and now isn't.

Open questions remain the same 2: whether the relay should have a sanctioned route to read-only production data, and whether item 18 or item 20's per-client half goes next.

