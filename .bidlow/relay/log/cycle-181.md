# Cycle 181 - queue item 138

## Start-of-cycle PR sweep

`gh pr list --state open` returned zero open PRs. Nothing to merge or comment on.

## Files touched

- `.bidlow/relay/QUEUE.md` - row 138 status cell only, closed `DONE 181`.
- `.bidlow/relay/log/cycle-180.md` - committed cycle 180's own uncommitted
  watcher footer (the "watcher's own record" section `relay-watch.ps1`
  appends after a cycle's process exits), which was sitting in the working
  tree unstaged when this cycle started, in the same shape cycle 180 itself
  found and committed for cycle 179's footer.
- `.bidlow/relay/log/cycle-181.md` - this file.

No other file was created, edited, or deleted. Nothing under `_standards`
was touched this cycle - the previously-authorised write to
`C:\Bidlowprojects\_standards\bidlow-deck.mjs` was made in cycle 169 and is
still present, unedited, on `main`.

## What I found before writing any code

`git status` at start of cycle showed two uncommitted files: `QUEUE.md` (the
watcher had flipped row 138's status to `IN PROGRESS 181` when it picked the
row up) and `cycle-180.md` (197 extra lines - the watcher's own end-of-cycle
footer for cycle 180, not yet committed). Per this project's CLAUDE.md rule
("a row reopened after a relay timeout may already be merged - check `main`
first"), I checked `main` before writing anything:

- `git log --oneline -10 origin/main` shows `2fda2d263fe09e0bf66f4dd0c64c7a89b28b8333`
  at the tip, commit message "row 138 - close as re-verified and merged
  (cycle 180) (#490)".
- `gh pr view 490` confirms `state: MERGED`, `mergeCommit.oid` matches.
- `git ls-remote origin refs/heads/main` returns that same hash - main has
  not moved since.

So this is the same loop cycles 171-180 already described: row 138's actual
work (the deck headline) was built once, in cycle 169, merged, and has never
regressed. The row keeps reopening because of a defect entirely outside this
row's content - the relay watcher process is running a stale in-memory copy
of `relay-watch.ps1` (row 52's class of defect; its own stamp mechanism,
merged in cycle 81, is what is now correctly reporting this: cycle 180's
watcher footer shows `Loaded at launch: 51AF85ED01BF` vs `On disk now:
E97F4D42A323`). No cycle can fix that from inside row 138.

## The red-first test

Not applicable to new code, because no code changed. The acceptance test for
"is the merged work still there and correct" is the existing
`standards/bidlow-deck-out-of-order-headline.test.ts`, written in cycle 169.
I did not touch it and did not need a new red state - re-running it against
the unmodified `bidlow-deck.mjs` is the honest check for "did anything
regress", and the answer is no.

## What "done" looks like

A non-coder can check this by opening `.bidlow/relay/QUEUE.md`, row 138, and
seeing it begins `DONE`, and by loading `C:\Bidlowprojects\_standards\deck-preview.html`
(or running `deck.cmd`) and seeing a banner above the project tiles naming
any project building ahead of its own questions - and seeing nothing extra
appear for a project that is fully in order.

## What I verified (gates run fresh, not assumed)

- `npx vitest run standards/bidlow-deck-out-of-order-headline.test.ts` -> **2
  passed / 2 total**.
- `npm run lint` -> **0 problems**.
- `npm run typecheck` -> **0 errors**.
- `docs/ops/DECK-OUT-OF-ORDER-HEADLINE-2026-08-31-cycle169.md` still present,
  still names before/after wording and every file touched.
- `bidlow-deck.mjs.bak-2026-08-31` (the dated backup this row required)
  still present alongside the live file.

## What I did NOT do, and why

I did not re-derive the finding from scratch, re-diff `bidlow-deck.mjs`
line-by-line against a fresh backup, or write a new artefact under
`docs/ops/` - cycle 178's own instruction is to keep a re-verification of an
unchanged commit to the minimum needed to requote the hash, not to repeat
the full build. I did not touch `relay-watch.ps1`, the picker logic, or
anything under `_standards` other than confirming (read-only) that
`bidlow-deck.mjs` is unchanged - this row authorises writing to that one
file, not fixing why the queue keeps reopening rows, which is row 52's
class of problem and already has its own closed row.

## Scope discipline

Touched only this project's `.bidlow/relay/` files. Did not create, edit,
move or delete anything under `_standards`, `BidlowClients\Kepak`,
`BidlowClients\Papaya`, or any other sibling project. No email sent, no
client data moved, no migration, additive or destructive.

## Standing finding, repeated because cycle 180 was right that it would still
be true

This is the tenth cycle in a row (171 through 181) to spend its full budget
re-verifying the same already-merged, still-correct change because the
watcher process serving this queue has not been restarted since before the
fix landed. **No queue-side action closes this permanently.** The two
actions that would are, in order of cost: (1) Greg runs `relay-start.cmd` in
this repo's root, which loads the current `relay-watch.ps1` and would stop
row 138 (and anything else affected by the same staleness) from reopening
on a stale read; or (2) Greg removes row 138 from the live queue by hand.
Recommend (1), since it is a two-minute action that also fixes any other row
suffering the same class of defect, not just this one.

## Row 138 closed

`DONE 181` in `.bidlow/relay/QUEUE.md`, merged to `main` - hash quoted below
once the PR is merged.


---

## The watcher's own record of this cycle

Everything ABOVE this line was written by the cycle itself, and is kept exactly as the cycle left it. Nothing above was edited, shortened or reordered.

This section is written by `relay-watch.ps1` after the cycle's process has
exited. It is the independent half of the record: the cycle above says what it
meant to do, and this says what actually moved on disk, how long it took, and
how the process ended. Where the two disagree, this half is the evidence.
# Cycle 181 - finished

Work happened. Evidence: a git ref moved, so something was committed; the working tree changed, so files were edited.

**RESTART REQUIRED - this watcher is running a STALE copy of its own script.**

  Loaded at launch: 51AF85ED01BF
  On disk now:      E97F4D42A323

PowerShell reads a script once, at launch, and then runs from memory. Every
change merged to relay-watch.ps1 since this process started is INERT - merging
it again will not help. Stop this watcher and run relay-start.cmd, which clears
HALT and reads the cycle number back out of STATUS.json.

This is queue row 52's defect. It cost about ten cycles precisely because
nothing said this out loud.

Started 2026-08-31 10:38:16, took about 13.7 minutes.
How it ended: exit code 0.

Evidence checked: git refs on every branch, the working tree, and these
files named in the brief: Bidlowprojects\_standards\bidlow-deck.mjs, bidlow/relay/QUEUE.md

## What it was asked to do

# Cycle 181 - queue item 138

This brief was written by the relay itself, off the top of QUEUE.md. Greg has
not read it. If it is wrong, say so in your log rather than working around it,
and correct QUEUE.md.

## The item, verbatim from the queue

> **MAKE OUT-OF-ORDER WORK THE HEADLINE ON THE DECK. THE ESTATE IS BUILDING AHEAD OF ITS OWN QUESTIONS AND THE DECK REPORTS IT ONLY AS A PER-PROJECT FOOTNOTE.** Measured from the 31 August regeneration: **BUILD 7 of 8, ASK 2 of 8.** Seven projects are building; two have closed their questions. ODoutreach's own row marks every stage after ASK as 'done out of order' while simultaneously reading 'clear to sell'. Greg's words: this is becoming a needle in a haystack, and the deck is there to build according to a spec. **GREG AUTHORISED A WRITE UNDER `_standards` FOR THIS ROW, AND ONLY THIS ROW, ON 31 AUGUST.** The standing rule - no cycle writes under `_standards` unless the row names the path - is satisfied by naming it here: `C:\Bidlowprojects\_standards\bidlow-deck.mjs`. **THAT IS THE ONLY FILE UNDER `_standards` THIS ROW MAY TOUCH.** Not `deck-plain.mjs`, not `bidlow-intake.mjs`, not `lib.mjs`, not the checklists, not `deck.cmd`. Take a dated `.bak-` copy of the file before writing it. **BLAST RADIUS, understood and accepted: this changes what EVERY project's deck shows - Kepak, Papaya, the website, papaya-manuals, bidlow-crm and the rest - which is precisely the point. It must therefore be correct for a project that has never been touched, not just for ODoutreach.** **THIS IS A DISPLAY CHANGE AND NOTHING ELSE.** The deck's own header states its one design rule: it is a READER, it holds no state, so it can never disagree with what the gate will actually do. **HONOUR THAT ABSOLUTELY.** Do not add state, do not change how any stage state is computed, do not gate or block anything, do not alter any grade, score, or `.bidlow/` file in any project. `p.outOfOrder` is ALREADY computed in the script - this row surfaces what is there, it does not invent a new measure. **THE WORK:** raise out-of-order work to the top of the deck, beside the existing headline counts, so the first thing visible each morning is how many projects are building ahead of their own stages and which ones. Keep the existing per-project detail exactly as it is. Make the wording plain enough for somebody who has not read the method - 'building ahead of its own questions' beats 'out of order'. **A project that is genuinely in order must show nothing new at all** - a headline that fires on everything is noise and will be ignored within a week. **PROVE IT FIRES, and prove it stays quiet:** a test with a project whose later stages are done while an earlier one is open, asserting the headline appears and names it; and a test with a fully in-order project asserting nothing is added. Both must fail red without the change. If the deck has no existing test harness, say so plainly in the artefact and put the tests where the project's own suite will actually run them - do not add a test file under `_standards`. **DO NOT REGENERATE OR COMMIT ANY OTHER PROJECT'S FILES.** Row 137 handles automatic regeneration separately; if it has already landed, this row must not duplicate it. **THE HARD RULE, verbatim and not negotiable: real email may be sent, and data deleted, ONLY for the `bidlowai` client. Every other client may be built on, tested and measured, but nothing leaves the building for them.** **DEFINITION OF DONE:** the headline shipped in `bidlow-deck.mjs`, both tests passing and proven red without the change, a dated artefact under `docs/ops/` showing the before and after wording and naming every file touched, lint 0, typecheck 0, and THE WORK MERGED TO `main` with the merge commit hash on `origin/main` quoted in your log and confirmed with `git ls-remote origin refs/heads/main`. A pushed branch is not a merge.

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
  `DONE 181`, or back to `TODO` with a note if you could not do it.

## THE STATUS CELL: SIX WORDS, AND ONLY SIX

The status cell of a queue row MUST BEGIN with one of exactly these six:

    TODO    DONE    BLOCKED    PARTIAL    IN PROGRESS    WONTFIX

Markdown bold around it is fine - `| **DONE 181 - ...** |` reads correctly.
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

* Finished it -> `DONE 181 - <what you did, and the proof>`
* Did some of it -> `PARTIAL 181 - <what is done, what is left>`. PARTIAL
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

Cycle 181 is done. Summary:

- **Row 138 closed `DONE 181`**, merged to `main` as `20eee3c4c2435d3b07961cfcdb15f1c8e4ce4190` (PR #491), confirmed via `git ls-remote origin refs/heads/main`.
- This was the 11th consecutive cycle (169, 171–181) to find the deck's out-of-order headline already merged and unchanged — re-verified fresh (test 2/2, lint 0, typecheck 0) rather than rebuilt.
- Root cause remains outside any cycle's reach: the relay watcher is running a stale copy of `relay-watch.ps1` and keeps reopening this row. Only Greg running `relay-start.cmd` (or manually pulling row 138 from the queue) will stop the loop — recorded as a durable memory since it'll keep recurring across sessions until that happens.
- No open PRs at cycle start; no `_standards` files touched beyond confirming the already-authorised `bidlow-deck.mjs` change is intact.

