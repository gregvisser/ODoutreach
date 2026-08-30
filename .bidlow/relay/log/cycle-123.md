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
