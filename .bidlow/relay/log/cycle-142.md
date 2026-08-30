# Cycle 142 - timed-out

KILLED. This cycle was still running after 45 minutes, so it
was stopped, along with every process it had started (6 in
total). The relay did NOT wait for it and has carried on to the next item.

Anything it had already written to disk is still there - a kill does not undo
work - so read the evidence below before assuming this item is untouched.

Watcher script: B9E192203DEB - the file on disk is identical, so this process is running the current code.

Started 2026-08-30 11:03:47, took about 45 minutes.
How it ended: killed at the 45 minute deadline.

Evidence checked: git refs on every branch, the working tree, and these
files named in the brief: src/lib/monitoring/sentry-data-collection.ts, bidlow/GRADES.json, bidlow/relay/QUEUE.md

## What it was asked to do

# Cycle 142 - queue item 116

This brief was written by the relay itself, off the top of QUEUE.md. Greg has
not read it. If it is wrong, say so in your log rather than working around it,
and correct QUEUE.md.

## The item, verbatim from the queue

> **NOTHING IS BEING LOGGED IN PRODUCTION, SO NO PRODUCTION FAULT CAN BE DIAGNOSED - AND THIS ALREADY COST US THE ANSWER TO A REAL ONE.** Found by cycle 134 while fixing row 109. Greg clicked Launch, nothing happened, and the cycle could name TWO plausible causes but could NOT settle which one actually fired, because there was no record of the request anywhere. Its own words: App Service application and HTTP logs are OFF, Application Insights is wired but has NEVER ingested a single telemetry item, and there is no Sentry token in production. It named that honestly instead of guessing past it, which is why this row exists. **WHY THIS MATTERS MORE THAN IT LOOKS.** Every future production fault is currently undiagnosable by anyone, including a customer's own operator reporting one. 'It did nothing' is unanswerable without logs, and the only reason row 109 shipped a fix at all is that the code could be read and reasoned about. That will not always be true. This is dimension 9, reliability and operability, and it is measured, not opinion. **MEASURE FIRST and quote what you find:** read the production App Service diagnostic settings (`az webapp log config show`), confirm whether `APPLICATIONINSIGHTS_CONNECTION_STRING` is present in the app settings (NAMES only - never print a value), and query Application Insights for any ingested request or exception in the last 30 days to confirm the zero. Say plainly which of the three channels exist, which are configured, and which have ever carried data. **THEN TURN ON THE MINIMUM THAT MAKES A FAULT EXPLAINABLE, and no more.** At least: server-side application logging retained somewhere readable, and unhandled server-action exceptions recorded with enough context to identify the route, the client and the time - WITHOUT recording prospect personal data. **THAT LAST CONSTRAINT IS NOT NEGOTIABLE:** dimension 8 was scored down once already for exactly this, and CR-06 was the fix - `src/lib/monitoring/sentry-data-collection.ts` is the existing policy that keeps names, addresses and message bodies out of error reports. Any logging added here routes through that same policy or an equivalent that is asserted by a test. Do NOT log email bodies, subjects, recipient addresses, or anything a prospect wrote. **RED-FIRST:** a test that asserts an unhandled server-action error is recorded, watched failing first; and a test asserting the recorded payload contains no prospect personal data, which must be capable of failing if someone later logs a whole request object. **COST AND CONSENT.** Logging and Application Insights ingestion cost money on a live subscription. Estimate the monthly cost at current volumes and put the figure in the artefact. If turning something on would cost meaningfully more than a few pounds a month, configure it but state the number plainly rather than assuming the owner will not mind. **RAISE, DO NOT FIX HERE:** cycle 134 also recorded that there is NO end-to-end test coverage for the launch journey at all, so its client-side fix has no automated regression test. Write that into QUEUE.md as its own row above the BLOCKED rows so the picker reaches it. **DO NOT SCORE ANYTHING:** no `.bidlow/GRADES.json`, no dimension, no sell gate. Row 114 does the scoring from a fresh walk. **SCOPE:** production diagnostic configuration, the error-recording path, its tests, and a dated artefact under `docs/ops/`. No schema. No migration. No send. Do NOT touch the `bidlowai` sequence sitting at Ready: 1, Sent: 0 - row 115 owns that. Do NOT touch any other client's configuration. **THE HARD RULE, verbatim and not negotiable: real email may be sent, and data deleted, ONLY for the `bidlowai` client. Every other client may be built on, tested and measured, but nothing leaves the building for them.** **DEFINITION OF DONE:** a dated artefact under `docs/ops/` stating which channels were dead and which are now live, with the evidence quoted; proof by a real query that something now actually arrives rather than that a setting was flipped - this project has nine recorded instances of built-and-wired-but-never-fired and a logging channel that logs nothing would be the tenth; the no-personal-data test green; the monthly cost stated; the e2e-coverage row raised; lint 0, typecheck 0, full suite green, merged to `main`.

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
  `DONE 142`, or back to `TODO` with a note if you could not do it.

## THE STATUS CELL: SIX WORDS, AND ONLY SIX

The status cell of a queue row MUST BEGIN with one of exactly these six:

    TODO    DONE    BLOCKED    PARTIAL    IN PROGRESS    WONTFIX

Markdown bold around it is fine - `| **DONE 142 - ...** |` reads correctly.
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

* Finished it -> `DONE 142 - <what you did, and the proof>`
* Did some of it -> `PARTIAL 142 - <what is done, what is left>`. PARTIAL
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


