# Cycle 201 - finished

Work happened. Evidence: a git ref moved, so something was committed; the working tree changed, so files were edited.

**RESTART REQUIRED - this watcher is running a STALE copy of its own script.**

  Loaded at launch: 51AF85ED01BF
  On disk now:      DF0DA734E35C

PowerShell reads a script once, at launch, and then runs from memory. Every
change merged to relay-watch.ps1 since this process started is INERT - merging
it again will not help. Stop this watcher and run relay-start.cmd, which clears
HALT and reads the cycle number back out of STATUS.json.

This is queue row 52's defect. It cost about ten cycles precisely because
nothing said this out loud.

Started 2026-08-31 18:01:02, took about 15.1 minutes.
How it ended: exit code 0.

Evidence checked: git refs on every branch, the working tree, and these
files named in the brief: Bidlowprojects\bidlow-deck.html, _standards/bidlow-deck.mjs, relay-watch.ps1, bidlow/GRADES.json, bidlow/relay/QUEUE.md

## What it was asked to do

# Cycle 201 - queue item 137

This brief was written by the relay itself, off the top of QUEUE.md. Greg has
not read it. If it is wrong, say so in your log rather than working around it,
and correct QUEUE.md.

## The item, verbatim from the queue

> **THE DECK IS GREG'S ONE MORNING VIEW ACROSS EVERY PROJECT, AND IT WENT FOUR DAYS STALE WITHOUT ANYONE NOTICING. MAKE IT REGENERATE ITSELF.** On 31 August the deck HTML at `C:\Bidlowprojects\bidlow-deck.html` was last written on 27 August. It knew nothing of the last hundred queue rows, of the sell gate being satisfied, or of any of 30 August's work. Greg's instruction, in his words: this deck must be up to date and current at all times. It is a static snapshot produced by `node _standards/bidlow-deck.mjs --root <root> --out <file>` and nothing regenerates it but a human remembering to. **THE WORK:** have the relay regenerate the deck at the END of each cycle, after the cycle's own commit, in `relay-watch.ps1`. The relay is the right home because it is the thing that actually changes project state - if nothing ran, nothing moved, and the deck does not need rewriting. **THE CONSTRAINT THAT MATTERS MOST, AND IT IS NOT OPTIONAL: A FAILURE TO REGENERATE THE DECK MUST NEVER STOP OR DELAY THE RELAY.** Log it plainly and carry on. This morning proved the cost of getting this wrong the other way: row 122's self-test crashed on a Windows PowerShell difference and, because the self-test GATES startup, it stopped the engine dead three times and cost Greg his first twenty minutes of the day. A cosmetic reporting step must have less power than that, not more. Wrap it so that a missing `node`, a missing script, a syntax error or a locked file is caught, recorded in the cycle log, and stepped over. **WRITE IT ATOMICALLY:** generate to a temporary file and rename into place, so a half-written deck is never served, and so two projects' relays cannot corrupt it if Kepak or Papaya later get relays of their own. **THE SHARED-FOLDER RULE, AND WHY THIS IS A DELIBERATE EXCEPTION:** the standing rule is that no cycle writes outside its own repository, and that rule stands. `bidlow-deck.html` at the root of `C:\Bidlowprojects` is the one named exception, because it is GENERATED OUTPUT derived from every project's own state, it is idempotent, and rewriting it changes no project's data. **`_standards` itself remains absolutely off limits** - do not modify `bidlow-deck.mjs`, `deck.cmd`, `deck-plain.mjs` or anything else under it, and do not write any other file outside this repository. If the deck script itself needs changing, record a finding and stop. **MIND THE ROOT PATH:** `bidlow-deck.mjs` defaults `--root` to `C:\Bidlowprojects` and stamps that path into the rendered header. Pass the root explicitly so the deck is correct wherever it is generated from. **PROVE IT FIRES, do not merely add it:** a self-test case asserting the deck is regenerated after a cycle, and - the one that matters - a case that plants a FAILING deck generation and asserts the relay still completes its cycle normally and logs the failure. Both must fail red without the change. The self-test check count must rise above the 74 it passed at on 31 August. **Assume the seventh exists.** **ALSO RECORD, as a finding rather than fixing it here:** the deck shows ODoutreach at 5 of 6 stages with ASK still open and every other stage marked done out of order, while simultaneously reporting it clear to sell. Say in the artefact whether the deck is right to show both at once, or whether that is a reporting gap worth its own row. Do not change any grade, any stage, or `.bidlow/GRADES.json`. **THE HARD RULE, verbatim and not negotiable: real email may be sent, and data deleted, ONLY for the `bidlowai` client. Every other client may be built on, tested and measured, but nothing leaves the building for them.** **DEFINITION OF DONE:** deck regeneration wired into the end of the cycle in `relay-watch.ps1`, non-fatal on every failure path, written atomically, both self-test cases passing and proven red without the change, a dated artefact under `docs/ops/`, lint 0, typecheck 0, and THE WORK MERGED TO `main` with the merge commit hash on `origin/main` quoted in your log and confirmed with `git ls-remote origin refs/heads/main`. A pushed branch is not a merge.

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
  `DONE 201`, or back to `TODO` with a note if you could not do it.

## THE STATUS CELL: SIX WORDS, AND ONLY SIX

The status cell of a queue row MUST BEGIN with one of exactly these six:

    TODO    DONE    BLOCKED    PARTIAL    IN PROGRESS    WONTFIX

Markdown bold around it is fine - `| **DONE 201 - ...** |` reads correctly.
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

* Finished it -> `DONE 201 - <what you did, and the proof>`
* Did some of it -> `PARTIAL 201 - <what is done, what is left>`. PARTIAL
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

Working tree is clean and the merge is confirmed on `origin/main` at `4075cb4`. Summary of cycle 201:

- **PR sweep**: no open PRs at cycle start — nothing to merge.
- **Row 137 (deck regeneration)**: verified this was already fully done and merged by cycle 200 (`517a525`/`cd59d13`/`5c68a88`, all confirmed present in `main`'s history via `git ls-remote`), not missing work — the row was reopened by the known stale-watcher-in-memory defect, same class as row 138's loop.
- Found two real defects cycle 200 left behind uncommitted when its 45-minute window ended: its own `cycle-200.md` log was never `git add`ed, and `QUEUE.md`'s UTF-8 BOM had been stripped by the tool that made its final restamp — both caught red by existing tests (`relay/cycle-log-reaches-git.test.ts`, `relay/queue-file-integrity.test.ts`).
- Fixed both, ran full gates fresh (lint 0, typecheck 0, 369 files/3827 tests green, `relay-selftest.ps1` 113/113), and merged via PR #519 → `4075cb4` on `origin/main`. No code in `relay-watch.ps1` or `bidlow-deck.mjs` touched.
- Row 137's status text is unchanged (per its own "do not restamp" instruction) with a short reconfirmation note appended.

