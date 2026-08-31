# Cycle 209 - finished

Work happened. Evidence: a git ref moved, so something was committed; the working tree changed, so files were edited.

Watcher script: 3ABAA45FD1AB - the file on disk is identical, so this process is running the current code.

Started 2026-08-31 22:47:32, took about 54 minutes.
How it ended: exit code 0.

Evidence checked: git refs on every branch, the working tree, and these
files named in the brief: docs/ops/ROW134-FOUR-QUESTIONS-2026-08-31-cycle192.md, src/lib/training/modules.ts, src/lib/training/staff-handover-guide.ts, src/server/ai/metered-call.ts, support/actions.ts, bidlow/GRADES.json, bidlow/relay/QUEUE.md

## What it was asked to do

# Cycle 209 - queue item 149

This brief was written by the relay itself, off the top of QUEUE.md. Greg has
not read it. If it is wrong, say so in your log rather than working around it,
and correct QUEUE.md.

## The item, verbatim from the queue

> **GREG ASKED FOR THIS DIRECTLY ON 31 AUGUST: "a AI search bar to the system, for any queries or questions the staff might have on the system" - questions of the form how do I do this, how do I do that. He asked for a recommendation on placement and it was given; this row carries it.** This row REPLACES the narrower training-only ask-box originally raised by row 134 (cycle 192) finding 5. Read `docs/ops/ROW134-FOUR-QUESTIONS-2026-08-31-cycle192.md` for the cost and compliance assessment before starting - it still holds. **BLOCKED BEHIND ROW 148 AND THAT IS NOT NEGOTIABLE.** Row 148 fixes twelve confirmed drift defects in the training content, including a worked example that still teaches the `{{email_signature}}` bug it warns against. An answer engine over wrong content produces confidently wrong answers, which is worse than no search bar. **Do not start this row until row 148 has merged.** If you are handed this row while 148 is still open, say so plainly and hand it back rather than working around it. **PLACEMENT - THE RECOMMENDATION, and the reasoning behind it.** Put it in the APP SHELL top bar, reachable from every screen, with a keyboard shortcut. **NOT inside the Training tab.** This project has already learned that lesson twice in its own code: `nav-config.ts:71` puts Google logins in the sidebar because "a chore nobody can find is a chore that does not get done", and Setup help was made its own TAB (`client-workspace-subnav.tsx`) because "everything on that page was conditional on already having a mailbox - so the client who most needed these instructions was the one client who never saw them". Staff get stuck on the screen they are stuck on. A help box they must navigate to is a help box nobody uses. **SCOPE OF WHAT IT MAY READ - the whole compliance answer rests on this.** The nine modules in `src/lib/training/modules.ts`, `STAFF_VIDEO_SCRIPTS`, `STAFF_HANDOVER_CHECKLIST` and `src/lib/training/staff-handover-guide.ts`. **NOTHING ELSE. No client data, no prospect data, no reply text, no database reads of any kind.** Declare the new `AiFeature` with `carriesPersonalData: false` and mean it - that flag is only honest because retrieval is structurally confined to static content, so make it structurally confined rather than merely intended. `COVERED_PROCESSORS` in `ai-feature-data-policy.ts:78` is a hardcoded empty set and will refuse anything marked as carrying personal data; do not weaken it. Reuse `runMeteredAiCall` (`src/server/ai/metered-call.ts:73`) so the cost lands on the existing AI spend page. **THREE BEHAVIOURS THAT MAKE IT USEFUL RATHER THAN A NOVELTY.** (1) **Every answer cites its source** - the module and the step it came from, as a link the person can open. Staff learn where things live instead of asking the same question next week, and a wrong answer can be traced to the content that caused it. (2) **When it cannot answer, offer to raise a support ticket with the question already filled in** - `src/app/(app)/support/actions.ts` already has ticket creation. A dead end is the failure mode to avoid. (3) **Record every question it could not answer.** That list is the honest backlog of what the training does not cover, and it is worth more than the search bar itself. Surface it somewhere a human will actually see it. **SAY WHAT IT DOES NOT KNOW.** It must not guess about screens, settings or client data outside the training content. "I do not have that in the training - shall I raise a ticket?" is a correct answer and must be a designed one, not an accident. **PROVE IT FIRES, do not merely build it:** a test that an answer carries a real citation resolving to a real module and step; a test that a question outside the training content returns the do-not-know path rather than an invention; a test that the ticket fallback creates a real ticket with the question in it; and a test that the feature is refused if ever declared as carrying personal data. All four must fail red without the change. **DO NOT SCORE ANYTHING:** no `.bidlow/GRADES.json`, no dimension, no sell gate. **THE HARD RULE, verbatim and not negotiable: real email may be sent, and data deleted, ONLY for the `bidlowai` client. Every other client may be built on, tested and measured, but nothing leaves the building for them.** **DEFINITION OF DONE:** the search bar reachable from every screen, answering only from training content, citing sources, falling back to a ticket, logging what it could not answer, all four tests passing and proven red without the change, lint 0, typecheck 0, full suite green, a dated artefact under `docs/ops/`, and THE WORK MERGED TO `main` with the merge commit hash on `origin/main` quoted in your log and confirmed with `git ls-remote origin refs/heads/main`. A pushed branch is not a merge.

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
  `DONE 209`, or back to `TODO` with a note if you could not do it.

## THE STATUS CELL: SIX WORDS, AND ONLY SIX

The status cell of a queue row MUST BEGIN with one of exactly these six:

    TODO    DONE    BLOCKED    PARTIAL    IN PROGRESS    WONTFIX

Markdown bold around it is fine - `| **DONE 209 - ...** |` reads correctly.
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

* Finished it -> `DONE 209 - <what you did, and the proof>`
* Did some of it -> `PARTIAL 209 - <what is done, what is left>`. PARTIAL
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

PR #532 is merged (`52b8689` on `origin/main`), and the production deploy workflow is running in the background. I'll report back once it completes and I've verified the live commit hash and migration.



## Cross-project deck

regenerated C:\Bidlowprojects\bidlow-deck.html
