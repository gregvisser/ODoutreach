# Cycle 133 - finished

Work happened. Evidence: a git ref moved, so something was committed; the working tree changed, so files were edited.

Watcher script: B9E192203DEB - the file on disk is identical, so this process is running the current code.

Started 2026-08-30 06:52:43, took about 37.8 minutes.
How it ended: exit code 0.

Evidence checked: git refs on every branch, the working tree, and these
files named in the brief: bidlow/DESIGN.json, bidlow/GRADES.json, bidlow/relay/QUEUE.md

## What it was asked to do

# Cycle 133 - queue item 107

This brief was written by the relay itself, off the top of QUEUE.md. Greg has
not read it. If it is wrong, say so in your log rather than working around it,
and correct QUEUE.md.

## The item, verbatim from the queue

> **A MEASURED ACCESSIBILITY FAILURE IS SITTING OPEN IN `.bidlow/DESIGN.json` WITH ITS NUMBERS ALREADY TAKEN, AND IT IS ON A SCREEN CUSTOMERS READ.** Open defect `chart-series-contrast`, found 2026-08-26: in LIGHT mode `--chart-3` measures 2.51:1 and `--chart-4` measures 2.39:1 against a card, where WCAG 1.4.11 requires 3:1 for a graphic carrying required information. Dark mode passes comfortably (8.63 and 8.98). **THE NAIVE FIX IS ALREADY KNOWN TO BE WRONG AND THE RECORD SAYS WHY - DO NOT MAKE IT.** Darkening `--chart-4` to reach 3:1 puts it around 0.62 lightness at hue 162, within 0.07 lightness of `--chart-1` at the same hue, so two series stop being distinguishable. Trading a measured contrast defect for an unmeasured distinguishability defect is worse than leaving it alone. The file itself says this is owed a dedicated pass across the whole series set INCLUDING colour-blind readers, and that is this row. **MEASURE FIRST, PROGRAMMATICALLY, AND SHOW THE NUMBERS BEFORE AND AFTER.** Compute the contrast ratio of EVERY chart token against the card background in BOTH light and dark modes, and the pairwise perceptual distance between every pair of series in the set. Do it in code that can be re-run, not by eye - and add that computation as a test so the next token change cannot silently reintroduce the failure. **THE BAR THIS ROW HAS TO CLEAR, all four at once:** every chart token at 3:1 or better against the card in BOTH modes; every pair of series distinguishable from every other; still distinguishable under deuteranopia, protanopia and tritanopia simulation; and still recognisably the product's palette rather than a generic default. If all four cannot be met with the current number of series, say so plainly with the numbers and propose what would - do not quietly ship three of four. **READ THE HOUSE GUIDANCE BEFORE CHOOSING COLOURS.** There is a `dataviz` skill available with a documented method and a runnable palette validator; use it rather than inventing a procedure. Respect the existing anti-goal `no-pure-black-on-pure-white` and the tokens already fixed in `decisions_taken_this_cycle` - do not revisit the `--input` decision, which was made deliberately and its cost recorded. **UPDATE THE RECORD HONESTLY:** move `chart-series-contrast` out of `open_defects` in `.bidlow/DESIGN.json` only if it is genuinely closed, and write the new measured ratios into `contrast_pairs` so the next reader starts from evidence. If it is NOT fully closed, leave it open and update it with what changed and what remains - a half-closed defect recorded as closed is worse than one left open. **DO NOT SCORE ANYTHING:** no `.bidlow/GRADES.json`, no dimension, no sell gate. Polish is dimension 4's business and only a measured walk may move it. **SCOPE:** the chart tokens and wherever they are defined, the new contrast test, `.bidlow/DESIGN.json`, and a dated artefact under `docs/ops/`. No send. No client data. No schema. Do NOT touch `src/server/email` at all - there is a real sequence sitting at Ready to launch awaiting the owner's own click and nothing this row does may go near the send path. **THE HARD RULE, verbatim and not negotiable: real email may be sent, and data deleted, ONLY for the `bidlowai` client. Every other client may be built on, tested and measured, but nothing leaves the building for them.** **DEFINITION OF DONE:** before-and-after ratios for every token in both modes quoted in a dated artefact under `docs/ops/`, the colour-blind check shown rather than asserted, the re-runnable test green, `.bidlow/DESIGN.json` truthfully updated, lint 0, typecheck 0, the full unit suite green, merged to `main`.

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
  `DONE 133`, or back to `TODO` with a note if you could not do it.

## THE STATUS CELL: SIX WORDS, AND ONLY SIX

The status cell of a queue row MUST BEGIN with one of exactly these six:

    TODO    DONE    BLOCKED    PARTIAL    IN PROGRESS    WONTFIX

Markdown bold around it is fine - `| **DONE 133 - ...** |` reads correctly.
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

* Finished it -> `DONE 133 - <what you did, and the proof>`
* Did some of it -> `PARTIAL 133 - <what is done, what is left>`. PARTIAL
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

That `QUEUE.md` diff wasn't mine — its last-write time (07:27:48) is after I finished my commits, and the content is new row 108/110 text I never wrote. The relay watcher is evidently live on this machine and actively rewriting the queue outside my session. I'm leaving it untouched since it's outside row 107's scope and not something I created.

**Session complete.** Row 107 (`chart-series-contrast`) is closed and merged to `main`:
- PR #429 — the palette fix, gates, and dated artefact (commit `1ecb140`)
- PR #430 — `STATE.md` backfill for this session plus cycles 131/132, which never recorded their own state (commit `f733c3a`)

`.bidlow/relay/QUEUE.md` row 107 reads `DONE 133`. Next session should start from `STATE.md`'s "Pick up first" section — row 109 (the silent Launch-button failure Greg hit live) is flagged as the most important open item.

