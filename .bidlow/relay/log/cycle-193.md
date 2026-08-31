# Cycle 193 - queue item 134

## PR sweep
`gh pr list --state open` returned an empty list at the start of this cycle -
nothing to merge, nothing to comment on.

## What was asked
Row 134 asked four questions from Greg (Universe → sequence discoverability,
send cooldowns, training accuracy, an AI ask-box in Training) to be answered
from the code and screens, building nothing.

## What was found before touching anything
`git log --oneline -10 main` showed the row was already fully done: cycle 192
answered all four questions with file:line evidence in
`docs/ops/ROW134-FOUR-QUESTIONS-2026-08-31-cycle192.md`, merged as `dab1019`
(PR #505), with the merge hash itself recorded in a same-cycle follow-up
`a03dd29` (PR #506) - already on `main`. The working tree's `QUEUE.md` had
been stamped `IN PROGRESS 193` by the relay picker (later independently
rewritten to a reworded `DONE 192` by a concurrent Cowork edit - this file is
shared and both sides edit it, per its own header).

Per this project's CLAUDE.md rule ("A row reopened after a relay timeout may
already be merged — check main first... If the merged work already satisfies
the brief, verify it and close the row rather than redoing it"), the first
and only real job this cycle was verification, not re-investigation:

- Read the full artefact end to end (`docs/ops/ROW134-FOUR-QUESTIONS-2026-08-31-cycle192.md`,
  329 lines) - it answers all four questions with cited file:line evidence,
  states a clear recommendation for each, and raises four follow-up rows
  (146-149) for the real work, exactly as the brief required. No code was
  changed by that row, correctly, per its own "build nothing" instruction.
- Confirmed rows 146-149 exist in `QUEUE.md` (all `TODO`, correctly not
  started).
- Ran `git ls-remote origin refs/heads/main` myself this cycle: returned
  `a03dd29326f1b75cab97a2684f60b67e71ff6f61`, matching local `main` `HEAD`
  exactly. The merge is real, not just claimed.
- Confirmed no `.bidlow/GRADES.json`, dimension file, or sell-gate file was
  touched by the row, per its own prohibition.
- `npm run lint` and `npm run typecheck` both ran clean (0/0) - no code was
  changed so this is a formality, not a real gate on this row, but it is
  proof nothing was left broken.

**Conclusion: the row is genuinely done. Redoing the investigation a third
time would waste a cycle on work that already exists and is already merged.**

## Why the row keeps reopening
Cycle 192's own log (`.bidlow/relay/log/cycle-192.md`, sitting untracked in
the working tree at the start of this cycle - committed now alongside this
log) records the actual root cause: the relay watcher process is running a
STALE in-memory copy of `relay-watch.ps1` -

    Loaded at launch: 51AF85ED01BF
    On disk now:      FFDB8B83837A

This is the same defect class already diagnosed for row 138's eleven-cycle
loop (see `.bidlow/relay/log/cycle-182.md` onward, and project memory
`relay-watcher-stale-restart-row138-loop.md`). No cycle can fix this from
inside a queue row - only Greg running `relay-start.cmd` clears it. Writing a
correct `DONE` status to this row does not by itself guarantee the watcher
won't reopen it a third time; that is a property of the running process, not
of this file's content.

**This change is NOT a fix to `relay-watch.ps1` itself, so the standing
"inert until restart" rule does not apply here** - nothing in this cycle
edited the watcher script or anything it loads at launch. It only documents,
again, that the watcher process itself needs restarting.

## Files changed this cycle
- `.bidlow/relay/QUEUE.md` - row 134 status reworded from the relay's
  `IN PROGRESS 193` stamp (superseded by a concurrent Cowork edit to a
  reworded `DONE 192`) to `DONE 193`, recording this cycle's independent
  re-verification of the same already-merged evidence.
- `.bidlow/relay/log/cycle-192.md` - committed; this file existed untracked
  in the working tree at the start of this cycle (the previous cycle was
  killed by the 45-minute deadline before it could commit its own log).
- `.bidlow/relay/log/cycle-193.md` - this file.

No `src/`, `prisma/`, or test file was touched. No email sent, no data
deleted, for any client.

## Gates
- `npm run lint` - 0 errors.
- `npm run typecheck` - 0 errors.
- `npm test` not run - no code changed by this row; the existing suite is
  unaffected by a docs/queue-file-only change.

## Status
`DONE 193` for row 134 - see the QUEUE.md cell above for the full note.


---

## The watcher's own record of this cycle

Everything ABOVE this line was written by the cycle itself, and is kept exactly as the cycle left it. Nothing above was edited, shortened or reordered.

This section is written by `relay-watch.ps1` after the cycle's process has
exited. It is the independent half of the record: the cycle above says what it
meant to do, and this says what actually moved on disk, how long it took, and
how the process ended. Where the two disagree, this half is the evidence.
# Cycle 193 - finished

Work happened. Evidence: a git ref moved, so something was committed; the working tree changed, so files were edited.

**RESTART REQUIRED - this watcher is running a STALE copy of its own script.**

  Loaded at launch: 51AF85ED01BF
  On disk now:      FFDB8B83837A

PowerShell reads a script once, at launch, and then runs from memory. Every
change merged to relay-watch.ps1 since this process started is INERT - merging
it again will not help. Stop this watcher and run relay-start.cmd, which clears
HALT and reads the cycle number back out of STATUS.json.

This is queue row 52's defect. It cost about ten cycles precisely because
nothing said this out loud.

Started 2026-08-31 15:20:12, took about 17.8 minutes.
How it ended: exit code 0.

Evidence checked: git refs on every branch, the working tree, and these
files named in the brief: docs/ops/AI-FEATURES-REVERIFY-2026-08-30-cycle160.md, src/server/ai/ai-feature-data-policy.ts, bidlow/GRADES.json, docs/ops/TUESDAY-READINESS-MEASUREMENT-2026-08-30.md, docs/ops/DIMENSION-1-RESCORE-2026-08-30-cycle165.md, bidlow/relay/QUEUE.md

## What it was asked to do

# Cycle 193 - queue item 134

This brief was written by the relay itself, off the top of QUEUE.md. Greg has
not read it. If it is wrong, say so in your log rather than working around it,
and correct QUEUE.md.

## The item, verbatim from the queue

> **FOUR QUESTIONS GREG ASKED ON 31 AUGUST. ANSWER THEM FROM THE CODE AND THE SCREENS, BUILD NOTHING IN THIS ROW.** (1) **Can a user create a new list for a new sequence from the Universe tab?** Walk it as an operator would - `src/app/(app)/universe/` through to `clients/[clientId]/lists`. If the path exists, say exactly which clicks it takes. If it does not, say what an operator has to do instead and how obvious that is. (2) **Are send cooldowns actually in place** - can the system be stopped from emailing the same prospect inside an agreed window, and is that window configurable? Name the code that enforces it and whether it is proven by a test. If nothing enforces it, say so plainly - that is a client-facing promise. (3) **Are the training modules current and understandable?** Read `src/app/(app)/training/` against what the product actually does today; list anything that describes a screen or a flow that has since changed. (4) **Would an AI ask-box in Training work, and what would it cost?** Assess only - the AI features now work and record real spend (see `docs/ops/AI-FEATURES-REVERIFY-2026-08-30-cycle160.md`), and any such box must respect the CR-10 data policy in `src/server/ai/ai-feature-data-policy.ts`. Say whether questions could carry client or prospect data and what that means. **Produce ranked findings with a recommendation on each, and raise real work as its own rows rather than doing it here.** **DO NOT SCORE ANYTHING:** no `.bidlow/GRADES.json`, no dimension, no sell gate, and do not edit `docs/ops/TUESDAY-READINESS-MEASUREMENT-2026-08-30.md` or `docs/ops/DIMENSION-1-RESCORE-2026-08-30-cycle165.md`. **THE HARD RULE, verbatim and not negotiable: real email may be sent, and data deleted, ONLY for the `bidlowai` client. Every other client may be built on, tested and measured, but nothing leaves the building for them.** **DEFINITION OF DONE:** a dated artefact under `docs/ops/` answering all four with evidence, new rows raised for anything worth building, and the work merged to `main` with the commit hash quoted and confirmed via `git ls-remote origin refs/heads/main`.

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
  `DONE 193`, or back to `TODO` with a note if you could not do it.

## THE STATUS CELL: SIX WORDS, AND ONLY SIX

The status cell of a queue row MUST BEGIN with one of exactly these six:

    TODO    DONE    BLOCKED    PARTIAL    IN PROGRESS    WONTFIX

Markdown bold around it is fine - `| **DONE 193 - ...** |` reads correctly.
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

* Finished it -> `DONE 193 - <what you did, and the proof>`
* Did some of it -> `PARTIAL 193 - <what is done, what is left>`. PARTIAL
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

Row 134 is closed. Summary of cycle 193:

- **PR sweep**: no open PRs at start.
- **Row 134**: it had already been fully answered and merged in cycle 192 (`dab1019`, PR #505, hash-recorded in `a03dd29`/PR #506) — but the relay's watcher (running a stale copy of `relay-watch.ps1`, same defect class as the earlier row 138 loop) reopened it. Per this project's own CLAUDE.md rule, I verified rather than redid: confirmed `git ls-remote origin refs/heads/main` matched the merged commit, read the artefact end to end, and confirmed rows 146–149 were already correctly raised. No code changes needed.
- Committed the still-uncommitted cycle-192 log, wrote the cycle-193 log, and closed the row as `DONE 193`, merged as `e59bf20` (PRs #507 and #508, both green CI, confirmed on `origin/main`).
- The root cause (stale watcher process) is still outside any queue row's power to fix — only Greg restarting it via `relay-start.cmd` stops the reopen loop.

