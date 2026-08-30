# Cycle 125 - timed-out

KILLED. This cycle was still running after 45 minutes, so it
was stopped, along with every process it had started (6 in
total). The relay did NOT wait for it and has carried on to the next item.

Anything it had already written to disk is still there - a kill does not undo
work - so read the evidence below before assuming this item is untouched.

Watcher script: 6A61D6BA12FC - the file on disk is identical, so this process is running the current code.

Started 2026-08-30 03:30:00, took about 45 minutes.
How it ended: killed at the 45 minute deadline.

Evidence checked: git refs on every branch, the working tree, and these
files named in the brief: bidlow/GRADES.json, src/server/ai/metered-call.ts, src/server/ai/classify-inbound-reply.ts, src/server/ai/anthropic-messages.ts, src/lib/monitoring/sentry-data-collection.ts, src/server/ai/metered-call.test.ts, src/server/ai/classify-inbound-reply.test.ts, bidlow/relay/QUEUE.md

## What it was asked to do

# Cycle 125 - queue item 101

This brief was written by the relay itself, off the top of QUEUE.md. Greg has
not read it. If it is wrong, say so in your log rather than working around it,
and correct QUEUE.md.

## The item, verbatim from the queue

> **CR-10 - THE ENGINEERING HALF ONLY. A LIVE PATHWAY WOULD CARRY A PROSPECT'S OWN REPLY TEXT TO AN UNCOVERED THIRD PARTY THE MOMENT ONE ENVIRONMENT VARIABLE IS SET, AND NOTHING IN THE CODE STOPS IT.** Raised by cycle 122 while re-measuring dimension 8 for row 93 - found, not looked for - and recorded as OPEN blocker CR-10 in `.bidlow/GRADES.json` with its full evidence. Six AI features shipped 28-29 August (row 80) route through `src/server/ai/metered-call.ts`. One of them, `src/server/ai/classify-inbound-reply.ts`, sends a real prospect's own reply - subject plus up to 2,000 characters of body, verbatim - to Anthropic's Messages API via `src/server/ai/anthropic-messages.ts`. CR-05's Art.28 DPA work covered Sentry, Resend and RocketReach only; Anthropic is not covered. **IT IS INERT TODAY, AND THAT IS THE WHOLE PROBLEM.** Cycle 122 confirmed against the live App Service that `ANTHROPIC_API_KEY` is not among the 38 production settings, and `metered-call.ts` line 145 refuses with `no_api_key` before any network call. So the only thing between 'inert' and 'a prospect's words reaching an uncovered processor' is whether one environment variable happens to be set. There is no code-level check anywhere that a processor is actually covered before the call is allowed. **THE WORK, AND IT IS THE ENGINEERING HALF ONLY:** add a FOURTH fail-closed check to `metered-call.ts`, alongside the three that already sit together at lines 143-145 (`ai_features_switched_off`, `no_api_key`, `no_rate_for_model`), refusing with a new outcome code when a feature is declared as carrying personal data and no processor allowance is recorded for the vendor it would reach. Each of the six features must DECLARE what it sends - the declaration is the point, because it makes the next AI feature someone adds state its data class instead of inheriting silence. Cycle 122 already checked the other five and found they carry aggregated statistics, the client's own template copy, or the client's own mailbox identity - not prospect personal data - so exactly one feature should be refused by this gate today. Follow the precedent this codebase already set for the same class of problem: `src/lib/monitoring/sentry-data-collection.ts`, one explicit policy in one place, read back and asserted in `sentry-data-collection.test.ts`. Do not invent a second pattern. **RED FIRST, PROVEN CAPABLE OF FAILING:** in `src/server/ai/metered-call.test.ts` and `src/server/ai/classify-inbound-reply.test.ts`, assert with an API key PRESENT that the personal-data feature is refused with the new code and that `invoke` is never called - watch that FAIL against the unchanged gate and quote the failure - and separately assert a non-personal-data feature still runs unaffected, so the gate is proven to be narrow rather than an off switch. **WHAT THIS ROW MAY NOT DO, and none of it is negotiable:** do NOT set, read back, print, log or add `ANTHROPIC_API_KEY` or any other secret anywhere - not in a workflow, not in a test fixture, not in `.env.example` beyond what already exists. Do NOT decide the vendor question: whether to pursue an Art.28 DPA with Anthropic is a commercial and data-processing decision recorded as CR-10's other half and it stays open. Do NOT re-score any dimension, do NOT edit `weighted_total`, `arithmetic` or `sell_gate`, and do NOT close CR-10 - this row closes the ENGINEERING half and says so plainly. This work is justified by the pathway itself, not by any number it might move, and a status that argues for a score is a status that failed. **SCOPE:** `src/server/ai/*` and its tests, plus a dated artefact under `docs/ops/`. No schema change. No migration. No client data read or written. No send. **THE HARD RULE, verbatim and not negotiable: real email may be sent, and data deleted, ONLY for the `bidlowai` client. Every other client may be built on, tested and measured, but nothing leaves the building for them.** **DEFINITION OF DONE:** the gate exists and fails closed, the red-first failure output is quoted verbatim in a dated artefact under `docs/ops/` naming which of the six features is refused and which are not and why, lint 0, typecheck 0, the full unit suite green, merged to `main`, and one plain sentence in the status saying what is now true that was not true before: that setting the API key can no longer, by itself, send a prospect's words to an uncovered processor.

