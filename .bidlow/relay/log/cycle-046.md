# Cycle 46 - finished

Work happened. Evidence: a git ref moved, so something was committed; the working tree changed, so files were edited.

Started 2026-08-27 12:40:31, took about 18.5 minutes.
How it ended: exit code 0.

Evidence checked: git refs on every branch, the working tree, and these
files named in the brief: bidlow/relay/QUEUE.md

## What it was asked to do

# Cycle 46 - queue item 7

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
  `DONE 46`, or back to `TODO` with a note if you could not do it.
* Do NOT write the next NEXT.md. The watcher does that. One cycle, one item.

## Assume the seventh exists

QUEUE.md records six instances this week of something built, wired, reporting
success, and never firing. It is the defect this project is worst at by a wide
margin. Whatever you build this cycle, prove it FIRES - not that it exists.


## What it did

Both are in flight. Let me summarize where this stands while they finish.

**What I found and did**

The queue brief was wrong, and I corrected it rather than working around it. PR #196's *code* was never held — it shipped in PR #247 (`96849b2`), which deleted the strip and added a policy test to keep it gone. What never happened is the half the row actually names: **the training was never updated in that change**. So the live defect was the mirror image of the brief — the UI shipped, and the training kept teaching a control that isn't on the page, including a video script that would have had an admin narrate it aloud on camera.

**The screenshot was the real work.** I opened the image rather than trusting the text, and it was stale three independent ways: the deleted strip, a pre-#138 "Contacts/Suppression" tab row, and an obsolete sidebar. Alt text has to describe the *image*, so no honest caption could be written over it — it had to be replaced. I built a gated capture spec, recaptured from the running app, and **reviewed the result by eye**, which caught my own caption overclaiming: Launch readiness sits below the fold, so the caption now says so instead of promising a panel the picture doesn't contain.

**On proving it fires** — three things worth separating honestly:

- Arm 1 of the guard went red on real ground and *stayed* red through the prose fix until I fixed the caption too. It held me to the thing I'd deferred.
- Arm 2 had only ever been green, so I broke it deliberately. **My first sabotage was itself vacuous** — renaming to `Launch readinesss` left it green, because `toContain("Launch readiness")` is still satisfied by the substring. A bad sabotage looks exactly like a robust test. The second attempt turned it red properly.
- The `toHaveCount(0)` assertion in the capture spec **cannot fail today** and I'm not claiming it as proof.

**One thing I found but did not fix:** the *other* training screenshots are stale too. `training-sidebar.png` is the worst — it shows a sidebar with four wrong labels, two missing entries, and highlights "Dashboard" as the landing page when Reports is. That's on every screen a new operator sees. It's outside item 7, so I recorded it as queue row 36 with the capture tooling ready, rather than absorbing it silently or quietly widening this change.

Gates run and shown: lint **0**, typecheck **clean**, **2694 tests / 275 files**. No schema, no send path, no client data — this touches copy, docs, tests and one image. None of the three stop-and-ask conditions apply, so per the standing instruction I'll merge on green rather than parking it.

I'll confirm the render proof and the merge once CI and the rebuild land.

