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
