# Row 130 — Templates screen: hide archived, real delete, "what can I use" at a glance

**Date:** 2026-08-30 · **Cycle:** 164 · **Status:** shipped

## The complaint, verbatim

Greg hit this himself on 30 August: there is no way to delete a template, the
screen looks confusing and messy, and he does not know what he is looking at
or what to use as a sequence. He already accepted that a template in a
running sequence must not be deletable — that was never the complaint.

## The delete boundary, read from the data model (not guessed)

`prisma/schema.prisma` declares two relations from `ClientEmailTemplate` that
both carry `onDelete: Restrict`:

```prisma
model ClientEmailSequenceStep {
  template  ClientEmailTemplate @relation(fields: [templateId], references: [id], onDelete: Restrict)
}

model ClientEmailSequenceStepSend {
  template  ClientEmailTemplate @relation(fields: [templateId], references: [id], onDelete: Restrict)
}
```

That is the database itself refusing to delete a `ClientEmailTemplate` row
that either still references — this is not a policy choice layered on top,
it is what the schema already enforces at the storage layer. The rule this
row ships mirrors that constraint exactly, so the application-level refusal
can never disagree with what a raw delete would actually do:

> **A template may be permanently deleted only if it has zero
> `ClientEmailSequenceStep` rows and zero `ClientEmailSequenceStepSend` rows
> referencing it** — i.e. it has never been placed in a sequence step, and no
> real email was ever sent from it. Any other template — including one sitting
> in a draft, never-launched sequence, since a step exists the moment a
> template is *picked*, not when the sequence is *launched* — can only be
> archived. Archiving remains fully reversible ("Restore as draft"); deleting
   is not.

This is implemented once, in `describeTemplateDeleteEligibility`
(`src/lib/email-templates/template-policy.ts`), a pure function with no
Prisma import, driven by the two `_count` values read straight off the
schema's own relation names. Both the query layer (to decide whether to show
a Delete button) and the mutation layer (to refuse the actual delete) call
this same function — the UI can never show "Delete" on a template the
mutation will then refuse, and the mutation can never refuse a template the
schema itself would allow.

**Deliberately not part of this boundary:** current template *status*
(DRAFT/READY_FOR_REVIEW/APPROVED/ARCHIVED). Delete is gated purely by usage,
not by status — a template can be deleted from any status if it was never
used, though the UI only surfaces the Delete button on ARCHIVED rows (see
"UI decisions" below) as a deliberate two-step safety net, not because
non-archived templates are exempt from the boundary.

## The three parts shipped

1. **Archived hidden by default.** `loadClientEmailTemplatesOverview` now
   takes `{ includeArchived?: boolean }`; the default (`false`) filters
   ARCHIVED rows out of the `templates` array returned to the page, while
   `counts` and the new `archivedCount` field still reflect the FULL set so
   the screen can say how many are hidden. The Templates screen
   (`/clients/[clientId]/templates`) reads `?showArchived=1` and shows a
   "N archived templates hidden — Show archived" / "Showing archived
   templates too — Hide archived" toggle line above the template list.

