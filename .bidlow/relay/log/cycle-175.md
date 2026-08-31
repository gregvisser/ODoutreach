# Cycle 175 - row 138 (out-of-order headline on the deck)

## Sweep first

`gh pr list --state open` returned one PR: #483, cycle 174's own
re-verification PR for this same row, with CI still `pending` (`E2E
(Playwright)` and `verify`, both queued/running). Not stale, not abandoned -
just slow. No other open PRs to clear.

## The row was already done - check main first, again

Local `QUEUE.md` arrived with row 138 already flipped to `IN PROGRESS 175`
by the picker, and `.bidlow/relay/log/cycle-174.md` carried an uncommitted
202-line addendum: the watcher's own end-of-cycle footer for cycle 174,
written to disk after cycle 174's process exited but never committed
(cycle 174's PR #483 had already been pushed by then). That footer
independently confirms the same finding cycles 172-174 already made: the
watcher is running relay-watch.ps1 from a loaded copy (`51AF85ED01BF`) that
predates the on-disk script (`E97F4D42A323`), which is the most plausible
reason a row closed on `main` keeps being handed back out.

Per this repo's own `CLAUDE.md` guidance, the first action was `git log
--oneline -20 main`, not new code. `main`'s HEAD was still `76719ab` (cycle
173's close, PR #482) - PR #483 had not yet merged.

## What this cycle actually did

1. Independently re-ran every gate row 138's Definition of Done names,
   rather than trusting cycles 169-174's reports:
   - `npx vitest run standards/bidlow-deck-out-of-order-headline.test.ts`
     -> **2 passed** (fires-and-names-the-project + stays-quiet-when-in-order).
   - `npm run lint` -> 0 problems.
   - `npm run typecheck` -> 0 problems.
   - `C:\Bidlowprojects\_standards\bidlow-deck.mjs` on disk (grepped in
     full) still carries `export function estateOutOfOrder(live)`,
     `outOfOrderHeadline(ooo)`, the `.headline-ooo` CSS block, and is wired
     into `render()` via `const ooo = estateOutOfOrder(live);` and
     `${outOfOrderHeadline(ooo)}` placed above the `.tiles` row.
   - The dated backup `bidlow-deck.mjs.bak-2026-08-31` is present alongside
     four older, unrelated backups from before this row existed.
   - `docs/ops/DECK-OUT-OF-ORDER-HEADLINE-2026-08-31-cycle169.md` is present.
   All green. No code was written and no redo was needed.
2. Watched PR #483's checks (`gh pr checks 483 --watch`) until both went
   green (`E2E (Playwright)` 6m17s pass, `verify` 6m2s pass), then ran
   `gh pr merge 483 --squash --delete-branch`. `gh` reported it was
   "already merged" - cycle 174 had evidently queued an auto-merge before
   it exited, and it fired the moment CI turned green, moments before my
   own merge command ran. Either way the result is the same and verified:
   `git log --oneline -5 main` and `git ls-remote origin refs/heads/main`
   both show **`10bc6ab`** as the current tip.
3. Recovered cycle 174's uncommitted watcher-footer addendum to
   `cycle-174.md` (stashed before the merge to avoid a checkout conflict,
   popped back onto a fresh branch off the new `main`) and committed it in
   this cycle, matching the precedent cycle 174 itself set for cycle 173's
   leftover footer.
4. Closed row 139 as `WONTFIX 175`. It was not a real item: the relay's
   carry-forward detector split cycle 174's log **mid-sentence** and
   quoted only the fragment "code. If row 138 reopens again after this
   cycle, the next cycle should", which reads as an incomplete instruction
   because it is one. The full sentence in `cycle-174.md` is "...that the
   fix is a restart, not code. If row 138 reopens again after this cycle,
   the next cycle should treat that itself as confirmation the watcher has
   not been restarted, and keep the re-verification to the minimum needed
   to requote the same unchanged commit hash, rather than re-deriving the
   finding from scratch." That instruction is exactly what this cycle did.
   This is the same defect class the relay's own supervisor already closed
   once before, on row 124 (the "not mine to force" fragment) - recorded
   rather than silently dropped, per row 139's own instruction to do one or
   the other.
5. Closed row 138 as `DONE 175`, naming the merge commit and repeating -
   briefly, per cycle 174's own recommendation - the unchanged watcher
   finding rather than re-deriving it from scratch.

## The cause, still unchanged, still not this row's file

`relay-watch.ps1` running a stale in-memory copy of itself is the standing
explanation for why row 138 keeps reopening after being closed on `main`.
It is not fixable from inside this row - row 138 names exactly one file it
may touch under `_standards` (`bidlow-deck.mjs`), and `relay-watch.ps1`
lives in this repo, not there, and is not named by this row either. A
watcher fix is inert until Greg runs `relay-start.cmd` by hand; this is
recorded in `QUEUE.md` and `STATE.md` already and is not repeated in full
here again.

## What "done" means for this cycle, in one sentence

Row 138's headline is live on `main` (`10bc6ab`, confirmed equal to
`origin/main`), proven again by rerunning its own tests and gates; row 139
was a garbled fragment of a finding already acted on, closed `WONTFIX`; the
only outstanding item, unchanged since cycle 172, is a watcher restart,
which is Greg's action, not code.

## Files touched this cycle

- `.bidlow/relay/QUEUE.md` (row 138 -> `DONE 175`; row 139 -> `WONTFIX 175`)
- `.bidlow/relay/log/cycle-174.md` (committing the watcher's own
  end-of-cycle-174 footer, which was appended to the local working copy
  after cycle 174's own commit and had not yet been committed)
- `.bidlow/relay/log/cycle-175.md` (this file)

No other file was changed. `bidlow-deck.mjs`, its backup, and the test file
were read and executed, not edited.


---

## The watcher's own record of this cycle

Everything ABOVE this line was written by the cycle itself, and is kept exactly as the cycle left it. Nothing above was edited, shortened or reordered.

This section is written by `relay-watch.ps1` after the cycle's process has
exited. It is the independent half of the record: the cycle above says what it
meant to do, and this says what actually moved on disk, how long it took, and
how the process ended. Where the two disagree, this half is the evidence.
# Cycle 175 - finished

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

Started 2026-08-31 09:24:41, took about 11.3 minutes.
How it ended: exit code 0.

Evidence checked: git refs on every branch, the working tree, and these
files named in the brief: Bidlowprojects\_standards\bidlow-deck.mjs, bidlow/relay/QUEUE.md

## What it was asked to do

# Cycle 175 - queue item 138

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
  `DONE 175`, or back to `TODO` with a note if you could not do it.

## THE STATUS CELL: SIX WORDS, AND ONLY SIX

The status cell of a queue row MUST BEGIN with one of exactly these six:

    TODO    DONE    BLOCKED    PARTIAL    IN PROGRESS    WONTFIX

Markdown bold around it is fine - `| **DONE 175 - ...** |` reads correctly.
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

* Finished it -> `DONE 175 - <what you did, and the proof>`
* Did some of it -> `PARTIAL 175 - <what is done, what is left>`. PARTIAL
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

PR #484 is up with CI running; I'll merge it once checks go green (background monitor + scheduled fallback in place). Quick status: row 138's actual code work has been solid since cycle 169 — this cycle re-verified independently (tests 2/2, lint 0, typecheck 0), merged the pending PR #483 as `10bc6ab`, and closed the garbled row 139 (a fragment-capture artifact, same class as the earlier row 124 issue) as `WONTFIX`. Now finalizing with PR #484 for cycle 175's own closing commit.



### The relay carried an unqueued finding into QUEUE.md

This cycle's own words say it was handing something on, and it added no new
row to QUEUE.md before it exited. Nothing downstream reads old cycle logs -
the one channel every cycle reads is QUEUE.md - so the relay copied the
sentences below into that file as row #140, status TODO.

Not one word of the quoted text is the relay's, and it interpreted none of
it. If the row turns out not to be worth doing, close it WONTFIX; that costs
one reading, and a finding stranded in a log costs a whole cycle every time
somebody has to re-derive it.

What was carried:

* cycle, the next cycle should", which reads as an incomplete instruction
* the next cycle should treat that itself as confirmation the watcher has
