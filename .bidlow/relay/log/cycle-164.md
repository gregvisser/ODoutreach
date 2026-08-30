# Cycle 164 - row 130

## Files changed

`src/lib/email-templates/template-policy.ts` (new pure functions
`isTemplateStatusUsableInSequence`, `describeTemplateDeleteEligibility`),
`src/lib/email-sequences/sequence-policy.ts` (refactor only — reuses the
new shared function instead of three inline `=== "ARCHIVED"` checks),
`src/server/email-templates/queries.ts` (`includeArchived` option,
`archivedCount`, per-template `canDelete`/`deleteBlockedReason`),
`src/server/email-templates/mutations.ts` (new `deleteEmailTemplate`),
`src/app/(app)/clients/[clientId]/outreach/template-actions.ts` (new
`deleteClientEmailTemplateAction`),
`src/app/(app)/clients/[clientId]/templates/page.tsx` (reads
`?showArchived=1`), `src/components/clients/email-templates/client-email-templates-panel.tsx`
(hide-archived toggle, Usable/Not-usable pills, Delete button + refusal
reason), new `src/components/clients/email-templates/template-delete-confirm-form.tsx`,
`e2e/screen-walk.spec.ts` (one new screen state). Plus new test files
`mutations.test.ts`, `queries.test.ts`, and additions to
`template-policy.test.ts`. Docs artefact:
`docs/ops/2026-08-30-row130-templates-hide-archive-delete-usable.md`.

## The red-first test

Three test files drive the real exported functions against a mocked Prisma
client (`vi.mock("@/lib/db", ...)`, same pattern as
`sequence-actions.test.ts`): `mutations.test.ts` (delete a never-used
template; refuse one used in a sequence step or with send history, with a
readable reason; cross-tenant and not-found refusal), `queries.test.ts`
(archived rows absent from the default list; present when
`includeArchived: true`; `canDelete`/`deleteBlockedReason` computed
correctly), and additions to `template-policy.test.ts` for the two new pure
functions.

Watched RED: `git stash push` on the four implementation files
(`template-policy.ts`, `sequence-policy.ts`, `mutations.ts`, `queries.ts`),
keeping the test files in place, reran — 14 failures (functions didn't
exist / archived rows not filtered / `canDelete` undefined). `git stash
pop` restored the implementation; reran green. Full transcript in the docs
artefact.

## What "done" looks like

An operator opens the Templates screen and sees only the templates they can
actually still touch — no archived clutter, an explicit Usable/Not-usable
tag on every row, and a real "Delete permanently" button on any archived
template that was never used, with a plain sentence explaining why the
button is missing on ones that were.

## What must NOT be touched

`canApproveSequence`'s external behaviour (verified — refactor only, 22
existing tests pass unmodified), any existing client's real templates
(nothing archived/deleted against real data — all delete/query behaviour
proven against a mocked Prisma client), `.bidlow/GRADES.json`, any
dimension score, `docs/ops/TUESDAY-READINESS-MEASUREMENT-2026-08-30.md`. No
email sent.

## What it did

