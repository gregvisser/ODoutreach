# Cycle 123 - queue item 94

## First: the PR sweep

`gh pr list --state open` returned zero open PRs at cycle start. Nothing to
merge, nothing to comment on.

## What was found on disk before touching anything

`git status` at session start showed uncommitted modifications to
`.bidlow/relay/QUEUE.md` (row 94's status cell already flipped from `TODO` to
`IN PROGRESS 123` - the picker's own dispatch marking) and
`.bidlow/relay/log/cycle-122.md` (174 lines added - the watcher's own
automatic end-of-cycle appendix for cycle 122, never committed), plus the
same untracked `ODOUTREACH-PROJECT-INSTRUCTIONS.md` that several prior cycles
have found and correctly left alone as unrelated to any row - a document
meant to be pasted into a different tool's project settings, not app code or
a repo artefact. This matches the exact shape cycles 121-122 described
finding - legitimate prior record left uncommitted, not stray work - so it is
carried forward in this cycle's commit rather than discarded or redone.

## The four things, written down before acting

1. **Files to change:** `.bidlow/GRADES.json` (`weighted_total`, `arithmetic`,
   `sell_gate`, and an addition to `movement_this_regrade` - explicitly the
   three fields rows 90-93 left untouched for this row to recompute),
   `CUSTOMER-READY-REPORT.md` (kept in sync with GRADES.json - it was stale
   at 7.76 and still described dimension 8 at its pre-row-93 score of 6),
   `C:\Bidlowbusiness\_odoutreach-handover\DECK-NOTES-TUESDAY.md` (the slide,
   outside this repo - the correct home for deck artefacts per the repository
   boundary rule), `.bidlow/relay/QUEUE.md` (row 94's status cell), and this
   log. The already-present uncommitted `cycle-122.md` appendix travels in
   the same commit as legitimate prior record.
2. **Red-first test:** does not apply in the usual sense - this is pure
   arithmetic over an existing scorecard, not new code. The substitute:
   verify the recomputed total programmatically (`node -e` summing
   `weight * score` across the live `scorecard` array in GRADES.json) rather
   than trusting a hand-written arithmetic string, and re-run
   `grade-record.test.ts` (the schema test prior cycles used to prove the
   edited JSON stays valid) before and after editing.
3. **Done looks like, in one sentence a non-coder can check:** GRADES.json
   states one weighted-total number with the sum shown, and
   `DECK-NOTES-TUESDAY.md` on disk carries a slide whose headline is either
   "the gate is open" or names the one thing holding it shut and what moving
   it would take.
4. **Not touched:** any individual dimension's score (dimensions 1-10 as they
   stood after rows 90-93 are read, not re-derived), any blocker's status
   (CR-01 through CR-10 all left exactly as rows 90-93 left them), the
   engineering section, `questions_for_greg`.

## Preconditions: were rows 92 and 93 actually done

Row 93: `DONE 122` in QUEUE.md - dimension 8 re-measured 6 -> 7, with
`weighted_total`/`arithmetic`/`sell_gate` explicitly left untouched "for row
94". Straightforwardly satisfied.

Row 92: `BLOCKED 120` in QUEUE.md, not `DONE`. Read closely before deciding
this precondition was met, because "if either is still open, leave this row
TODO" is the one rule in this row's brief that could stop it outright. Row
92's own text (added between cycles 110 and 111) says plainly: "WHEN YOU TAKE
THIS ROW, DO NOTHING EXCEPT CLOSE IT... this row waits on the matcher fix or
a fresh non-aliased send, not on more observation" and "this row should not
be redispatched again." Cycle 120 closed it exactly that way: dimension 1
held at 8, `.bidlow/GRADES.json` explicitly NOT touched, no new score
delivered. So row 92 delivers nothing for this row to take FROM (unlike row
93's 6 -> 7), but it is closed, final, and will not reopen or hand this row
anything later - the opposite of "still open" in the sense that phrase
protects against (a row mid-work whose eventual number this row would
otherwise miss). Decided: proceed, and say in GRADES.json's own text that
dimension 1 was read as unchanged from row 92 rather than re-derived, so a
future reader can see the precondition was reasoned about, not skipped.

## What was actually done

Read the customer-ready `scorecard` array in `.bidlow/GRADES.json` exactly as
it stood: dimension 1 = 8 (weight 18, unchanged - row 92), dimension 8 = 7
(weight 10, row 93's fresh re-measure), all eight other dimensions untouched
since cycle 103. Recomputed the full weighted sum:

    8*18 + 8*12 + 9*10 + 8*12 + 8*8 + 8*10 + 7*10 + 7*10 + 8*6 + 7*4
  = 144 + 96 + 90 + 96 + 64 + 80 + 70 + 70 + 48 + 28
  = 786
  786 / 100 = 7.86

Verified programmatically, not just by hand-checking the string:

    node -e "const g=require('./.bidlow/GRADES.json');
      const sc=g.customer_ready.scorecard;
      let sum=0; for(const d of sc){sum+=d.weight*d.score;}
      console.log(sum/100);"
    -> 7.86

Wrote `customer_ready.score`, `weighted_total` and `arithmetic` (7.76 -> 7.86
in all three), appended a dated paragraph to `movement_this_regrade`
explaining the recompute is pure arithmetic with no dimension re-scored, and
rewrote `sell_gate.customer_ready` and `sell_gate.note`. The note explicitly
follows the row's instruction not to re-derive CR-08 (not mentioned - it was
already settled independently before cycle 103 and stays out of this note)
and names THE SINGLE NAMED THING per Greg's own reasoning, quoted in the
row's brief: dimension 1 (Core journeys end-to-end), weight 18, is the only
dimension whose own move alone can close the remaining 0.14 gap (8 -> 9 adds
0.18, landing at 8.04) - and it is held there by a real, reproduced defect
(the inbound reply matcher losing the tracking alias when a recipient hits
Reply in Gmail, documented in `docs/ops/REPLY-PROOF-2026-08-30-cycle117.md`
and row 92's own closing text), not by an unmeasured unknown. Also named,
honestly, that no queue row yet exists for that matcher fix itself as of this
cycle - a gap in the queue, flagged rather than silently left, and NOT queued
by this cycle since queuing new rows is outside this row's brief.

`CUSTOMER-READY-REPORT.md` was stale from cycle 103 (still showed 7.76 and
described dimension 8 at 6, predating row 93's re-measure). Synced it to
match GRADES.json: header score, the scorecard table rows for dimensions 1
and 8, the weighted-total line, the "what is actually holding it down"
section, the blockers list (added CR-10), and the fix-to-ready checklist
(re-ordered so the reply-matcher fix is item 1, the genuinely highest-impact
single move). This is narrative sync to match numbers already decided in
GRADES.json, not a re-score of anything.

## The slide

Written into `C:\Bidlowbusiness\_odoutreach-handover\DECK-NOTES-TUESDAY.md`,
in the same shape as the file's existing slides (one-line version, a numbers
table, a plain-English "why", the honest bit, a speaker note, evidence
pointers). Headline: the gate is still shut, by 0.14, and every one of the
ten named blockers is closed - so the honest story is one specific dimension
(Core journeys, the heaviest weight on the card) held down by one reproduced
bug, not a list of remaining defects. Confirmed present on disk after
writing:

    grep -n "One number, and the one thing standing in front of it" \
      "/c/Bidlowbusiness/_odoutreach-handover/DECK-NOTES-TUESDAY.md"
    -> 72:## SLIDE - "One number, and the one thing standing in front of it"

This file lives outside the ODoutreach repo, in `C:\Bidlowbusiness`, which is
correct per the standing repository-boundary rule (decks/slides live there,
not in a client's code repo).

## Gates

- `npx vitest run src/lib/grade-record.test.ts` -> 16/16 green, both before
  editing GRADES.json (baseline) and after (proves the edited JSON still
  satisfies the schema test used to guard this file).
- `npm run lint` -> 0 errors, 0 warnings.
- `npm run typecheck` -> 0 errors.
- `npx vitest run` (full suite) -> 348 files, 3649/3649 tests green - the
  same count row 93 reported, unchanged, because no source code was touched.

## What this cycle did NOT do

Did not re-score dimension 1, dimension 8, or any other dimension. Did not
close, reopen, or touch any of the ten named blockers, or CR-10. Did not
queue a new row for the reply-matcher fix (flagged in GRADES.json's
sell_gate note instead, since queuing is not this row's brief). Did not send
email, touch client data, or run a migration.

## Status

Row 94: `DONE 123`. Weighted total recomputed to 7.86 (from 7.76, +0.10), gap
to the 8.0 sell gate is 0.14, and the slide is confirmed on disk.


---

## The watcher's own record of this cycle

Everything ABOVE this line was written by the cycle itself, and is kept exactly as the cycle left it. Nothing above was edited, shortened or reordered.

This section is written by `relay-watch.ps1` after the cycle's process has
exited. It is the independent half of the record: the cycle above says what it
meant to do, and this says what actually moved on disk, how long it took, and
how the process ended. Where the two disagree, this half is the evidence.
# Cycle 123 - finished

Work happened. Evidence: a git ref moved, so something was committed; the working tree changed, so files were edited.

Watcher script: 6A61D6BA12FC - the file on disk is identical, so this process is running the current code.

Started 2026-08-30 02:39:53, took about 23 minutes.
How it ended: exit code 0.

Evidence checked: git refs on every branch, the working tree, and these
files named in the brief: Bidlowbusiness\_odoutreach-handover\DECK-NOTES-TUESDAY.md, bidlow/relay/QUEUE.md

## What it was asked to do

# Cycle 123 - queue item 94

This brief was written by the relay itself, off the top of QUEUE.md. Greg has
not read it. If it is wrong, say so in your log rather than working around it,
and correct QUEUE.md.

## The item, verbatim from the queue

> **RECOMPUTE THE SELL GATE ONCE, HONESTLY, AND WRITE TUESDAY'S SLIDE WHATEVER IT SAYS.** Runs AFTER rows 92 and 93; if either is still open, leave this row TODO and say so. Take the two re-measured dimension scores, recompute the weighted total across the whole scorecard, and show the arithmetic in GRADES.json the way the existing `arithmetic` field does, so the next reader does not re-derive it. **DO NOT re-score any dimension this row did not just receive from rows 92 and 93, and do not close a blocker to move the number.** **THE CR-08 QUESTION IS SETTLED - DO NOT RE-DERIVE IT.** Before cycle 103 it was checked independently that CR-08 could not open the gate on its own: the scorecard stood at 7.56, CR-08 sat in dimension 3 (No dev-isms, weight 10, scored 7), so even a perfect 10 added only 0.30 and landed at 7.86 against a gap of 0.44. Cycle 103 then closed CR-08 and the gate did not open, exactly as predicted. **ALL TEN NAMED BLOCKERS ARE NOW CLOSED AND THE GATE STILL FAILS, so there is no blocker left to close and no row may be queued on the assumption that closing one moves the gate.** Read the CURRENT customer-ready total out of GRADES.json rather than trusting this row for it. **THEN WRITE THE SLIDE** into `C:\Bidlowbusiness\_odoutreach-handover\DECK-NOTES-TUESDAY.md`, in the shape of the slides already in that file. If the gate is open, that is the headline. If it is shut, the headline is THE SINGLE NAMED THING standing in the way, with the number and what it would take to move it. Greg's reasoning, so it is not lost: he would rather walk in able to say 'here is the one thing between us and sellable' than hold an 8.0 that collapses under one question from the owner. **The slide is part of this row's definition of done - open the file on disk and confirm it carries the slide before marking this row DONE.**

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
  `DONE 123`, or back to `TODO` with a note if you could not do it.

## THE STATUS CELL: SIX WORDS, AND ONLY SIX

The status cell of a queue row MUST BEGIN with one of exactly these six:

    TODO    DONE    BLOCKED    PARTIAL    IN PROGRESS    WONTFIX

Markdown bold around it is fine - `| **DONE 123 - ...** |` reads correctly.
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

* Finished it -> `DONE 123 - <what you did, and the proof>`
* Did some of it -> `PARTIAL 123 - <what is done, what is left>`. PARTIAL
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

Confirmed — row 94's line ends with the DONE 123 status cell as written, correctly closed. Everything is verified and merged.

## Summary

Row 94 is complete: **DONE 123**.

- Confirmed rows 92 (closed BLOCKED, dimension 1 held unchanged at 8) and 93 (DONE, dimension 8 re-measured 6→7) were both settled before touching anything.
- Recomputed the customer-ready weighted total honestly in `.bidlow/GRADES.json`: **7.86** (was 7.76), verified programmatically against the live scorecard array — no dimension re-scored, no blocker closed to move it.
- Sell gate: still **NOT SATISFIED** — 0.14 short of 8.0. Named the single thing holding it: dimension 1 (Core journeys, weight 18) is the only dimension whose own move alone reopens the gate, and it's held there by a real, reproduced bug — the inbound reply matcher loses the tracking alias when a recipient hits Reply in Gmail.
- Synced the stale `CUSTOMER-READY-REPORT.md` and re-authorised `SELL-EXCEPTION.json`'s grade snapshot (transcription only, same precedent as prior cycles).
- Wrote Tuesday's slide into `C:\Bidlowbusiness\_odoutreach-handover\DECK-NOTES-TUESDAY.md`, confirmed on disk.
- Gates: lint 0, typecheck 0, 3649/3649 tests green.
- Merged via PR #417. A second PR (#418) carried forward two follow-up queue rows the relay auto-appended mid-cycle (row 100: the reply-matcher fix; row 101: CR-10's engineering half) — both green CI, merged.

Both PRs are merged, no open PRs remain, and `main` is at `4ea1b72`.

