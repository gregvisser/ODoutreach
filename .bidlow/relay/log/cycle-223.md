# Cycle 223 - queue item 144

## Sweep first

`gh pr list --state open` returned `[]` - nothing open, nothing to merge.

## The item

Row 144 is a stranded fragment: cycle 188's log handed the relay a sentence
about what a future cycle should do IF row 138 or row 143 reopened again
before the watcher was restarted, the relay copied it into `QUEUE.md` as its
own row with no interpretation, and the row itself asks for exactly one of
two outcomes: turn it into real work, or close it WONTFIX.

This is the same defect class already closed WONTFIX for rows 124, 139, 140,
141 and 142: the carry-forward detector splits a recurring sentence about row
138/143's reopening mid-quote and stamps the fragment as its own row. Row
144's fragment is one more piece of that same sentence
(`.bidlow/relay/log/cycle-188.md` lines 101-107, quoted in full in the queue
cell below).

## What "done" looks like

The row says plainly what it wants: say "known cause, not new," and stop.
Before writing that, I checked whether it was still true rather than assuming
it:

1. **The watcher restart cycle 188 was waiting on has happened.** Every cycle
   log from 203 through 222 opens with `Watcher script: <hash> - the file on
   disk is identical`, so the live process has been running current code
   since at least cycle 203. Cycle 188's own condition ("before a restart
   happens") no longer holds.
2. **Rows 138 and 143 have stayed `DONE 184` unbroken since cycle 190** -
   over thirty cycles now, well past the "at least one subsequent cycle" bar
   cycle 188 itself set.
3. **The wider class this sentence warned about did recur twice** - the same
   stale-watcher-in-memory bug reopened row 134 (caught in cycle 193) and row
   137 (caught in cycle 201) before the restart landed - and both times the
   handling cycle correctly re-verified rather than redid the work, which is
   exactly the discipline this fragment was asking for, applied without ever
   needing to cite it.

There is nothing left to turn into a real item. The advice was followed every
time it applied, and the condition it was written for is now closed. Closed
`WONTFIX 223` in `.bidlow/relay/QUEUE.md`, quoting all three checks above in
the cell itself so nobody has to re-derive them.

## Files changed

- `.bidlow/relay/QUEUE.md` (row 144 status cell, and row 144/145 swapped in
  file order - see below)
- `.bidlow/relay/log/cycle-223.md` (this file)

No application source was in scope and none was touched.

## What must NOT be touched

Anything under `_standards` (not named by this row), any other client's
data, any real email send, `.bidlow/GRADES.json` or any dimension score.

## Red-first test

None new - this is a status-cell close, not new behaviour. The existing
`relay/queue-file-integrity.test.ts` caught a real ordering defect my first
edit introduced (below), which is the closest thing this row has to a
red-first proof: the test went red, I fixed the cause, it went green again.

## An ordering defect the edit itself introduced, caught by the existing gate

Setting row 144 straight to `WONTFIX 223` without moving it made it the
first halting (BLOCKED/WONTFIX) row in file order, with row 145 (`TODO`)
sitting immediately after it - `queue-file-integrity.test.ts`'s "keeps
BLOCKED and WONTFIX rows below every row still to be done" check failed
correctly: `#145 (line 380) is TODO but sits below #144, which is WONTFIX and
stops the picker`. Swapped rows 144 and 145 in file order (145 now above 144)
so the still-open row is not stranded behind a closed one. Re-ran the test
after the swap: all 9 cases pass.

## Gates (fresh run, this cycle)

- `npx vitest run relay/queue-file-integrity.test.ts`: **9/9 PASS** (1 red
  ordering failure caught and fixed mid-cycle, described above).
- `relay-selftest.ps1`: **SELF-TEST PASSED - 127 checks** (above the 74
  floor; check count has only grown since cycle 188).
- No application source touched - full `npm run lint` / `npm run typecheck`
  / `npm test` not re-run for that reason, matching cycles 185-188/193/201's
  own precedent for docs-only changes.
- No send, no client data, no schema, no migration, nothing scored.

## Rows 138 and 143: re-checked, unchanged

Both still read `DONE 184` in `origin/main`'s copy of `QUEUE.md`, byte-
identical to every cycle since 190. No reopen to report.


---

## The watcher's own record of this cycle

Everything ABOVE this line was written by the cycle itself, and is kept exactly as the cycle left it. Nothing above was edited, shortened or reordered.

This section is written by `relay-watch.ps1` after the cycle's process has
exited. It is the independent half of the record: the cycle above says what it
meant to do, and this says what actually moved on disk, how long it took, and
how the process ended. Where the two disagree, this half is the evidence.
# Cycle 223 - finished

Work happened. Evidence: a git ref moved, so something was committed; the working tree changed, so files were edited.

Watcher script: 3ABAA45FD1AB - the file on disk is identical, so this process is running the current code.

Started 2026-09-01 09:55:19, took about 26.2 minutes.
How it ended: exit code 0.

Evidence checked: git refs on every branch, the working tree, and these
files named in the brief: bidlow/relay/log/cycle-188.md, bidlow/relay/QUEUE.md

## What it was asked to do

# Cycle 223 - queue item 144

This brief was written by the relay itself, off the top of QUEUE.md. Greg has
not read it. If it is wrong, say so in your log rather than working around it,
and correct QUEUE.md.

## The item, verbatim from the queue

> **CARRIED HERE BY THE RELAY - cycle 188 handed this up in its log and queued no row for it.** Every word after the arrow is the cycle's own and the relay interpreted none of it. The context is in `.bidlow/relay/log/cycle-188.md`. Either turn this into a real item or close it WONTFIX - it costs one reading either way, which is what a finding stranded in a log costs every cycle that has to re-derive it. >>> next cycle should say exactly that - "known cause, not new" - and stop,

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
  `DONE 223`, or back to `TODO` with a note if you could not do it.

## THE STATUS CELL: SIX WORDS, AND ONLY SIX

The status cell of a queue row MUST BEGIN with one of exactly these six:

    TODO    DONE    BLOCKED    PARTIAL    IN PROGRESS    WONTFIX

Markdown bold around it is fine - `| **DONE 223 - ...** |` reads correctly.
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

* Finished it -> `DONE 223 - <what you did, and the proof>`
* Did some of it -> `PARTIAL 223 - <what is done, what is left>`. PARTIAL
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

`.bidlow/STATE.md` is now updated and merged (PR #561, `106852a`). Session continuity is recorded: row 144 closed WONTFIX, the queue-ordering fix it required, gates run, merge hashes, and a fresh "pick up first" list pointing the next session at row 145. `main` is at `106852a`, no PRs left open.



## Cross-project deck

regenerated C:\Bidlowprojects\bidlow-deck.html
