# Cycle 220 - finished

Work happened. Evidence: a git ref moved, so something was committed; the working tree changed, so files were edited.

Watcher script: 3ABAA45FD1AB - the file on disk is identical, so this process is running the current code.

Started 2026-09-01 06:23:11, took about 60 minutes.
How it ended: exit code 0.

Evidence checked: git refs on every branch, the working tree, and these
files named in the brief: docs/ops/ROW136-SCREEN-WALK-PART2-2026-08-31-cycle197.md, operations/outbound/form-actions.ts, src/components/ops/admin-queue-drain-panel.tsx, bidlow/relay/QUEUE.md

## What it was asked to do

# Cycle 220 - queue item 157

This brief was written by the relay itself, off the top of QUEUE.md. Greg has
not read it. If it is wrong, say so in your log rather than working around it,
and correct QUEUE.md.

## The item, verbatim from the queue

> **RAISED BY ROW 136 (cycle 197), FINDING 4 - OPERATIONS' THREE MUTATION BUTTONS GIVE ZERO FEEDBACK ON SUCCESS OR FAILURE, AND ON FAILURE THE PAGE DOESN'T EVEN RE-RENDER - A PREVIOUSLY-FLAGGED GAP, CONFIRMED STILL PRESENT.** Read `docs/ops/ROW136-SCREEN-WALK-PART2-2026-08-31-cycle197.md` finding 4 for the full evidence before starting. `form-actions.ts` wrappers (`requeueFailedFormAction`, `releaseStaleFormAction`, `src/app/(app)/operations/outbound/form-actions.ts:9-24`) discard the `{ok,error}`/`{released}` results their underlying actions return (`actions.ts:65-99`), and `revalidatePath` only runs on the success branch, so a refused mutation leaves the page showing stale data with no error at all. None of the three buttons (Release stale locks, Requeue, Mark VERIFIED_READY) has a pending/disabled state, unlike the equivalent `AdminQueueDrainPanel` (`src/components/ops/admin-queue-drain-panel.tsx:45-104`) used elsewhere in this app, which does show a real result summary. Not destructive - the underlying mutations are idempotent - but an owner cannot tell "it silently refused" from "it's still working," and even a successful stale-release never reports how many rows it released. **THE WORK:** wire pending state and a real result/error message onto all three operations/outbound buttons, matching the `AdminQueueDrainPanel` pattern (or reuse it directly). **PROVE IT FIRES:** a test that forces the requeue action's failure branch and asserts an error message renders; a test asserting a successful release shows the actual released count. Both must fail red without the change. **DO NOT SCORE ANYTHING.** **THE HARD RULE, verbatim and not negotiable: real email may be sent, and data deleted, ONLY for the `bidlowai` client. Every other client may be built on, tested and measured, but nothing leaves the building for them.** **DEFINITION OF DONE:** all three buttons fixed, both tests passing and proven red without the change, lint 0, typecheck 0, a dated artefact under `docs/ops/`, and THE WORK MERGED TO `main` with the merge commit hash on `origin/main` quoted in your log and confirmed with `git ls-remote origin refs/heads/main`.

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
  `DONE 220`, or back to `TODO` with a note if you could not do it.

## THE STATUS CELL: SIX WORDS, AND ONLY SIX

The status cell of a queue row MUST BEGIN with one of exactly these six:

    TODO    DONE    BLOCKED    PARTIAL    IN PROGRESS    WONTFIX

Markdown bold around it is fine - `| **DONE 220 - ...** |` reads correctly.
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

* Finished it -> `DONE 220 - <what you did, and the proof>`
* Did some of it -> `PARTIAL 220 - <what is done, what is left>`. PARTIAL
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

Both PRs merged and confirmed live on `origin/main` (final commit `4c6f774`, row-157 code merge `07c720f28f179a8713ee759ceee7b7b7aa885292`).

**Summary of cycle 220 (row 157):**

- Fixed the three silent operations/outbound mutation buttons (Release stale locks, Requeue, Mark VERIFIED_READY) — they now show a real pending state and render each action's actual result or error, instead of the old `form-actions.ts` wrappers that discarded `{ok,error}`/`{released}` results.
- New files: `src/components/ops/operator-action-messages.ts` (pure result→banner logic) and `src/components/ops/operator-mutation-buttons.tsx` (client components, matching the existing `AdminQueueDrainPanel` pattern). Deleted the now-unused `form-actions.ts`.
- Proof: `operator-action-messages.test.ts` and `operator-mutation-buttons-wiring.test.ts` are the load-bearing red-first tests — verified red by stashing the implementation before restoring it; `actions.test.ts` pins the server-side failure/success branches.
- Gates: lint 0, typecheck 0, full suite 3962/3965 passed (the 3 failures were pre-existing/unrelated — a relay untracked-log gate, resolved by committing `cycle-219.md`, and two Sentry tests that only time out under full-suite parallel load).
- Merged as PR #552 (code) and #553 (QUEUE.md hash record), both CI-green, both confirmed live via `git ls-remote`.
- Artefact: `docs/ops/ROW157-OPS-MUTATION-FEEDBACK-2026-09-01-cycle220.md`.

No open questions.



## Cross-project deck

regenerated C:\Bidlowprojects\bidlow-deck.html