**FIRST, the PR sweep.** `gh pr list --state open` showed exactly one open
PR: #463 (row 122's own follow-up, recording its merge hash into
`QUEUE.md`/the cycle log). Its `verify` check was already green; `E2E` was
still running. While waiting, found the working tree carrying uncommitted
leftovers from cycle 163 — the watcher's own post-cycle record appended to
`cycle-163.md`, and row 130 added to `QUEUE.md` as `IN PROGRESS 164` —
neither committed. Committed those (`8d49b6d`) and pushed onto the #463
branch (same pattern cycle 163 used for cycle 162's log), then waited for
CI. Both checks went green; merged #463 (`e7a5d9f`).

**THEN row 130 itself**, on a fresh branch off the updated `origin/main`
(`feat/row130-templates-hide-delete-usable`).

Read the schema before writing anything, per the brief's explicit
instruction. `ClientEmailSequenceStep.template` and
`ClientEmailSequenceStepSend.template` both declare `onDelete: Restrict` —
the database itself already refuses to delete a `ClientEmailTemplate` row
either references. That is the delete boundary, not a policy invented on
top of it: `describeTemplateDeleteEligibility` reads the two `_count`
values off exactly those relation names, and both the query layer (whether
to show the Delete button) and the mutation layer (the actual refusal) call
the same function, so they can never disagree. Full reasoning, including
the deliberate UI choice to only surface Delete on the archived view (a
safety checkpoint, not a boundary requirement), is in the dated artefact.

Built the three parts as one connected change rather than three separate
patches, since all three touch the same query/panel surface: `includeArchived`
on `loadClientEmailTemplatesOverview` (default `false`, `counts`/`archivedCount`
always report the full set), the hide/show toggle + count line on the
Templates screen, the Delete button + inline refusal reason on archived
rows, and an explicit Usable/Not-usable pill on every status tile and every
row. The pill is driven by a new `isTemplateStatusUsableInSequence`
function that duplicates nothing — `sequence-policy.ts`'s three separate
`status === "ARCHIVED"` checks were refactored to call it instead, so the
screen's badge can never drift from what `canApproveSequence` actually
enforces. Confirmed this is a pure refactor: all 22 pre-existing
`sequence-policy.test.ts` cases pass unmodified.

**Found and fixed one incidental defect while proving the e2e screen
renders**: `e2e/screen-walk.spec.ts`'s `walk()` computed `finalUrl` as
`new URL(page.url()).pathname` — pathname only, silently dropping any query
string even when there was no redirect at all. Invisible until now because
no `SCREENS` entry had ever carried a query string; the new
`client-templates-archived` (`?showArchived=1`) entry was the first, and it
failed CI with a false "redirected away from the requested screen" — the
page never redirected, the test's own bookkeeping just discarded the
`?showArchived=1` it was supposed to compare against. Fixed to keep
`pathname + search`. Both `e2e/screen-walk.spec.ts` changes (the new screen
entry, then this fix) are recorded in `.bidlow/FROZEN.json` via
`freeze-specs.mjs --amend`, attributed to this cycle — the frozen-specs gate
blocked the first `gh pr create` attempt until that was done.

## Gates

- `npm run lint` - 0
- `npm run typecheck` - 0
- `npm test` - 362 files / 3772 tests passed
- `npm run build -- --webpack` - succeeded, `/clients/[clientId]/templates` compiled
- CI (`verify` + `E2E`) - green on the second push (after the `finalUrl` fix); red on the first push, correctly, for the reason above

## Merge

PR #463 (row 122's own merge-hash follow-up, plus this cycle's carried-forward
leftovers): squashed to `e7a5d9f` on `origin/main`.

PR #464 (row 130 itself): squashed to `88164bc` on `origin/main`, confirmed
with `git ls-remote origin refs/heads/main`:

    88164bcc2baea9be9175f614b27f3f6af63b4b81	refs/heads/main

## Scope discipline

Did not touch `.bidlow/GRADES.json`, any dimension score, or
`docs/ops/TUESDAY-READINESS-MEASUREMENT-2026-08-30.md`. Did not change what
`canApproveSequence` permits — only removed internal duplication of a check
it already made. Did not archive or delete any real client's template. Did
not touch `C:\Bidlowprojects\_standards` beyond the one sanctioned use of
its `freeze-specs.mjs` script to record the two `e2e/screen-walk.spec.ts`
amendments this row's own work required — no rule content was edited, only
this repo's `.bidlow/FROZEN.json` ledger. Left `ODOUTREACH-PROJECT-INSTRUCTIONS.md`
(an untracked, out-of-place file already flagged by cycle 163 per the
repository-boundary rule) untouched again — still not this row's to act on.


---

## The watcher's own record of this cycle

Everything ABOVE this line was written by the cycle itself, and is kept exactly as the cycle left it. Nothing above was edited, shortened or reordered.

This section is written by `relay-watch.ps1` after the cycle's process has
exited. It is the independent half of the record: the cycle above says what it
meant to do, and this says what actually moved on disk, how long it took, and
how the process ended. Where the two disagree, this half is the evidence.
# Cycle 164 - timed-out

KILLED. This cycle was still running after 45 minutes, so it
was stopped, along with every process it had started (8 in
total). The relay did NOT wait for it and has carried on to the next item.

Anything it had already written to disk is still there - a kill does not undo
work - so read the evidence below before assuming this item is untouched.

**RESTART REQUIRED - this watcher is running a STALE copy of its own script.**

  Loaded at launch: B9E192203DEB
  On disk now:      51AF85ED01BF

PowerShell reads a script once, at launch, and then runs from memory. Every
change merged to relay-watch.ps1 since this process started is INERT - merging
it again will not help. Stop this watcher and run relay-start.cmd, which clears
HALT and reads the cycle number back out of STATUS.json.

This is queue row 52's defect. It cost about ten cycles precisely because
nothing said this out loud.

Started 2026-08-30 22:03:10, took about 45 minutes.
How it ended: killed at the 45 minute deadline.

