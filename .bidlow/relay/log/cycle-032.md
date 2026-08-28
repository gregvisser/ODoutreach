# Cycle 32 - finished



Work happened. Evidence: a git ref moved, so something was committed; the working tree changed, so files were edited.



Started 2026-08-27 04:54:51, took about 5.9 minutes.

How it ended: exit code 0.



Evidence checked: git refs on every branch, the working tree, and these

files named in the brief: bidlow/relay/QUEUE.md



## What it was asked to do



# Cycle 32 - queue item 20

This brief was written by the relay itself, off the top of QUEUE.md. Greg has
not read it. If it is wrong, say so in your log rather than working around it,
and correct QUEUE.md.

## The item, verbatim from the queue

> **BY 31 AUG (NOT tomorrow) — TRACKING OFF BY DEFAULT, PER-CLIENT OPT-IN. Not an environment toggle.** Greg's requirement, and it is a better design than what exists: *"it should be off by default, and if a customer agrees that they would change their DNS for tracking then the customer will make the changes and the toggle will be switched on for that particular customer."* Today `isOpenTrackingPixelEnabled()` is global and returns TRUE unless someone remembered to set `OPEN_TRACKING_PIXEL=off` — a promise resting on somebody's memory. Build it properly: a per-client setting, **defaulting to OFF**, that can only be turned on for a client whose DNS has been verified. The env var becomes a global kill-switch backstop, never the mechanism. Red first: a client with no setting must get NO pixel and NO rewritten links. Report the live Azure value on the way past.  **DO NOT REBUILD — cycle 31 built it, PR #268, CI green. Held ONLY on Greg's approval to merge, because merging applies a schema migration to the live client DB (2 additive nullable columns, no backfill, rollback in the migration file). Live Azure `OPEN_TRACKING_PIXEL` reads exactly `off`. Correction to this brief: the app has NO click tracking and never rewrites links, so "no rewritten links" had nothing to test — the only tracking is the open pixel. Second finding: `verifyLinkDomainAction` had NO caller anywhere since it was written, so DNS verification was unreachable from the UI; the new card is its first caller.**

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
  `DONE 32`, or back to `TODO` with a note if you could not do it.
* Do NOT write the next NEXT.md. The watcher does that. One cycle, one item.

## Assume the seventh exists

QUEUE.md records six instances this week of something built, wired, reporting
success, and never firing. It is the defect this project is worst at by a wide
margin. Whatever you build this cycle, prove it FIRES - not that it exists.





## What it did



`.bidlow/STATE.md` updated and pushed to the same PR (#269), so the record travels with the queue-status change.

The entry records, in the file's existing per-cycle format:

- **What changed:** nothing in `src/` — one line of `QUEUE.md`. This was a verification cycle, not a build.
- **What's half-done and where:** PR #268 is built, gated and proven but **not merged**, sitting on `feat/per-client-open-tracking-opt-in` at `a6e853c`.
- **The one-way door:** explicitly *not* opened. `PRODUCTION_PRISMA_MIGRATE` is true, so merging *is* the migration apply against the live client database — left for Greg.
- **Two decisions a fresh session would otherwise undo:** why row 20 says `DONE 32` with a "NOT MERGED" note rather than `TODO` (which would trigger the forbidden rebuild), and why the checkout is deliberately parked on `docs/relay-cycle-32` (the watcher reads `QUEUE.md` from the working tree, so switching branches would hide the status and make the relay re-take the row).
- **Next session picks up:** Greg's merge answer first — including the instruction to verify by commit hash against the direct App Service URL, never the CDN domain — then queue item 22, then item 28 starting from the failed CI run rather than a rebuild.
- **Production writes:** none, and nothing contradicts `PROJECT.json`.

Both commits are on PR #269. PR #268 remains untouched and unmerged.

**Open questions: 1** — unchanged from my last message: do you approve merging PR #268, which adds two empty columns to the live client database and changes no email that goes out?


