# Cycle 57 - timed-out

KILLED. This cycle was still running after 45 minutes, so it
was stopped, along with every process it had started (1 in
total). The relay did NOT wait for it and has carried on to the next item.

Anything it had already written to disk is still there - a kill does not undo
work - so read the evidence below before assuming this item is untouched.

Started 2026-08-28 05:40:19, took about 45 minutes.
How it ended: killed at the 45 minute deadline.

Evidence checked: git refs on every branch, the working tree, and these
files named in the brief: Bidlowbusiness\_odoutreach-handover\OWNER-FEATURE-REQUESTS.md, bidlow/relay/QUEUE.md

## What it was asked to do

# Cycle 57 - queue item 37

This brief was written by the relay itself, off the top of QUEUE.md. Greg has
not read it. If it is wrong, say so in your log rather than working around it,
and correct QUEUE.md.

## The item, verbatim from the queue

> **NEW WORK FROM THE OPENSDOORS OWNER, TRIAGED. FULL BRIEF: `C:\Bidlowbusiness\_odoutreach-handover\OWNER-FEATURE-REQUESTS.md` - READ IT BEFORE STARTING.** Build ONLY the two items marked BUILD NOW. **(A) The help templates exist and are good** - `microsoft-admin-consent-help.tsx` and `client-deliverability-help.tsx` - but they render on the MAILBOXES TAB ONLY and only when `adminConsentEntries.length > 0` / `deliverabilityEntries.length > 0`, so a client with no mailboxes yet sees nothing, which is exactly when staff need them. Make them reachable from every client account regardless of mailbox state, and do ONE plain-English pass: say what SPF and DKIM are FOR before naming them, keep every technical instruction intact so a non-technical person can forward it to an IT department unchanged. **(B) Three-tier client grading (VIP / mid / standard) plus a per-client toggle that disables AUTONOMOUS sending only**, leaving manual outreach untouched. **DO NOT confuse the four-at-a-time gate with the existing pacing engine** - `send-pacing.ts` paces what the MACHINE dispatches; the owner wants a gate in the SCREEN. His words: "the system only displays 4 at a time to stop them from sending loads manually. They can only see the next 4 once they have manually sent the first 4." Red-first: a list of 30 exposes exactly 4; the 5th is unreachable until 4 are sent AND 45 minutes have passed; the clock is per mailbox, per account. This can only slow sending down, so it carries no deliverability risk - it is the right thing to build first.

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
  `DONE 57`, or back to `TODO` with a note if you could not do it.
* Do NOT write the next NEXT.md. The watcher does that. One cycle, one item.

## Assume the seventh exists

QUEUE.md records six instances this week of something built, wired, reporting
success, and never firing. It is the defect this project is worst at by a wide
margin. Whatever you build this cycle, prove it FIRES - not that it exists.


## What it did


