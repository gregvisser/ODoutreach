# Cycle 159 - finished

Work happened. Evidence: the working tree changed, so files were edited.

**RESTART REQUIRED - this watcher is running a STALE copy of its own script.**

  Loaded at launch: B9E192203DEB
  On disk now:      3118106EFA98

PowerShell reads a script once, at launch, and then runs from memory. Every
change merged to relay-watch.ps1 since this process started is INERT - merging
it again will not help. Stop this watcher and run relay-start.cmd, which clears
HALT and reads the cycle number back out of STATUS.json.

This is queue row 52's defect. It cost about ten cycles precisely because
nothing said this out loud.

Started 2026-08-30 19:54:11, took about 4.5 minutes.
How it ended: exit code 0.

Evidence checked: git refs on every branch, the working tree, and these
files named in the brief: bidlow/GRADES.json, docs/ops/TUESDAY-READINESS-MEASUREMENT-2026-08-30.md, bidlow/relay/QUEUE.md

## What it was asked to do

# Cycle 159 - queue item 125

This brief was written by the relay itself, off the top of QUEUE.md. Greg has
not read it. If it is wrong, say so in your log rather than working around it,
and correct QUEUE.md.

## The item, verbatim from the queue

> **GREG'S DECISION, MADE 30 AUGUST: SENDING AND REPLYING STAY INSIDE BUSINESS HOURS, BUT RECEIVING MUST RUN AT ANY TIME.** His words: sending and replying must be within the suggested hours, but receiving emails should be any time. He is right, and today proved it - he replied on a Sunday and nothing would have collected it until Monday 07:00 UTC. A cycle had to force the sync by hand. **THE MEASURED FACTS, read from `.github/workflows/` not assumed:** `sync-replies.yml` runs `*/15 7-18 * * 1-5` and `process-outbound-queue.yml` runs `*/5 7-18 * * 1-5`. Both are weekday, business-hours only. So any prospect reply arriving after 18:00 Friday is invisible until 07:00 Monday - up to 61 hours during which the operator screens show nothing and the reply-needing-a-person queue stays empty. **FIRST, ANSWER THE DAMAGE QUESTION BEFORE CHANGING ANYTHING, because it decides how serious this is and the supervisor did NOT verify it:** can a scheduled follow-up go out to a contact who has already replied but whose reply has not yet been synced? Both workflows start at 07:00, the send queue every 5 minutes and the sync every 15, so they can interleave. Read the actual send path and find what stops a sequence on reply, and whether that stop depends on the reply having been synced into the database. **If an unsynced reply does NOT block the follow-up, then this system can email a prospect who already said yes or said stop - state that plainly at the top of your log, because it is the most damaging thing an outreach tool can do and it changes this row from a latency fix to a correctness fix.** If it is genuinely blocked by some other mechanism, say so just as plainly and do not inflate the finding. **THEN THE CHANGE:** make the reply sync run continuously - every 15 minutes, all hours, all days. **DO NOT TOUCH `process-outbound-queue.yml`.** Sending stays exactly where it is, inside business hours, weekdays. That is Greg's explicit decision and this row does not revisit it. Check the other schedules while you are there and say whether any of them are receive-side and wrongly restricted, but change only the reply sync in this row. **COST, stated rather than hidden:** this roughly triples the scheduled runs of that workflow, from about 220 a week to 672. Note the real figure in the artefact so the owner can see what he is now paying for. **PROVE IT FIRES, do not merely change the cron:** this project's worst and most repeated defect is something built, wired, reporting success and never firing. Add a test that asserts the schedule covers nights and weekends and would fail against the old expression, and after merging, quote a real workflow run that executed outside 07:00-18:00 weekday hours. If no such run has happened yet when you finish, say so and hand the row back PARTIAL rather than claiming it proven. **DO NOT SCORE ANYTHING:** no `.bidlow/GRADES.json`, no dimension, no sell gate, and do not edit `docs/ops/TUESDAY-READINESS-MEASUREMENT-2026-08-30.md`. **NO SEND.** **THE HARD RULE, verbatim and not negotiable: real email may be sent, and data deleted, ONLY for the `bidlowai` client. Every other client may be built on, tested and measured, but nothing leaves the building for them.** **DEFINITION OF DONE:** the answer to the damage question stated plainly, the cron changed, the test passing and proven to fail without the change, lint 0, typecheck 0, full suite green, a dated artefact under `docs/ops/`, and THE WORK MERGED TO `main` with the merge commit hash on `origin/main` quoted in your log and confirmed with `git ls-remote origin refs/heads/main`. A pushed branch is not a merge. **GREG'S CONDITION, ADDED AFTER HE WAS TOLD THE DAMAGE QUESTION WAS STILL UNVERIFIED - his words: leave sending and receiving the way it is if it will cause problems. THE ORDER OF THIS ROW IS THEREFORE NOT OPTIONAL: INVESTIGATE FIRST, CHANGE SECOND. If the investigation turns up ANY real reason a continuous reply sync would cause harm - duplicate inbound rows, double-processing, provider rate limits or throttling on the mailbox APIs, cost far above the estimate, or a race with the send queue that gets WORSE rather than better - then STOP, CHANGE NOTHING, write down exactly what you found, and close this row PARTIAL with the finding. Do not push a change the evidence argues against. The supervisor's own read is that this is low risk, because the reply sync only READS mail and cannot send anything, so the realistic downside is a few pennies of compute - but that is a judgement, not a measurement, and this row exists to measure it.**

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
  `DONE 159`, or back to `TODO` with a note if you could not do it.

## THE STATUS CELL: SIX WORDS, AND ONLY SIX

The status cell of a queue row MUST BEGIN with one of exactly these six:

    TODO    DONE    BLOCKED    PARTIAL    IN PROGRESS    WONTFIX

Markdown bold around it is fine - `| **DONE 159 - ...** |` reads correctly.
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

* Finished it -> `DONE 159 - <what you did, and the proof>`
* Did some of it -> `PARTIAL 159 - <what is done, what is left>`. PARTIAL
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

The merge (`11604ed`) is confirmed on `origin/main`, gates are green, and the investigation from cycle 158 is solid. I'm now waiting on a background poll for the first scheduled `sync-replies.yml` run after the 18:44 UTC cron merge (next tick ~19:00 UTC) — that's the last thing needed to close this row as DONE rather than PARTIAL. I'll report back once it lands.

