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
