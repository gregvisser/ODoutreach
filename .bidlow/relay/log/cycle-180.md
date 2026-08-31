# Cycle 180 - row 138 (out-of-order headline on the deck)

## Sweep first

`gh pr list --state open` returned zero PRs. Nothing to merge, nothing to
comment on.

## The row was already done - check main first, again

Per this repo's `CLAUDE.md` guidance ("A row reopened after a relay timeout
may already be merged - check main first"), the first action was reading
`.bidlow/relay/log/cycle-179.md` and `git log --oneline -15` on `main`, not
new code. `main`'s HEAD at cycle start was `87af51e` (cycle 179's own STATE.md
record, PR #489). Row 138's queue text was byte-identical to cycle 169's
original brief - the same item that has now been reopened and re-verified
nine times (170 through 179), all documented in the row's own status-cell
history.

## What this cycle actually did

Independently re-ran every gate row 138's Definition of Done names, rather
than trusting cycles 169-179's reports:

- `npx vitest run standards/bidlow-deck-out-of-order-headline.test.ts` ->
  **2 passed** (fires-and-names-the-project + stays-quiet-when-in-order).
- `npm run lint` -> 0 problems.
- `npm run typecheck` -> 0 problems.
- `C:\Bidlowprojects\_standards\bidlow-deck.mjs` on disk (read in full)
  still carries `export function estateOutOfOrder(live)` (line 264),
  `outOfOrderHeadline(ooo)` (line 278), the `.headline-ooo` CSS block, and is
  wired into `render()` via `const ooo = estateOutOfOrder(live);` and
  `${outOfOrderHeadline(ooo)}` placed above the `.tiles` row.
- The dated backup `bidlow-deck.mjs.bak-2026-08-31` and
  `docs/ops/DECK-OUT-OF-ORDER-HEADLINE-2026-08-31-cycle169.md` are both still
  present, unedited.
- No other file under `_standards` shows signs of being touched by this row
  (checked `deck-plain.mjs`, `bidlow-intake.mjs`, `deck.cmd` - unrelated
  `.bak-*` files present are the pre-existing ones from earlier, unrelated
  work, not new writes).

All green. No code was written and no redo was needed.

## Uncommitted leftover recovered first

