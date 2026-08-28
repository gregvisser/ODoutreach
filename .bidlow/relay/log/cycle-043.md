# Cycle 43 - finished

Work happened. Evidence: a git ref moved, so something was committed; the working tree changed, so files were edited.

Started 2026-08-27 10:46:07, took about 34.2 minutes.
How it ended: exit code 0.

Evidence checked: git refs on every branch, the working tree, and these
files named in the brief: bidlow/relay/PROVE-CLOSE-OUT.md, bidlow/relay/QUEUE.md

## What it was asked to do

# Cycle 43 - queue item 9

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
  `DONE 43`, or back to `TODO` with a note if you could not do it.
* Do NOT write the next NEXT.md. The watcher does that. One cycle, one item.

## Assume the seventh exists

QUEUE.md records six instances this week of something built, wired, reporting
success, and never firing. It is the defect this project is worst at by a wide
margin. Whatever you build this cycle, prove it FIRES - not that it exists.


## What it did

`.bidlow/STATE.md` updated — cycle 43 session recorded at the top, header bumped from cycle 37 to 43.

It records:

- **What was built** — `j5-journey.integration.test.ts`, merged as `b15cfe4` (PR #285), deployed and verified by hash on the direct App Service URL. Test and docs only; no production code, schema, migration, send, or client data.
- **Proof it fires** — the two deliberate product breaks that turned it red, plus the CI job log line confirming it actually ran in the merge-blocking step.
- **Decisions** — the deliberate departure from Playwright and why (`e2e/env.ts` blanks credentials to make a real send impossible; weakening that would trade a real guarantee for a cosmetic one); blocker 5 recorded as owed-by-Greg; and the customer-ready score **deliberately not** re-graded, with the reason stated so the next session can't infer a number from the closed-blocker list.
- **One-way doors** — none opened. Nothing irreversible, nothing sent. Production confirms the guard is live (`autonomousRelay: active, allowlistedClients: 1`).
- **Corrections to the record** — the non-existent "cycle 33 e2e test", plus my own two mid-work corrections (the header-vs-body assertion, and a comment claiming a red I never observed).
- **Discovered, not changed** — the opt-out rail is genuinely redundant across compose and dispatch; documented rather than tidied.
- **Pick up first** — item 10 (re-grade by walking live), the 4 failing untracked `grade-record` tests from cycle 42 that would break CI if committed, and the open question on the duplicated rail.

Nothing contradicts `PROJECT.json`.

Open questions remain **3**, unchanged from my previous message.

