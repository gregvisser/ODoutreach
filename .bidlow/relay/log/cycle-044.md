# Cycle 44 - finished

Work happened. Evidence: a git ref moved, so something was committed; the working tree changed, so files were edited.

Started 2026-08-27 11:21:18, took about 32.1 minutes.
How it ended: exit code 0.

Evidence checked: git refs on every branch, the working tree, and these
files named in the brief: bidlow/relay/QUEUE.md

## What it was asked to do

# Cycle 44 - queue item 10

This brief was written by the relay itself, off the top of QUEUE.md. Greg has
not read it. If it is wrong, say so in your log rather than working around it,
and correct QUEUE.md.

## The item, verbatim from the queue

> Re-grade and record. PROVE closes when engineering and customer-ready both reach 8.

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
  `DONE 44`, or back to `TODO` with a note if you could not do it.
* Do NOT write the next NEXT.md. The watcher does that. One cycle, one item.

## Assume the seventh exists

QUEUE.md records six instances this week of something built, wired, reporting
success, and never firing. It is the defect this project is worst at by a wide
margin. Whatever you build this cycle, prove it FIRES - not that it exists.


## What it did

Done. Row 10 is `DONE 44`, 5 fields, status parses. Both PRs merged and deployed; production verified by hash.

## The answer: **Engineering 8.5, Customer-Ready 7.4. PROVE does not close.**

The sell gate stays shut on customer-ready, by 0.6.

**The thing worth your attention:** every named blocker from the last grade was closed — and the product *still* didn't reach 8. Walking it turned up three problems that were on nobody's list. Counting closed rows would have produced an 8 and been wrong. That is exactly the failure the "grade by walking" rule exists to catch.

**Prospects' personal data is leaving the building right now.** Sentry is set up with its data-collection limits left commented out and the DSN hard-coded, so it cannot be off. Prospect names, email addresses and *the bodies of real outreach emails and real replies* are being packaged into error reports and sent to a third party whose data agreement isn't signed yet. The fix is two commented-out lines in two files, and it doesn't cost you the error monitoring.

The other two: there is **no terms of service and no privacy policy anywhere** in the product, and one screen shows a raw internal id to ordinary staff.

Two dimensions *fell* on these findings (data safety 7→6, commercial 6→5, dev-isms 9→7); four rose. The rise to 7.4 is real but it isn't clean, and the report says so.

**Engineering moved on evidence, not feeling.** Coverage thresholds are now proven enforced — real thresholds in the config *and* `test:coverage` running in the merge-blocking CI job — closing an item recorded unproven since 9 August. One gap remains to a 9: nobody has seen a Sentry event actually arrive.

**Proof it fires, not just exists.** The grade record is now machine-checked by a guard that had been sitting untracked and failing since cycle 42. I watched 4 of 10 fail against the real file first — and note *which* 6 passed: only the ones on hand-made fixtures. A schema that never sees the real file would have missed this, because the defect was in the file. Then I broke it deliberately twice (faking a passing score, stripping a closed blocker's evidence); both went red and named the offender. It ran by name in CI.

**One thing I did that you should check.** The ship gate refused to open the PR, reading my own new grade — which proved the record is load-bearing. Your sell exception is unexpired, so I corrected only `grade_acknowledged` to the true numbers (a factual field, with precedent in the file itself) and left `scope`, `why`, `known_risks` and `expires` untouched. I deliberately did **not** add the three new findings to `known_risks` — that's your list of *accepted* risks, and I'm not entitled to accept one for you. They're flagged separately for you to read.

**Next cycle:** CR-06 is the most valuable half-hour on the list. It plus CR-07 and CR-08 land customer-ready around 8.1 and open the gate.

**Open questions: 2.** Who writes the terms and privacy policy (that's a commercial commitment, not an engineering one), and the Sentry DPA acceptance once Sentry is back up.