The local working tree carried one leftover from cycle 179's own process
exiting after its STATE.md PR (#489) had already merged: an uncommitted
~187-line addendum to `.bidlow/relay/log/cycle-179.md` (the watcher's own
end-of-cycle-179 footer - brief re-paste, timing, exit evidence, and the
same stale-watcher-hash record it has been appending every cycle). Recovered
and committed the same way cycles 174-179 did for their predecessors:
committed it directly on the current branch (`docs/state-cycle-179-row138`,
already tracking `origin/docs/state-cycle-179-row138`) as `aa1a4b4`, ahead of
and separate from this cycle's own row-138 close, then pushed.

## The cause, still unchanged, still not this row's file

`relay-watch.ps1` running a stale in-memory copy of itself is the standing
explanation for why row 138 keeps reopening after being closed on `main`
(row 52's known defect). It is not fixable from inside this row - row 138
names exactly one file it may touch under `_standards` (`bidlow-deck.mjs`),
and `relay-watch.ps1` lives in this repo, not there, and is not named by
this row either. A watcher fix is inert until Greg runs `relay-start.cmd` by
hand; this is recorded in `QUEUE.md` and eight prior cycle logs already and
is not repeated in full here again.

## A finding for a human, not acted on here

Ten cycles now (169-179, then this one makes eleven) have taken row 138. The
first two (169, 170) did real work: shipped the feature and closed the row.
Every one since (171 through 179, and now 180) has spent a full cycle -
gates re-run, a docs-only branch opened, CI waited on, a PR merged - to reach
the identical conclusion: nothing changed, because the row's only remaining
requirement is a watcher restart, which is not something a cycle can do to
itself. This is no longer a one-off cost; it is a standing tax that has now
consumed eleven cycles end to end. Repeating cycle 179's recommendation
because nothing has changed to weaken it: a human should either restart the
watcher (`relay-start.cmd`) or remove row 138 from the live queue. The
restart has been the stated blocker since cycle 166's own row (131) and has
not happened across at least fourteen cycles since.

## What "done" means for this cycle, in one sentence

Row 138's headline is live on `main` (originally `71e9387`, unchanged since),
proven again by rerunning its own tests and gates with no code changed; the
only outstanding item, unchanged since cycle 172, is a watcher restart, which
is Greg's action, not code.

## Scope discipline

Files touched this cycle:
- `.bidlow/relay/log/cycle-179.md` (committed separately, `aa1a4b4` -
  completing cycle 179's own end-of-cycle footer)
- `.bidlow/relay/QUEUE.md` (row 138 -> `DONE 180`)
- `.bidlow/relay/log/cycle-180.md` (this file)

Nothing under `_standards` was written this cycle - `bidlow-deck.mjs`, its
backup, and the test file were read and executed, not edited. No sibling
project folder was touched. No `.bidlow/STATE.md` update queued separately
this time - the prior cycles' pattern of a follow-on STATE.md PR exists to
record session context for the *next* cycle's own re-verification, and since
this cycle's finding is unchanged from cycle 179's, the existing STATE.md
record from cycle 179 (`349a161`) still accurately describes the standing
situation; a fresh PR repeating the identical fact would itself be the kind
of churn this row's finding is warning about.


---

## The watcher's own record of this cycle

Everything ABOVE this line was written by the cycle itself, and is kept exactly as the cycle left it. Nothing above was edited, shortened or reordered.

This section is written by `relay-watch.ps1` after the cycle's process has
exited. It is the independent half of the record: the cycle above says what it
meant to do, and this says what actually moved on disk, how long it took, and
how the process ended. Where the two disagree, this half is the evidence.
# Cycle 180 - finished

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

Started 2026-08-31 10:25:08, took about 12.1 minutes.
How it ended: exit code 0.

Evidence checked: git refs on every branch, the working tree, and these
files named in the brief: Bidlowprojects\_standards\bidlow-deck.mjs, bidlow/relay/QUEUE.md

## What it was asked to do

# Cycle 180 - queue item 138

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
  `DONE 180`, or back to `TODO` with a note if you could not do it.

## THE STATUS CELL: SIX WORDS, AND ONLY SIX

The status cell of a queue row MUST BEGIN with one of exactly these six:

    TODO    DONE    BLOCKED    PARTIAL    IN PROGRESS    WONTFIX

Markdown bold around it is fine - `| **DONE 180 - ...** |` reads correctly.
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

* Finished it -> `DONE 180 - <what you did, and the proof>`
* Did some of it -> `PARTIAL 180 - <what is done, what is left>`. PARTIAL
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

No open PRs remain.

## Cycle 180 summary

**Row 138** ("make out-of-order work the headline on the deck") was investigated per this repo's CLAUDE.md rule (check `main` before writing code for a reopened row). The work was already shipped in cycle 169 and has now been reopened and re-verified **nine times** (cycles 171–179) because the relay watcher is running a stale in-memory copy of `relay-watch.ps1` — a completely separate, already-known defect (row 52) that has nothing to do with row 138's own content.

This cycle:
- Confirmed `C:\Bidlowprojects\_standards\bidlow-deck.mjs` still carries `estateOutOfOrder()`/`outOfOrderHeadline()`, unedited, plus its dated backup and artefact
- Re-ran the gates independently: `standards/bidlow-deck-out-of-order-headline.test.ts` → 2/2 passed, `npm run lint` → 0, `npm run typecheck` → 0
- Recovered cycle 179's own uncommitted leftover watcher footer and committed it separately
- Closed row 138 `DONE 180`, merged as PR #490 → `2fda2d263fe09e0bf66f4dd0c64c7a89b28b8333` on `origin/main` (confirmed via `git ls-remote` after fetch)

**Standing finding, repeated because it's still true:** this loop will keep costing a full cycle every time the watcher picks row 138 back up. It needs a human to either run `relay-start.cmd` to restart the watcher, or pull row 138 out of the live queue — no cycle can fix this from inside the row itself.