2. **Real delete, gated by the boundary above.** New mutation
   `deleteEmailTemplate` (`src/server/email-templates/mutations.ts`) and
   server action `deleteClientEmailTemplateAction`
   (`src/app/(app)/clients/[clientId]/outreach/template-actions.ts`). The UI
   only renders the "Delete permanently" button on ARCHIVED rows when
   `template.canDelete` is true (computed server-side via Prisma `_count` on
   `sequenceSteps`/`sequenceStepSends`); a client-side confirm
   (`TemplateDeleteConfirmForm`) is the last-chance safety prompt, not the
   eligibility check. When a template cannot be deleted, the row shows the
   plain-English reason (`template.deleteBlockedReason`, e.g. "This template
   is used in 2 sequence steps — deleting it would break those sequences, so
   it can only be archived.") instead of a disabled button with no
   explanation.

3. **Usable-vs-not at a glance.** New pure function
   `isTemplateStatusUsableInSequence` (`template-policy.ts`) is the single
   source of truth for "can this status be picked into a sequence" — it
   returns `status !== "ARCHIVED"`, identical to what `canApproveSequence`
   (`sequence-policy.ts`) already enforced via three separate inline
   `status === "ARCHIVED"` checks. Those three checks were refactored to call
   the shared function instead of duplicating the literal — **this changes
   no external behaviour** (`sequence-policy.test.ts`'s 22 existing tests
   pass unmodified) and exists purely so the screen's badge can never drift
   from the real policy. Every status tile and every template row now shows
   an explicit "Usable" / "Not usable" pill next to the status badge, and the
   Draft tile's hint was corrected from implying Draft is unfinished to
   stating plainly that it is already usable in a sequence — the exact
   confusion the brief named ("which is not what the four labels suggest to
   a reader").

## UI decision: Delete only surfaces on the archived view

The Delete button only renders on ARCHIVED rows (visible via "Show
archived"). A live DRAFT/READY_FOR_REVIEW/APPROVED template that was never
used can still only be *archived* from the default view, then deleted from
the archived view. This was a deliberate choice, not a boundary requirement:
archiving is reversible and cheap, so requiring it before a permanent,
irreversible delete gives the operator one extra, low-friction checkpoint
without adding a second confirmation dialog. The underlying eligibility
check (`describeTemplateDeleteEligibility`) does not care about current
status — only usage — so this can be relaxed later without touching the
boundary itself if that friction turns out to be unwanted.

## What was explicitly NOT changed

- `canApproveSequence` / `sequence-policy.ts`'s external behaviour — only
  internal duplication was removed. All 22 pre-existing tests pass
  unmodified.
- No existing template was archived or deleted against real client data
  while building or testing this (all delete/query behaviour is proven
  against a mocked Prisma client — see Tests).
- `.bidlow/GRADES.json`, any dimension score, or
  `docs/ops/TUESDAY-READINESS-MEASUREMENT-2026-08-30.md`.
- No email was sent.

## Proof it fires (red-first)

Watched RED: `git stash push` on the four implementation files
(`template-policy.ts`, `sequence-policy.ts`, `mutations.ts`, `queries.ts`),
keeping the new/edited test files in place, then ran the suite —

```
FAIL src/server/email-templates/mutations.test.ts (5 failures — deleteEmailTemplate does not exist)
FAIL src/server/email-templates/queries.test.ts   (4 failures — archivedCount/canDelete undefined, archived rows not filtered)
FAIL src/lib/email-templates/template-policy.test.ts (5 failures — isTemplateStatusUsableInSequence/describeTemplateDeleteEligibility not exported)
14 failed | 36 passed (50)
```

`git stash pop` restored the implementation; reran green (below). The three
tests the brief named by name:

- **a never-used template can be deleted** —
  `mutations.test.ts > deletes a template that has never been used in any
  sequence and has no send history`
- **a used template is refused with a readable reason** —
  `mutations.test.ts > refuses to delete a template used in a sequence step,
  with a readable reason, and never calls delete` (+ the send-history
  variant)
- **archived rows are absent from the default list** —
  `queries.test.ts > excludes ARCHIVED rows from the default (working) list`

`e2e/screen-walk.spec.ts` gained one screen
(`client-templates-archived`, `?showArchived=1`) proving the new toggle
state renders cleanly — screen-walk is navigation-only (no form
submission), so it is not the natural home for the three behavioural proofs
above; those live at the query/mutation layer where they run in
milliseconds against a mocked Prisma client instead of a full browser.

## Gates

- `npm run lint` — 0
- `npm run typecheck` — 0
- `npm test` — 362 files / 3772 tests passed
- `npm run build -- --webpack` — succeeded, `/clients/[clientId]/templates`
  compiled

## Merge

Branch `feat/row130-templates-hide-delete-usable`, PR opened against `main`,
merged once CI green. Merge commit hash recorded in
`.bidlow/relay/QUEUE.md` row 130 and confirmed with
`git ls-remote origin refs/heads/main` — see the row's own status cell for
the hash.
