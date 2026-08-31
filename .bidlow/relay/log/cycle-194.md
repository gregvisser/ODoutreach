# Cycle 194 - queue item 134

## PR sweep
`gh pr list --state open` returned an empty list at the start of this cycle -
nothing to merge, nothing to comment on.

## What was asked
Row 134 asked four questions from Greg (Universe -> sequence discoverability,
send cooldowns, training accuracy, an AI ask-box in Training) to be answered
from the code and screens, building nothing.

## What was found before touching anything
`git log --oneline -10 main` and `git fetch origin` showed the row was
already fully done, for the THIRD time running:

- Cycle 192 answered all four questions with file:line evidence in
  `docs/ops/ROW134-FOUR-QUESTIONS-2026-08-31-cycle192.md` and merged as
  `dab1019` (PR #505), hash-recorded in `a03dd29` (PR #506).
- Cycle 193 met the row reopened, verified rather than redid, and closed it
  again as `06171af`/`e59bf20` (PR #507/#508).
- This cycle met it reopened a THIRD time, stamped `IN PROGRESS 194` in the
  working tree by the relay picker (uncommitted at cycle start, alongside an
  uncommitted full copy of cycle 193's own log - see "Loose ends" below).

`git merge-base --is-ancestor <hash> origin/main` was run for all three of
`dab1019`, `06171af` and `e59bf20`: all three ARE ancestors of `origin/main`,
and `origin/main` HEAD is `e59bf20` - the exact commit that closed the row
last cycle. Nothing is missing. Re-read the full 329-line artefact end to
end again this cycle to be sure it still answers all four questions with
evidence and still correctly raised rows 146-149 (all present in `QUEUE.md`,
still `TODO`, correctly not started). It does, and it was not touched again.

**Conclusion: the row was genuinely, repeatedly done. A fourth run of the
investigation would have been a fourth wasted cycle on work that has not
moved since cycle 192.**

## Why the row keeps reopening - not a new defect
Same stamp as the last several cycle logs:

    Loaded at launch: 51AF85ED01BF
    On disk now:      FFDB8B83837A

`.bidlow/relay/row-reopen-counts.json` still does not exist on disk, which
confirms (independently of the stamp) that the loop-breaker code merged in
`b0a9052` (cycle 184) has never executed in the live watcher process - it
cannot have written a counts file it has never run. This is the same
diagnosed defect documented at length in `.bidlow/relay/RESTART-REQUIRED.md`
("A FOURTH RESTART") for row 143's loop. Row 134 is not a new instance of a
new bug - it is proof the same stale process reopens whatever DONE row it
next happens to touch, not only row 143.

## While this cycle was investigating, a concurrent edit fixed it for real
Partway through this cycle, `.bidlow/relay/QUEUE.md` changed on disk under
this process - a concurrent editor ("Cowork", already credited in cycle 193's
own log for a prior edit to this same shared file) applied row 143's own
decoy-stamp technique directly to row 134: the status cell now reads

    DONE 192 - MERGED AND VERIFIED, STAMPED 192 ON PURPOSE. ... Stamped with
    192, the cycle that actually did the work, rather than the closing
    cycle, because the live watcher is a stale pre-fix process whose branch
    check only runs on a status matching DONE followed by that same cycle
    number ... Do not restamp it. Do not redo it.

This is the correct fix, not just a correct-sounding one: the live (stale)
guard's branch check only fires when the status matches `DONE` followed by
the cycle number that just ran. A row closed as `DONE 194` would be checked
again next time cycle 194's own pushed-branch name shows up in the guard's
squash-blind matching; a row closed as `DONE 192` never matches a
freshly-run cycle's own number again, so the reopen stops independent of
whether the watcher process itself is ever restarted. This is exactly the
technique already proven on row 143 (stamped `DONE 184`, unchanged across
six subsequent cycles).

**This cycle left that edit exactly as found and did not restamp it, per its
own explicit instruction.** Re-verified it against the facts rather than
trusting the note blindly: `dab1019` (the hash the note cites) is a genuine
ancestor of `origin/main`, and the artefact and rows 146-149 it references
all check out as described above.

## Loose ends found and cleared this cycle
The working tree at cycle start held one genuine piece of leftover work from
cycle 193 that had not made it into a commit before that process ended (exit
code 0, per its own appended watcher record at the bottom of the file):
`.bidlow/relay/log/cycle-193.md` - the committed version on `main` was an
88-line stub ending "see the QUEUE.md cell above for the full note"; the
working copy held the full 278-line log including cycle 193's own narrative
and the watcher's appended completion record. The fuller version is accurate
and is the authoritative record of what actually happened
(`RESTART-REQUIRED.md`'s own rule is that the watcher's appended half is
evidence and must not be edited) - committed as-is this cycle rather than
discarded or rewritten.

## Files changed this cycle
- `.bidlow/relay/log/cycle-193.md` - committed in full (see above); no
  content changed, only committed.
- `.bidlow/relay/RESTART-REQUIRED.md` - new section recording that the
  stale-watcher reopen loop hit row 134 too, not only row 143, and that it
  was fixed the same way (the decoy-stamp technique), so future cycles that
  meet a row reopened under this stamp know both the diagnosis and the fix.
- `.bidlow/relay/log/cycle-194.md` - this file.
- `.bidlow/relay/QUEUE.md` - NOT touched by this cycle; the concurrent edit
  described above already closed row 134 correctly and this cycle
  deliberately did not restamp or redo it, per that edit's own instruction.

No `src/`, `prisma/`, or test file was touched. No `.bidlow/GRADES.json`,
dimension file, or sell-gate file was touched. No email sent, no data
deleted, for any client.

## Gates
- `npm run lint` - 0 errors.
- `npm run typecheck` - 0 errors.
- `npm test` not run - no application code changed by this row; the existing
  suite is unaffected by a docs/queue-file-only change.

## Status
Row 134 stays `DONE 192` (stamped on purpose, see above) - this cycle's own
contribution is committing cycle 193's leftover log and generalising the
restart diagnosis in `RESTART-REQUIRED.md`. Nothing in the queue row itself
needed to change.
