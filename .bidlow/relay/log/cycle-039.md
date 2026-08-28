# Cycle 39 - finished

Work happened. Evidence: a git ref moved, so something was committed; the working tree changed, so files were edited.

Started 2026-08-27 08:17:02, took about 27.8 minutes.
How it ended: exit code 0.

Evidence checked: git refs on every branch, the working tree, and these
files named in the brief: bidlow/relay/PROVE-CLOSE-OUT.md, bidlow/relay/QUEUE.md

## What it was asked to do

# Cycle 39 - queue item 9

This brief was written by the relay itself, off the top of QUEUE.md. Greg has
not read it. If it is wrong, say so in your log rather than working around it,
and correct QUEUE.md.

## The item, verbatim from the queue

> **PROVE IS THE LAST STAGE OPEN AND IT IS THE ONE THING GREG IS BEING JUDGED ON. THE FULL BRIEF IS `.bidlow/relay/PROVE-CLOSE-OUT.md` - READ IT FIRST AND DO NOT RE-DIAGNOSE.** It traces all five customer-ready blockers to named files and lines, including blocker 1 (the bounce rate is structurally pinned at 0% because the metric reads a status only the Resend webhook writes, while all outreach goes out through Microsoft Graph or Gmail - instance eight of the house defect). Work the blockers in the order that file gives. `bidlowai` only for anything that sends. Blocker 5 (Art.28 DPAs) is Greg's, not yours - do not attempt it.

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
  `DONE 39`, or back to `TODO` with a note if you could not do it.
* Do NOT write the next NEXT.md. The watcher does that. One cycle, one item.

## Assume the seventh exists

QUEUE.md records six instances this week of something built, wired, reporting
success, and never firing. It is the defect this project is worst at by a wide
margin. Whatever you build this cycle, prove it FIRES - not that it exists.


## What it did

Both merged. Cycle 39 done.

## What I did

**Blocker 1 — the bounce rate pinned at 0% — is closed.** PR [#279](https://github.com/gregvisser/ODoutreach/pull/279) + [#280](https://github.com/gregvisser/ODoutreach/pull/280), merged, deployed, verified live.

The brief's trace was correct and I did not re-diagnose it. One thing it flagged as unverified, I checked: **`MAILBOX_BOUNCE_DETECTION_ENABLED` is `true` in the production App Service.** So detection was live the whole time — the missing status write was the entire defect, not the flag.

Both bounce channels now end in one function, `src/server/email/outbound/record-bounce.ts`, which reuses the existing `planWebhookMutation` rather than reinventing the transition rules. A `REPLIED` row keeps its milestone over a late bounce notice, but the address is still blocked — the dead address is dead either way.

**The red-first test genuinely went red first:** 3 failed / 5 passed against unmodified code, with `prisma.outboundEmail.update` never called. Green after.

## The thing worth telling you about

**The cycle-35 tripwire fired, and it was right.** `deliverability-review.test.ts` carries a reverse-tripwire that fails *when this gap closes* — because the client-facing deliverability document still told OpensDoors the bounce figure reads zero. Fixing the code made a document you send to a paying client untrue, and the test caught it in the same run. That is the single best-designed thing I've touched in this repo. The document is updated and the tripwire now guards the fix in the other direction.

## On "prove it fires"

I will not claim this one fires. Here is the split:

- **Proven:** correctly built (tests, both channels sharing one writer) and correctly installed (running commit read back off `app-opensdoors-outreach-prod.azurewebsites.net` as `b358dcd`, by hash, not liveness).
- **Not proven:** that it has caught a real bounce. It cannot until sending resumes. So I added the observable — `mailbox-inbox-sync.ts` now emits `bouncesStamped` alongside `bouncesSuppressed` in its audit metadata, meaning the first real NDR after sending resumes is visible without reading code.

Given this is instance eight of exactly that defect, "built and installed" is not "firing", and I've written that distinction into the client document rather than letting it blur.

## Two corrections recorded

- `GRADES.json` claimed "<2% bounce rate non-negotiable" — **no primary source**. Neither Google nor Microsoft publishes a bounce threshold; Google publishes a spam-complaint limit only (<0.10%, never ≥0.30%). Corrected.
- `sell_gate.customer_ready` read `4.0` against a recorded score of `6.8` — stale text from before the cap was lifted. Fixed as a transcription error and labelled as one.

## What I did not do

**I did not re-grade.** Blocker 1 of 5 is closed. Blockers 2 (two truths about one client), 3 (E-06 duplicate inbound — a receive-side tenant-isolation defect) and 4 (J5 end-to-end) are still open; blocker 5 is yours. Re-grading means walking the product live, not counting closed blockers, and doing it now would be exactly the false-9 the standard warns about. Queue row 9 is back to `TODO` with that note, not `DONE 39`.

Gates: lint 0 errors · typecheck clean · **2609 tests passing** across 266 files · CI green on both PRs including Playwright e2e.

**Open questions: 1** — blocker 4 says to check whether the cycle-33 e2e already covers the J5 journey before writing a second one. I did not get to that check, and whoever takes blocker 4 should do it first rather than assume.

