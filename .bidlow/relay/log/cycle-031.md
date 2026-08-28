# Cycle 31 - finished



Work happened. Evidence: a git ref moved, so something was committed; the working tree changed, so files were edited.



Started 2026-08-27 04:30:35, took about 23.3 minutes.

How it ended: exit code 0.



Evidence checked: git refs on every branch, the working tree, and these

files named in the brief: bidlow/relay/QUEUE.md



## What it was asked to do



# Cycle 31 - queue item 20

This brief was written by the relay itself, off the top of QUEUE.md. Greg has
not read it. If it is wrong, say so in your log rather than working around it,
and correct QUEUE.md.

## The item, verbatim from the queue

> **BY 31 AUG (NOT tomorrow) — TRACKING OFF BY DEFAULT, PER-CLIENT OPT-IN. Not an environment toggle.** Greg's requirement, and it is a better design than what exists: *"it should be off by default, and if a customer agrees that they would change their DNS for tracking then the customer will make the changes and the toggle will be switched on for that particular customer."* Today `isOpenTrackingPixelEnabled()` is global and returns TRUE unless someone remembered to set `OPEN_TRACKING_PIXEL=off` — a promise resting on somebody's memory. Build it properly: a per-client setting, **defaulting to OFF**, that can only be turned on for a client whose DNS has been verified. The env var becomes a global kill-switch backstop, never the mechanism. Red first: a client with no setting must get NO pixel and NO rewritten links. Report the live Azure value on the way past.

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
  `DONE 31`, or back to `TODO` with a note if you could not do it.
* Do NOT write the next NEXT.md. The watcher does that. One cycle, one item.

## Assume the seventh exists

QUEUE.md records six instances this week of something built, wired, reporting
success, and never firing. It is the defect this project is worst at by a wide
margin. Whatever you build this cycle, prove it FIRES - not that it exists.





## What it did



Cycle 31, item 20. Built, proven, PR green — **not merged**, and that's the one thing I need from you.

## The live Azure value, as asked

`OPEN_TRACKING_PIXEL` on `app-opensdoors-outreach-prod` reads exactly `off`. The written promise to OpensDoors holds today. It holds because of one unvalidated string in a portal text box.

## What changed

`Client.openTrackingEnabledAt` (nullable, `NULL` = OFF) is now the mechanism. No backfill — every existing client lands OFF, which is the point.

The part I'd draw your eye to: **`buildOpenTrackingPixelUrl` is deleted**, not deprecated. Its replacement takes the client as a *required* argument, so a call site that hasn't consulted the opt-in doesn't compile. And because the opt-in requires a verified aligned domain, a tracked email can only ever carry a same-domain pixel — that made `OPEN_TRACKING_REQUIRE_ALIGNED_DOMAIN` redundant, so it's gone. `OPEN_TRACKING_PIXEL` survives as a kill-switch backstop: it can hold tracking off for everyone, and can no longer switch it on for anyone.

## Proof it fires

Red-first, behavioural, not just module-missing — I implemented today's semantics first and watched the assertions fail:

```
× emits NO pixel URL for a client that has not opted in
  → expected 'https://go.paratus365.com/api/track/o…' to be null
```

Then a send-path test that drives the real `executeOutboundSend` and reads the HTML handed to the transport. Deleting the opt-in check makes it fail with the pixel in the actual email body. Migration chain applied to a throwaway Postgres 16; `migrate diff` → **No difference detected**.

Gates: lint 0 errors, typecheck 0 errors, **2511 tests green**, CI green on both checks.

## Two corrections to the brief

1. "NO rewritten links" had nothing to test — this app has no click tracking and never rewrites links. The only tracking is the open pixel. QUEUE.md corrected.
2. **`verifyLinkDomainAction` had zero callers anywhere in the codebase since it was written.** DNS verification was unreachable from the UI, so the toggle I was asked to build would have been permanently greyed out — the seventh instance, sitting directly in this item's path. The new card is its first caller.

## The one question, and it's yours

Merging applies a schema migration to the live client database (`PRODUCTION_PRISMA_MIGRATE` is true). Your standing rule is one approval gate before any schema change, so I stopped rather than merge on my own judgement.

It's two additive nullable columns, no backfill, nothing existing read or rewritten, rollback SQL in the migration file, and the net effect is *more* conservative than today. PR #268 is green and mergeable.

**Say the word and I'll merge and verify the running commit by hash against the direct App Service URL.**

Open questions: **1**.