Evidence checked: git refs on every branch, the working tree, and these
files named in the brief: src/components/clients/email-templates/client-email-templates-panel.tsx, e2e/screen-walk.spec.ts, bidlow/GRADES.json, docs/ops/TUESDAY-READINESS-MEASUREMENT-2026-08-30.md, bidlow/relay/QUEUE.md

## What it was asked to do

# Cycle 164 - queue item 130

This brief was written by the relay itself, off the top of QUEUE.md. Greg has
not read it. If it is wrong, say so in your log rather than working around it,
and correct QUEUE.md.

## The item, verbatim from the queue

> **THE TEMPLATES SCREEN HAS NO WAY TO REMOVE A TEMPLATE AND NO STRUCTURE TELLING AN OPERATOR WHAT THEY CAN ACTUALLY USE. GREG HIT THIS HIMSELF ON 30 AUGUST.** His words: there is no way to delete a template, the screen looks confusing and messy, and he does not know what he is looking at or what to use as a sequence. He already accepts that a template in a running sequence must not be deletable - that is not the complaint. **MEASURED, NOT ASSUMED (supervisor read the code):** `archiveClientEmailTemplateAction` exists and an Archive button IS rendered per template in `src/components/clients/email-templates/client-email-templates-panel.tsx` (around lines 337-342). **But archiving does not remove the template from the screen.** Its hint reads 'Kept for history - not usable', and `counts.byStatus.ARCHIVED` is displayed alongside the others, so archived rows keep accumulating in the same list forever. There is no delete anywhere. Four statuses are shown - APPROVED/Saved, READY_FOR_REVIEW, DRAFT, ARCHIVED - and nothing states plainly which of them can go into a sequence. Per `canApproveSequence` in `sequence-policy.ts`, ONLY `ARCHIVED` is excluded, so Saved, Ready-for-review and Draft can all be picked - which is not what the four labels suggest to a reader. Row 111 finding 5 already improved one hint here; the structural problem underneath was not addressed. **THE WORK, THREE PARTS.** (1) **Hide archived by default.** Archived is history; it should not sit in the working list. Put it behind a toggle or a separate view that states how many are hidden. (2) **Add a real delete for templates that are safe to delete, and prove which those are FIRST.** Read the schema and the relations before writing anything: a template that has never been used in any sequence, and has no send history behind it, can be genuinely removed; one that has been used must not be, because deleting it would break the record of what was actually sent. **Establish that boundary from the data model, do not guess it**, and state it in the artefact. Where delete is refused, the screen must say WHY in a sentence an operator understands - not a disabled button with no explanation. (3) **Make the screen answer 'what can I use' at a glance.** The statuses that can go into a sequence must be visibly distinct from the one that cannot. An operator who has never seen this screen should be able to tell in about two seconds which templates are usable. **DO NOT** change what `canApproveSequence` permits - this row fixes presentation and removal, not sequence policy. **DO NOT** delete or archive any existing template as part of testing against real client data. **PROVE IT FIRES:** a test that a never-used template can be deleted, a test that a used one is refused with a readable reason, and a test that archived rows are absent from the default list. Each must fail red without the change. Extend `e2e/screen-walk.spec.ts` coverage of this screen if that is the natural home. **DO NOT SCORE ANYTHING:** no `.bidlow/GRADES.json`, no dimension, no sell gate, and do not edit `docs/ops/TUESDAY-READINESS-MEASUREMENT-2026-08-30.md`. **NO SEND.** **THE HARD RULE, verbatim and not negotiable: real email may be sent, and data deleted, ONLY for the `bidlowai` client. Every other client may be built on, tested and measured, but nothing leaves the building for them.** **DEFINITION OF DONE:** the three parts shipped, the delete boundary stated plainly in a dated artefact under `docs/ops/`, all tests passing and proven red without the change, lint 0, typecheck 0, full suite green, and THE WORK MERGED TO `main` with the merge commit hash on `origin/main` quoted in your log and confirmed with `git ls-remote origin refs/heads/main`. A pushed branch is not a merge.

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
  `DONE 164`, or back to `TODO` with a note if you could not do it.

## THE STATUS CELL: SIX WORDS, AND ONLY SIX

The status cell of a queue row MUST BEGIN with one of exactly these six:

    TODO    DONE    BLOCKED    PARTIAL    IN PROGRESS    WONTFIX

Markdown bold around it is fine - `| **DONE 164 - ...** |` reads correctly.
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

* Finished it -> `DONE 164 - <what you did, and the proof>`
* Did some of it -> `PARTIAL 164 - <what is done, what is left>`. PARTIAL
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


