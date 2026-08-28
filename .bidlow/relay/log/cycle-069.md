# Cycle 69 - finished

Work happened. Evidence: a git ref moved, so something was committed; the working tree changed, so files were edited.

Started 2026-08-28 13:54:44, took about 21.8 minutes.
How it ended: exit code 0.

Evidence checked: git refs on every branch, the working tree, and these
files named in the brief: Bidlowbusiness\_odoutreach-handover\DNC-SHEET-RANGE-FIX.md, bidlow/relay/QUEUE.md

## What it was asked to do

# Cycle 69 - queue item 48

This brief was written by the relay itself, off the top of QUEUE.md. Greg has
not read it. If it is wrong, say so in your log rather than working around it,
and correct QUEUE.md.

## The item, verbatim from the queue

> **GREG HAS HANDED THE TWO FAILING DO-NOT-CONTACT SHEETS TO US. HE TRIED THE SPREADSHEET WORKAROUND AND IT DID NOT STICK - DO NOT SEND HIM BACK TO GOOGLE SHEETS. FULL BRIEF: `C:\Bidlowbusiness\_odoutreach-handover\DNC-SHEET-RANGE-FIX.md`.** Verified live 2026-08-28 by pressing Sync: Pareto FM whole-domains has NO protection at all (0 rows), Train Hugger whole-domains is serving 373 STALE rows. Both because `suppression-sync.ts:125` falls back to `Sheet1!A1:Z50000` and neither sheet has a tab called Sheet1. **The fix is to stop guessing: `readSheetTabTitles(spreadsheetId)` ALREADY EXISTS and is already called in the catch block to write a nicer error - it discovers the real tab names and throws them away.** Use it up front when no range is set, and read the FIRST tab. That fixes both clients and every future one with nobody renaming anything. **THE PART THAT MATTERS MORE THAN THE FIX:** this path is REPLACE-ON-SYNC - `applySheetToSuppressionTables` deleteMany's then inserts. Resolving the wrong tab would DELETE a working block list. On Train Hugger that is 373 domains going from blocked to sendable, silently, on a live cold-email system. `suppressionShrinkWarning` warns AFTER the delete, which is not a guard. MAKE THE REPLACE REFUSE: a sync that would write zero rows, or shrink an existing list beyond a small margin, must ABORT without deleting and report why. Fail toward keeping people blocked, always. Red-first, four tests, each watched failing: single-tab sheet syncs with no range; a two-tab sheet reads the first; a 373-to-0 sync ABORTS and the 373 survive; an explicit range still wins. Also add the `sheetRange` input the UI has never rendered. **Done means both real sheets synced and the true row counts reported - not a green test.**

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
  `DONE 69`, or back to `TODO` with a note if you could not do it.

## THE STATUS CELL: SIX WORDS, AND ONLY SIX

The status cell of a queue row MUST BEGIN with one of exactly these six:

    TODO    DONE    BLOCKED    PARTIAL    IN PROGRESS    WONTFIX

Markdown bold around it is fine - `| **DONE 69 - ...** |` reads correctly.
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

* Finished it -> `DONE 69 - <what you did, and the proof>`
* Did some of it -> `PARTIAL 69 - <what is done, what is left>`. PARTIAL
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

Cycle 69 complete. Status: **PARTIAL 69**.

## The main finding: the code was already built and deployed

The queue row and the handover brief are both written as if the fix still needs building — "the fix is to stop guessing", "add the `sheetRange` input the UI has never rendered". **All of it was already merged and live** in commit `db4b301`, which I verified by hash against the direct App Service URL. The tab resolution, the refusing guard, and the range input all exist.

What no cycle had done is the sentence the row *ends* with: *"Done means both real sheets synced and the true row counts reported — not a green test."* Cycle 68 was killed at 45 minutes trying. I corrected the row and the brief rather than working around them.

## So I pressed it — read-only, zero writes

Via the inventory `GET` (database only, no Google) and `sync-all` with `{"dryRun":true}` (resolves the tab, reads the sheet, runs the guard, then stops before the delete).

| Sheet | Resolved range | Before | Sheet holds | Outcome |
|---|---|---|---|---|
| Pareto FM · domains | `'Domains'!A1:Z50000` | 0 | 121 | **FIXED** — 121 stored, SUCCESS |
| Train Hugger · domains | `'Domains'!A1:Z50000` | 373 | 291 | **REFUSED** — nothing deleted |
| Train Hugger · emails | `'Sheet1'!A1:Z50000` | 124 | 125 | fine |

**Pareto FM is genuinely fixed** — a client that had *no* domain protection now has 121 domains of it. The dry run re-reads 121-for-121, so that's stable, not a lucky one-off.

**Train Hugger is the more important result.** Both halves worked: it read the tab really called "Domains" instead of guessing "Sheet1", and then the guard refused — 82 removals is 22% of the list, past the 10% limit — *before* the `deleteMany`. That is the guard firing on live production data against a real client spreadsheet. The brief demanded proof the thing fires rather than proof it exists; this is that proof, and it isn't a mock. Under the old code those 82 domains would have gone from blocked to sendable silently.

Incidentally, this explains the asymmetry the brief noticed but couldn't account for: Train Hugger's *email* sheet really does have a tab called `Sheet1`, which is why only the domain lists ever broke.

## One question, and it's yours

Finishing Train Hugger means confirming the shrink, which **unblocks 82 domains a client put on a do-not-contact list**. That's rule (b), and it's exactly the decision the guard was built to hand to a human — so I didn't press it.

**Train Hugger's "Domains" tab holds 291 today against our 373 from before 14 August — did they shorten the list deliberately (confirm, and 82 become contactable), or did rows go missing from the sheet (put them back, re-sync, nothing lost)?** Until you answer, the 373 stay blocked, which is the safe direction and costs only a few unnecessary blocks.

I did *not* chase which 82 they are: that needs the production database, my IP isn't on the Azure Postgres firewall, and opening a prod client database to a laptop for a diagnostic is a worse trade than you comparing two lists.

## Also

- **PR sweep:** zero open PRs at start — nothing rotting.
- **Gates:** 13 files / 110 tests green across the suppression suites, including all four tests the row demanded. Lint and typecheck deliberately *not* claimed — no source file changed, so there was nothing to gate.
- **Found and fixed a latent queue-stopper:** row 51's status cell quoted a PowerShell pipeline, and the raw `|` split the cell so a parser reads its status as `Set-Content -Path $logFile…` rather than `DONE 63`. Not stopping the queue today, but a landmine in the file that governs every cycle. Escaped it; all 80 numbered rows now parse (PR #327).
- Both PRs (#326, #327) merged with green CI. `main` clean, zero PRs open, working tree clean.

Open questions: **1** — the Train Hugger 291-vs-373 call above.

