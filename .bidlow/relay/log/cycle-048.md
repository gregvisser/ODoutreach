# Cycle 48 - finished

Work happened. Evidence: a git ref moved, so something was committed; the working tree changed, so files were edited.

Started 2026-08-27 13:38:51, took about 33.2 minutes.
How it ended: exit code 0.

Evidence checked: git refs on every branch, the working tree, and these
files named in the brief: bidlow/relay/QUEUE.md

## What it was asked to do

# Cycle 48 - queue item 7

This brief was written by the relay itself, off the top of QUEUE.md. Greg has
not read it. If it is wrong, say so in your log rather than working around it,
and correct QUEUE.md.

## The item, verbatim from the queue

> **UI consolidation** â€” PR #196, held because staff training names the old layout with screenshots. Update the training in the same change.

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
  If the decision is genuinely Greg's - money, a client relationship, or one of
  the three named below - stop and write down the question instead. Note what
  changed on 2026-08-27: "an irreversible one-way door" used to sit in this list
  and was read as covering any production merge. It does not. Only (a), (b) and
  (c) below stop you now.
* Gates before you claim anything: `npm run lint`, `npm run typecheck`,
  `npm test`. Show the real output. A gate you did not run is not met.
* Commit and push when confident. Branch protection is ON, so it is
  branch -> PR -> green CI -> merge. Never push straight to `main`.
* **MERGING IS YOURS NOW. Greg decided this on 2026-08-27 and asked to stop being
  the bottleneck.** With green CI, MERGE AND DEPLOY WITHOUT ASKING. Do not park a
  finished, green PR and wait for him - a PR left open ROTS: #231 went from clean
  to 36 commits behind and CONFLICTING in a single day, and cost a whole cycle to
  rescue. Leaving it open is not the safe option, it is the expensive one.
* Three things still stop and ask, and they are the ONLY three:
  (a) a DESTRUCTIVE migration - anything that drops or alters an EXISTING table,
      column or type, or backfills over existing rows. Creating a NEW table, a new
      enum, or adding foreign keys to a new table is ADDITIVE and is yours to merge.
      The test is: does dropping what this adds restore today's behaviour exactly?
  (b) anything that touches or moves real CLIENT data.
  (c) anything that causes an EMAIL TO BE SENT. That one is absolute and it is on
      top of the hard rule about `bidlowai`, not instead of it.
  If it is none of those three, you do not need him. Merge it.
* If you deploy, verify the running commit by HASH against the DIRECT App
  Service URL (`app-opensdoors-outreach-prod.azurewebsites.net`), never the
  CDN-cached custom domain, and never liveness alone.
* Production migrations are real. `PRODUCTION_PRISMA_MIGRATE` is true, so
  merging a migration applies it to the live client database.
* When you finish, update this item's row in `.bidlow/relay/QUEUE.md` to
  `DONE 48`, or back to `TODO` with a note if you could not do it.
* Do NOT write the next NEXT.md. The watcher does that. One cycle, one item.

## Assume the seventh exists

QUEUE.md records six instances this week of something built, wired, reporting
success, and never firing. It is the defect this project is worst at by a wide
margin. Whatever you build this cycle, prove it FIRES - not that it exists.


## What it did

Done, merged, deployed and verified.

## What the brief got wrong

**PR #196 is CLOSED, not held**, and conflicting. The UI half shipped three months ago on its own as **PR #247** — which deleted the workflow strip *and* added a policy test to hold that line, but **never touched `src/lib/training/`**. The one precondition #196 named in writing ("update training modules 3 and 7 and their screenshots") is precisely the thing that never happened. QUEUE.md row 7 now records this.

## The seventh, inverted

The usual defect here is *built, wired, reports success, never fires*. This was the mirror image: **the UI moved and the artefact describing it reported success forever.** For three months the training taught a screen element that doesn't render — including a "what good looks like" bullet asking staff to confirm *"Overview loads with the 7-step workflow strip visible"*, a check that cannot pass. And `modules-staff-readiness.test.ts` carried a test **asserting the stale sentence was correct** — a green tick pinning the wrong copy in place.

## Red first, on real ground

3 failed / 10 passed before any copy changed. The guard's anchor test *passed* while the three copy assertions failed — it's anchored to `client-workspace-command-center.tsx` source, not a hardcoded verdict, so if the strip ever legitimately returns the anchor fails first and demands re-teaching rather than silently re-permitting stale copy.

## Two things worth flagging

**The screenshot was regenerated, not re-captioned.** It was stale twice — the deleted strip *and* pre-#138 tab names. New opt-in capture spec rebuilds it from the running app as **staff** (not super-admin, so owner-only diagnostics can't leak into client-facing material) and asserts the frame before saving. My first capture cropped Launch readiness below the fold while the new caption promised it — that would have been this same defect committed fresh, so it's `fullPage`.

**That new screenshot then surfaced a second drift**: it renders "Workspace ID" (the real form label) next to prose telling operators to check the "slug" — 6 occurrences, now aligned and guarded.

## Evidence

- lint **0** · typecheck **clean** · **2710 tests / 276 files**
- CI green, `mergeStateStatus: CLEAN`, merged as `8ca6f64`
- **Proven to reach the screen**, not just leave the file: `/training/onboarding` loaded in the built app as staff — rendered body contains "Launch readiness", "Workspace ID" and the seven modules in panel order; contains no "workflow strip", "7-step" or "slug"
- Deployed, verified **by hash on the direct App Service URL**: `8ca6f64412f9…`

No schema, no migration, no send path, no client data, nothing that sends an email.

**Open questions: 1.** The relay's `QUEUE.md` rows are written from stale snapshots — row 7 described a pending merge that had already shipped three months earlier, and row 8 (cycle 47) hit the same thing. Do you want the watcher to re-verify a row's premise against `main` before dispatching it, or is catching it in-cycle good enough?

