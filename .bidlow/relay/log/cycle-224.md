# Cycle 224 - finished

Work happened. Evidence: a git ref moved, so something was committed; the working tree changed, so files were edited.

Watcher script: 3ABAA45FD1AB - the file on disk is identical, so this process is running the current code.

Started 2026-09-01 10:22:32, took about 58.1 minutes.
How it ended: exit code 0.

Evidence checked: git refs on every branch, the working tree, and these
files named in the brief: _standards/checklists/email-sending.md, _standards/bidlow-standards/plugins/bidlow-standards/scripts/lib.mjs, _standards/bidlow-standards/plugins/bidlow-standards/scripts/session-start.mjs, _standards/bidlow-standards/plugins/bidlow-standards/scripts/gate-build.mjs, bidlow/GRADES.json, bidlow/relay/QUEUE.md

## What it was asked to do

# Cycle 224 - queue item 145

This brief was written by the relay itself, off the top of QUEUE.md. Greg has
not read it. If it is wrong, say so in your log rather than working around it,
and correct QUEUE.md.

## The item, verbatim from the queue

> **GREG APPROVED THIS ON 31 AUGUST: "do the gate, but ensure ODoutreach does not break". IT IS THE FIELD-KNOWLEDGE GATE ON CHECK.** **WHY IT EXISTS.** `_standards/checklists/email-sending.md` records, in Greg's own words, that his field knowledge of cold email sending was **1 out of 5 at ODoutreach kickoff and was treated as 4**, and names that as the root cause of the incident that damaged a client's sending domain. The scores already exist and are already honest. Nothing reads them. That is the whole defect: a number written down to prevent a repeat, which no gate consults. **THE SCORES, read 31 August, so you do not have to guess:** apis 3 (2 on MCP/agent interfaces), cms-content 4, ecommerce-payments 2 on BUILDING subscription commerce (corrected downward in v1.1, below the gate), email-sending 1 at kickoff, food-production-hs 0-1 (below the gate by a wide margin), mobile-apps 1 (below the gate, external verification mandatory), web-saas 4. **THE WORK.** Make CHECK refuse to close for a project whose governing checklist scores 0 or 1, unless a human records an override. The override must be possible, must name who granted it and why, and must be visible on the deck rather than buried - a gate nobody can pass is a gate people route around. **THE CONSTRAINT THAT MATTERS MOST, AND IT IS NOT NEGOTIABLE: ODoutreach MUST STILL BUILD.** ODoutreach's governing field is email-sending, which scores 1. Its CHECK is already closed and it is live with a paying client. **Every project whose CHECK is already closed is GRANDFATHERED** - this gate applies only to a CHECK CLOSING FROM NOW ON. Proving ODoutreach still builds and its relay still writes files is THE MOST IMPORTANT ASSERTION IN THIS ROW; if you cannot prove it, ship nothing and say so. On 31 August a change to the relay's own tooling bricked it for two hours before a self-test caught it. Do not repeat that shape. **FAIL SAFE, NOT FAIL SHUT.** If the checklist is missing, unreadable, or has no score, the gate must let the work proceed and say plainly that it could not read a score. A gate that blocks on its own bug is worse than no gate. **AUTHORISED `_standards` PATHS, AND ONLY THESE THREE:** `_standards/bidlow-standards/plugins/bidlow-standards/scripts/lib.mjs`, `_standards/bidlow-standards/plugins/bidlow-standards/scripts/session-start.mjs`, `_standards/bidlow-standards/plugins/bidlow-standards/scripts/gate-build.mjs`. **EXPLICITLY NOT `_standards/checklists/`** - those scores are Greg's own field judgement and are not yours to edit, raise, lower or reword. **EXPLICITLY NOT any sibling project folder.** The standing rule that `C:\Bidlowprojects\_standards` is never written to is lifted for those three named files and nothing else. **BEWARE `gate-build.mjs`:** it already refuses Write and Edit on source files. Putting a knowledge-score condition into that path without the grandfather clause would stop ODoutreach's relay writing any file at all. Read it before you change it. **PROVE IT FIRES, do not merely build it:** a test that a score of 0 or 1 blocks a NEW CHECK close; a test that an override lets it through and is recorded; a test that a grandfathered project is untouched; a test that a missing or unreadable score does NOT block. All four must fail red without the change. **DO NOT SCORE ANYTHING:** no `.bidlow/GRADES.json`, no dimension, no sell gate. **THE HARD RULE, verbatim and not negotiable: real email may be sent, and data deleted, ONLY for the `bidlowai` client. Every other client may be built on, tested and measured, but nothing leaves the building for them.** **DEFINITION OF DONE:** the gate shipped with the grandfather clause and the override path, all four tests passing and proven red without the change, a demonstration in your log that ODoutreach still builds, a dated artefact under `docs/ops/`, and THE WORK MERGED TO `main` with the merge commit hash on `origin/main` quoted in your log and confirmed with `git ls-remote origin refs/heads/main`. A pushed branch is not a merge.

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
  `DONE 224`, or back to `TODO` with a note if you could not do it.

## THE STATUS CELL: SIX WORDS, AND ONLY SIX

The status cell of a queue row MUST BEGIN with one of exactly these six:

    TODO    DONE    BLOCKED    PARTIAL    IN PROGRESS    WONTFIX

Markdown bold around it is fine - `| **DONE 224 - ...** |` reads correctly.
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

* Finished it -> `DONE 224 - <what you did, and the proof>`
* Did some of it -> `PARTIAL 224 - <what is done, what is left>`. PARTIAL
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

I'll wait for the scheduled wakeup to check CI status again.



## Cross-project deck

regenerated C:\Bidlowprojects\bidlow-deck.html
