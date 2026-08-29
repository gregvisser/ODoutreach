# Cycle 108 - queue item 99

## PR sweep at cycle start

`gh pr list --state open` returned zero open PRs — clean, nothing to merge or
comment on.

The current branch (`docs/relay-close-row98-raise-row99`) carried cycle 107's
work UNCOMMITTED: the QUEUE.md edit closing row 98 and raising row 99, plus
`cycle-106.md`/`cycle-107.md` logs, staged but never pushed. Committed and
pushed that first (#398, docs-only, green CI, merged) before starting this
row's own work, so it did not sit around rotting the way the brief's "clear
the green PRs" section warns about.

An untracked `ODOUTREACH-PROJECT-INSTRUCTIONS.md` was also sitting in the
working tree (looks like a Cowork "project instructions" draft from a prior
session). Left it alone — not part of this row's scope, and not something to
silently absorb into a docs commit without knowing its origin.

## The item, verbatim from the queue

> THERE IS NO OPERATOR-FACING SCREEN ANYWHERE IN THE PRODUCT TO SET
> `Client.defaultSenderEmail`, FOR ANY CLIENT - AND THIS JUST COST A REAL
> LAUNCH TWO CYCLES TO DIAGNOSE. (Full text in QUEUE.md row 99 — raised by
> cycle 107 while closing row 98.) SCOPE: UI + one server action + validation.
> No migration needed. No send, no other client's data touched by building
> this.

## The four things, written down before touching anything

1. **Files to change:** `src/app/(app)/clients/mailbox-signature-actions.ts`
   (new action), its test file, `client-mailbox-identities-panel.tsx` (new
   UI), `mailboxes/page.tsx` (prop wiring), a new e2e spec.
2. **Red-first test:** a unit-test suite for the new server action (mirrors
   `setClientSignaturePhoneAction`'s existing test pattern) plus an e2e spec
   driving the real Mailboxes screen — the row explicitly wants proof this
   fires on screen, not just that the action function works.
3. **Done, in one sentence a non-coder can check:** on a client's Mailboxes
   tab, an OpensDoors admin can type an email into a labelled box next to
   Company landline, press Save, see a confirmation, reload the page, and
   still see it there.
4. **Must not touch:** any client's real data (built only against the e2e
   fixture client and unit-test mocks), the schema/migrations, the
   `send-introduction.ts` dispatch logic itself, `_standards`, or any sibling
   project.

## Research first

Ran an Explore agent over the codebase before writing anything (see the
seven-point report in-session) to find: every read site of
`defaultSenderEmail` (confirmed — still zero write sites anywhere in
`src/`), the exact `setClientSignaturePhoneAction` precedent (auth check,
soft-delete guard, inline validation, `revalidatePath`, no zod, audit log
skipped on that one specific action), where the mailboxes page already shows
a *computed* `effectiveFrom` preview (never the raw field), the
"Composition lost send-readiness..." refusal's two exact call sites in
`send-introduction.ts` (lines 1098/1106) and the fact that
`composeSequenceEmail`'s richer `missingFields`/`warnings` are computed but
discarded there, the existing `isValidEmailFormat`/`normalizeEmail` helpers
in `src/lib/normalize.ts` to reuse rather than reinvent, and confirmation
that `Client.defaultSenderEmail` needs no migration (added
2026-04-15,`String?`).

## What it built

**`setClientDefaultSenderEmailAction(clientId, email)`** in
`mailbox-signature-actions.ts` — same shape as `setClientSignaturePhoneAction`:
`requireOpensDoorsStaff` + `requireClientMailboxMutator`, soft-delete guard on
the client row, blank clears the field to `null`, a non-blank value is
validated with `isValidEmailFormat` and refused with "Enter a valid email
address." on failure, otherwise normalised (trim + lowercase) and written.
Unlike the landline action, this one **does** write an `AuditLog` row
(`entityType: "Client"`, `entityId: clientId`, `action: "UPDATE"`) on every
set/clear, since this field gates a real send and deserves a trail the
landline field doesn't need.

**UI**: a labelled input ("Default sender email (reply/unsubscribe
identity)") + "Save default sender email" button, in the same
`canMutate`-gated block as the existing "Company landline" control on the
client Mailboxes tab, with a one-line explanation of what the field is for
and what happens without it.

**Wiring**: `client.defaultSenderEmail` was already selected onto the
`client` object `mailboxes/page.tsx` reads (via `getClientByIdForStaff`'s
`include`) — no new query, just a new prop pass-through.

## Red-first, proven both ways

**Unit tests** — wrote 5 new tests in `mailbox-signature-actions.test.ts`
(save+trim+lowercase, clear, invalid-format refusal, missing-client refusal,
forbidden-mutator refusal) before touching the implementation file, then
`git stash push` on the implementation only and ran the suite: all 5 new
tests failed with `TypeError: setClientDefaultSenderEmailAction is not a
function` (20 pre-existing tests in the same file still passed, confirming
the stash didn't break anything else). `git stash pop`, re-ran: 25/25 green.

**e2e** — wrote `e2e/client-default-sender-email.spec.ts` for the target
end-state (control visible, fillable, save round-trips through a reload;
separately, an invalid value is refused on screen). Stashed the UI + action
+ page-wiring changes, ran `npm run build` (the real webpack production
build CI and Azure use) against that pre-fix code, then
`npx playwright test e2e/client-default-sender-email.spec.ts` against the
e2e Postgres container already running locally on :5434: both tests failed —
one on `getByLabel(/default sender email/i)` never appearing within 5s
("no control exists...confirms the gap"), the other timing out trying to
`.fill()` a field that was never rendered. Popped the stash, rebuilt,
re-ran: both green, including a genuine fill → save → full navigation
reload → value-still-persisted check against the database, not just
component state.

One real bug found running it: the two tests both mutated the *same* e2e
fixture client's `defaultSenderEmail` field, and Playwright's `fullyParallel`
default raced them against each other — the invalid-value test's post-reload
assertion caught the OTHER test's leftover value mid-write. Fixed with
`test.describe.configure({ mode: "serial" })`; noted here so it isn't
mistaken for spec-writing sloppiness later.

## Gates, shown not claimed

`npm run lint` → 0. `npm run typecheck` → 0. `npm test` → 3649/3649 passing
(full suite, not just the touched files). E2E job re-ran the new spec inside
CI's own isolated Postgres and passed there independently of the local run.

## Shipped

Merged via #399 (feature) after #398 (the carried-over row-98/99 docs commit)
merged first. A `_standards` ship gate (`gate-ship.mjs`) blocked the first PR
creation attempt because the new e2e spec file was unfrozen — ran
`freeze-specs.mjs` from `C:\Bidlowprojects\_standards` (read/run only, no
edits made to `_standards` itself) to hash it into `.bidlow/FROZEN.json`,
committed that alongside the spec, and the gate passed. Both PRs' CI was
green (lint/typecheck/tests + the E2E Playwright job) before merging — no
gate was skipped or force-passed.

**Deployed and verified by hash, not by a green workflow alone**:
`deploy-production.yml` run 33275501022 completed successfully; confirmed
`curl https://app-opensdoors-outreach-prod.azurewebsites.net/api/build-info`
(the direct App Service origin, never the CDN-cached custom domain) returns
`commit: 524217b...`, matching `main` HEAD exactly at merge time.

## What this row did NOT do, on purpose

The queue item's "Consider ALSO surfacing a plain-English on-screen
explanation of why a launch is refused" was left undone. The row's own SCOPE
line said "UI + one server action + validation," the suggestion was phrased
as "Consider," and the file it would touch (`send-introduction.ts`) is the
live guarded real-send path for `bidlowai` — changing it beyond what was
explicitly asked felt like scope creep into code this project has good
reason to be conservative about. `composeSequenceEmail`'s `missingFields`
and `warnings` already compute the real reason and sit unused at
`send-introduction.ts:1093-1115` (the two places that currently write the
generic "Composition lost send-readiness..." string) — a clean starting
point if a future row wants to thread them into the on-screen/blocked-reason
text.

No email sent. No client's data touched other than the e2e fixture client
(`E2E Test Workspace`, dedicated to throwaway e2e state, never `bidlowai` or
a real client). No schema change — the column existed already.


---

## The watcher's own record of this cycle

Everything ABOVE this line was written by the cycle itself, and is kept exactly as the cycle left it. Nothing above was edited, shortened or reordered.

This section is written by `relay-watch.ps1` after the cycle's process has
exited. It is the independent half of the record: the cycle above says what it
meant to do, and this says what actually moved on disk, how long it took, and
how the process ended. Where the two disagree, this half is the evidence.
# Cycle 108 - timed-out

KILLED. This cycle was still running after 45 minutes, so it
was stopped, along with every process it had started (6 in
total). The relay did NOT wait for it and has carried on to the next item.

Anything it had already written to disk is still there - a kill does not undo
work - so read the evidence below before assuming this item is untouched.

Watcher script: 6A61D6BA12FC - the file on disk is identical, so this process is running the current code.

Started 2026-08-29 21:45:18, took about 45 minutes.
How it ended: killed at the 45 minute deadline.

Evidence checked: git refs on every branch, the working tree, and these
files named in the brief: prisma/seed.ts, bidlow/relay/QUEUE.md

## What it was asked to do

# Cycle 108 - queue item 99

This brief was written by the relay itself, off the top of QUEUE.md. Greg has
not read it. If it is wrong, say so in your log rather than working around it,
and correct QUEUE.md.

## The item, verbatim from the queue

> **THERE IS NO OPERATOR-FACING SCREEN ANYWHERE IN THE PRODUCT TO SET `Client.defaultSenderEmail`, FOR ANY CLIENT - AND THIS JUST COST A REAL LAUNCH TWO CYCLES TO DIAGNOSE.** Raised by cycle 107 while closing row 98. `defaultSenderEmail` is read in the real send path (`send-introduction.ts`) as the fallback identity for the mailto unsubscribe rail whenever a client has no verified sender-aligned link domain - which is the normal case, not an edge case, since `go.<client-domain>` requires DNS work most clients will never do. When that field is null, `composeSequenceEmail` marks every send not-ready and the operator sees only "Composition lost send-readiness between planning and dispatch; re-plan" - no on-screen explanation, no path to fix it themselves. Searched every reference to the field in `src/app` and `src/server` (confirmed again during row 98): it appears ONLY in `select`/read contexts across the mailboxes page, setup-help page, operations page and send/compose code. It is written only by `prisma/seed.ts` and, until row 98, only ever by hand at provisioning time. **Any client without an aligned link domain will hit this identical wall the first time OpensDoors tries to launch a real sequence for them**, and until now the only remedy was a hand-edit direct to production by Greg (see row 98) - there were 55 live mailboxes across roughly 18 clients as of the last mailbox audit, and there is no reason to believe `bidlowai` was the only one missing this field. **THE WORK:** add a proper operator-facing field for the client's default/reply sender email, almost certainly on the same screen that already surfaces `defaultSenderEmail` read-only today (check the mailboxes page and/or a client settings tab) - validated as a real email address, saved through a real server action with an audit trail, matching the pattern the codebase already uses elsewhere for client-scoped settings (see `setClientSignaturePhoneAction` for a recent precedent: additive nullable field + a "Set X" server action + a form on the relevant tab). Consider ALSO surfacing a plain-English on-screen explanation of why a launch is refused when this field AND the aligned link domain are both missing, since today the refusal message names neither cause to the operator. **RED-FIRST:** a component or e2e test asserting the field is NOT settable anywhere today (should currently fail to find any such control - confirms the gap), then, after the fix, asserting the new control exists and a save round-trips to the database. **SCOPE:** UI + one server action + validation. No migration needed - the column already exists. No send, no other client's data touched by building this.

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
  `DONE 108`, or back to `TODO` with a note if you could not do it.

## THE STATUS CELL: SIX WORDS, AND ONLY SIX

The status cell of a queue row MUST BEGIN with one of exactly these six:

    TODO    DONE    BLOCKED    PARTIAL    IN PROGRESS    WONTFIX

Markdown bold around it is fine - `| **DONE 108 - ...** |` reads correctly.
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

* Finished it -> `DONE 108 - <what you did, and the proof>`
* Did some of it -> `PARTIAL 108 - <what is done, what is left>`. PARTIAL
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


