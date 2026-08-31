# Cycle 171 - row 138 (out-of-order headline on the deck)

## Sweep first

`gh pr list --state open` returned nothing. No PRs to clear.

## The row was already done — check main first

Row 138 arrived marked `IN PROGRESS 171` in the local working copy of
`QUEUE.md`. Per this repo's own `CLAUDE.md` guidance ("A row reopened after a
relay timeout may already be merged — check main first"), the first action
was `git log --oneline -10 main`, not new code.

That immediately showed the row was already closed:

```
ae34785 docs(state): record cycle 170 session state for row 138 merge (#478)
5fe6cd3 docs(relay): row 138 - merge out-of-order deck headline, close the row (#477)
3b6300e feat(ops): row 138 - surface out-of-order work as a deck headline (#476)
```

`git ls-remote origin refs/heads/main` returned `ae347852d58ad778dc871f8e18980a9251c341cf`,
matching local `HEAD` exactly — local `main` is not behind. `git show
HEAD:.bidlow/relay/QUEUE.md` for row 138 already read `DONE 170 - ...` with
the merge hash `3b6300eb8c87f7d1a249931a3f4d1cbcd82e9f0e` named and the
verification cycle 170 did. So the `IN PROGRESS 171` text existed only as an
**uncommitted local edit** on top of an already-correct committed file — cause
not established (does not match a 45-minute relay-watch timeout; cycle 170's
own watcher-appended record shows it exited cleanly after 17.1 minutes), but
the shape is the same defect class this repo has already named: a reopened
row whose underlying work was never actually undone.

## What I verified independently, not by trusting the log

Rather than take cycle 170's log at its word, I re-ran the proof myself:

- `C:\Bidlowprojects\_standards\bidlow-deck.mjs` on disk carries
  `estateOutOfOrder` (line 264), `outOfOrderHeadline` (line 278), the
  `.headline-ooo` CSS block (lines 383-391), and it's wired into `render()`
  (`${outOfOrderHeadline(ooo)}` at line 623) — confirmed with `grep`, not
  assumed. This is the only file under `_standards` this row named, and the
  only one that changed there.
- The dated backup `bidlow-deck.mjs.bak-2026-08-31` exists alongside it,
  timestamped before the edit.
- `npx vitest run standards/bidlow-deck-out-of-order-headline.test.ts` — ran
  it myself: **2 passed**. This test imports the real `C:\Bidlowprojects\_standards\bidlow-deck.mjs`
  by its fixed path (skips visibly on CI, which has no `C:\` drive, rather
  than passing silently) and asserts both halves of the brief for real:
  `estateOutOfOrder` fires and names the project when a later stage is done
  ahead of an earlier open one, and returns `null` — adds nothing — when
  every project is in order.
- `npm run lint` on this tree: 0 problems.
- `npm run typecheck` on this tree: 0 problems.
- `docs/ops/DECK-OUT-OF-ORDER-HEADLINE-2026-08-31-cycle169.md` exists (176
  lines) — before/after rendered HTML and the file list.

Everything the brief's Definition of Done asks for is present and provably
working on `main` right now. Redoing it would have been pure waste and, per
this repo's own recorded incident (cycle 125 / row 101, 30 August), the exact
mistake this guidance exists to prevent.

## What this cycle did

- Corrected the local, uncommitted `QUEUE.md` regression: row 138's status
  cell had reverted to `IN PROGRESS 171` on disk while the committed file
  already said `DONE 170`. Replaced it with a `DONE 171` entry that names
  what was independently re-verified this cycle, so the record shows this
  cycle checked rather than skipped the row.
- Restored `.bidlow/relay/log/cycle-170.md`'s watcher-appended footer, which
  was present on disk but never committed (same pattern as cycle 169's log,
  which was committed alongside the row-close PR #477) — otherwise that half
  of the record would have been lost.
- Wrote this log.

## What I did NOT touch

No file under `_standards` — this row's authorised file was already correct
and needed no further edit. No other project's `.bidlow/` files, grades, or
generated deck output. No schema, no migration, no email, no client data. No
new code in `bidlow-deck.mjs` — the existing merged change already satisfies
the brief.

## Hard rule

No email sent, no data deleted, for any client. This cycle read git history,
ran existing tests/lint/typecheck, and corrected a queue-file regression.

Files touched this cycle: `.bidlow/relay/QUEUE.md` (row 138 status),
`.bidlow/relay/log/cycle-170.md` (restored the watcher's footer),
`.bidlow/relay/log/cycle-171.md` (this file).


---

## The watcher's own record of this cycle

Everything ABOVE this line was written by the cycle itself, and is kept exactly as the cycle left it. Nothing above was edited, shortened or reordered.

This section is written by `relay-watch.ps1` after the cycle's process has
exited. It is the independent half of the record: the cycle above says what it
meant to do, and this says what actually moved on disk, how long it took, and
how the process ended. Where the two disagree, this half is the evidence.
# Cycle 171 - finished

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

Started 2026-08-31 08:26:30, took about 20.7 minutes.
How it ended: exit code 0.

Evidence checked: git refs on every branch, the working tree, and these
files named in the brief: Bidlowprojects\_standards\bidlow-deck.mjs, bidlow/relay/QUEUE.md

## What it was asked to do

# Cycle 171 - queue item 138

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
  `DONE 171`, or back to `TODO` with a note if you could not do it.

## THE STATUS CELL: SIX WORDS, AND ONLY SIX

The status cell of a queue row MUST BEGIN with one of exactly these six:

    TODO    DONE    BLOCKED    PARTIAL    IN PROGRESS    WONTFIX

Markdown bold around it is fine - `| **DONE 171 - ...** |` reads correctly.
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

* Finished it -> `DONE 171 - <what you did, and the proof>`
* Did some of it -> `PARTIAL 171 - <what is done, what is left>`. PARTIAL
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

Everything checks out on the merged tree. Row 138 is closed for real.

**Summary:** Row 138's actual work (the out-of-order headline on `bidlow-deck.mjs`) was already merged by cycle 170 (`3b6300e`/`5fe6cd3`/`ae34785`). What arrived this cycle was a reopened `IN PROGRESS 171` status that existed only as an uncommitted local edit — the committed `QUEUE.md` on `origin/main` already said `DONE 170`. Per this repo's "check main first" rule, I verified the merged work independently (deck code present and wired, dated backup present, both real-file tests passing, lint 0, typecheck 0, artefact present) instead of redoing it, then fixed the queue record.

Along the way my own first fix accidentally dropped the closing `|` of the QUEUE.md table row, which `relay/queue-file-integrity.test.ts` correctly caught red in CI — fixed and re-verified before merging.

Final state: `origin/main` at `653da599e103a078e20d55fcac9978869fe4512f`, no open PRs, row 138 now reads `DONE 171` with the full verification trail.