## The one rule

THE HARD RULE, and it is not negotiable:
Real email may be sent, and data deleted, ONLY for the `bidlowai` client.
Every other client may be built on, tested and measured. Nothing leaves the
building for them. This is enforced in `autonomous-actor-guard.ts`, not by
your good intentions. If a task seems to need a real send for anyone else,
that task is wrong - stop and write down why.

## FIRST, BEFORE ANY NEW WORK: CLEAR THE GREEN PULL REQUESTS

Do this at the START of every cycle, before you read the item below. It takes two
minutes and it is the difference between a queue and a landfill.

`gh pr list --state open` then, for every PR whose checks are GREEN: bring the
branch up to date if branch protection requires it, and MERGE it. Greg counted
SEVENTEEN open on 2026-08-28 and most were green - they had simply been opened and
abandoned.

**Understand WHY this happens, because it is structural and not laziness.** A
cycle finishes its work, opens a PR, and ends. CI takes about five minutes. Nobody
ever comes back. So every cycle adds one and removes none, for ever. The only
place that can be fixed is here, at the start of the NEXT cycle.

Rules for the sweep:
* RED PRs are not yours to force. Read the failure, and either fix it as part of
  this cycle or say in your log why you left it.
* Merge order matters: branch protection requires each branch to be current, so
  every merge invalidates the next one. Take the docs and `.bidlow` record PRs
  first - they cannot conflict with code - then the code ones, updating as you go.
* `gh pr merge --auto` is better than update-then-race if auto-merge is allowed.
* A DESTRUCTIVE migration is still Greg's. Additive is yours.
* If a PR is genuinely not ready, say so in a comment on it, so the next cycle
  does not have to work that out again.

## Before you touch anything, write these four things down

1. **The files you are going to change.** Name them. If you cannot yet, your
   first job is to find out, and that reconnaissance IS the cycle.
2. **The red-first test.** Name the test file and what it asserts. Watch it FAIL
   before you make it pass. If the behaviour cannot go red first, say why, and
   prove the test is capable of failing by deliberately breaking the code and
   showing the red - that is this repository's established substitute.
3. **What "done" looks like** for this item, in one sentence a non-coder can check.
4. **What you must NOT touch.** Anything outside the files in (1).

## THIS PROJECT'S FOLDER, AND NOTHING OUTSIDE IT

You are working on ONE client system. Greg runs several side by side, and they
share one folder deliberately: `C:\Bidlowprojects\_standards` is the METHOD -
the hooks, the gates, the skills, the deck, the checklists - and it applies to
every project at once.

**Do not create, edit, move or delete anything under `_standards` unless the
queue row you are working on names that path explicitly.** A change made there
while doing client work does not stay with this client; it silently changes how
every other build is judged, including ones nobody is looking at today. If this
row's work seems to need a change to the method, STOP and write the case for it
into your log as a finding. Somebody will queue it as its own row, against the
standard, where it can be reviewed on its own terms.

The same goes for any sibling project folder - `BidlowClients\Kepak`,
`BidlowClients\Papaya`, `BidlowTools\*`. Read them if a row asks you to
compare something. Never write to them.

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
  `DONE 125`, or back to `TODO` with a note if you could not do it.

## THE STATUS CELL: SIX WORDS, AND ONLY SIX

The status cell of a queue row MUST BEGIN with one of exactly these six:

    TODO    DONE    BLOCKED    PARTIAL    IN PROGRESS    WONTFIX

Markdown bold around it is fine - `| **DONE 125 - ...** |` reads correctly.
Anything else does not. The relay reads QUEUE.md with a regex, and a status it
cannot read STOPS THE WHOLE QUEUE, on purpose: refusing to guess is the right
behaviour, and inventing is the one thing this relay will never do.

This is not hypothetical, and it is not pedantry. Cycle 59 built, merged and
DEPLOYED half of row 40 - good work, verified by commit hash - and then wrote its
status as `PARTLY DONE 59`. Two words, one of them not on the list above. The
row stopped parsing, the picker met it first, and the relay took nothing at all
for seventy minutes while eleven jobs waited behind it. `SUPERSEDED` did exactly
the same thing to row 38 the day before.

So, plainly:

* Finished it -> `DONE 125 - <what you did, and the proof>`
* Did some of it -> `PARTIAL 125 - <what is done, what is left>`. PARTIAL
  is TAKEN by the relay, so the next cycle picks the row straight back up. This is
  the right answer whenever you shipped part of a row.
* Could not start -> `TODO - <why>`
* Never invent a seventh word.
* Do NOT write the next NEXT.md. The watcher does that. One cycle, one item.

## Assume the seventh exists

QUEUE.md records six instances this week of something built, wired, reporting
success, and never firing. It is the defect this project is worst at by a wide
margin. Whatever you build this cycle, prove it FIRES - not that it exists.


## What it did


