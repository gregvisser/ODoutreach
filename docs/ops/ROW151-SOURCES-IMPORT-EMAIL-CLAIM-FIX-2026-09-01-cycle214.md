# Row 151 fix — Sources import screen no longer claims an email-less contact is saved (cycle 214, 2026-09-01)

## The finding this closes

Row 135 (cycle 195), finding 2, read `docs/ops/ROW135-SCREEN-WALK-PART1-2026-08-31-cycle195.md`:
the live Sources import screen (`src/app/(app)/clients/[clientId]/sources/page.tsx`) told staff
*"A contact must have at least one of email, LinkedIn, mobile, or office number to be saved."*
`EMAIL_REQUIRED_FOR_PERSISTENCE = true` (`src/lib/contact-import-contract.ts`) means that is false:
a row with no usable email is never written to the database at all. An operator relying on the
screen's own words would believe a LinkedIn-sourced batch imported cleanly when a portion of it
silently did not, with no on-screen count of what was dropped.

## What was already true before this cycle started

Row 148 (cycle 207, commit `66bec14`, PR #529) already fixed the matching claim in the training
module (`src/lib/training/modules.ts`) — the module's `sourcesModule.details[1]` and its "Check the
preview for skipped rows" step already state plainly that an email-less row "is marked skipped in
the preview and is never persisted to Universe or the list." That fix landed before this row's
brief was written, so the training-module half of this row's "THE WORK" was already done. Verified
directly against current `main` before touching anything (`git log --oneline -- src/lib/training/modules.ts`
and reading the file). No change made to `modules.ts` this cycle — it was already correct and
already covered by `src/lib/training/row148-drift-fixes.test.ts`.

## What this cycle actually changed

Only the live Sources screen still carried the false claim. Two files:

1. **`src/lib/contact-import-contract.ts`** — `CONTACT_IMPORT_CONTRACT_SUMMARY.rules` already
   existed as "the single source of truth ... suitable for rendering in the Sources / Contacts UI
   panels" (per its own doc comment) but was never actually imported anywhere — the Sources page
   had its own hand-written paragraph that had drifted from it. Corrected rule index 2 from
   *"Email is required to save a row today; Linkedin-only / phone-only persistence is a
   follow-up."* (true but easy to misread as "saved without email") to state the consequence
   plainly: *"A row needs a usable email address to be saved as a contact today. Linkedin, mobile,
   and office number are recorded as extra identifiers on an email-bearing row, but a row with
   none of those and no email is skipped and never saved, however many other channels it has."*

2. **`src/app/(app)/clients/[clientId]/sources/page.tsx`** — replaced the hardcoded paragraph
   (the exact text row 135 quoted) with `{CONTACT_IMPORT_CONTRACT_SUMMARY.rules[0]}{" "}
   {CONTACT_IMPORT_CONTRACT_SUMMARY.rules[2]}`, so the on-screen copy is now rendered from the
   same constant as the corrected rule text rather than a second hand-maintained string. This is
   the mechanism that stops the Sources screen and the training module (or any future consumer)
   from independently drifting again — the fact lives in one place
   (`src/lib/contact-import-contract.ts`), not two.

## Preview already surfaces a skipped-for-missing-email count

The row's brief asked to "consider whether the import result/preview screen should also surface a
count of rows skipped for missing email, if it does not already." It already does, and did before
this cycle: `buildCsvImportPreview` (`src/lib/contacts/import-preview.ts`) returns
`summary.validNoEmailRows`, `summary.missingIdentifierRows` and `summary.skippedRows`, each with a
per-row `reason` string (e.g. *"Valid, no email — not email-sendable. Email is required to create a
contact today."*), and `CsvImportForm` (`src/app/(app)/contacts/csv-import-form.tsx:338-344`)
renders all three as labelled tiles ("Valid, no email", "Missing identifier", "Will skip") on the
preview the Sources page embeds. No change needed here — confirmed by reading both files, not
assumed.

## Red-first test

`src/app/(app)/clients/[clientId]/sources/sources-page-copy.test.ts`, new test *"states plainly
that a row with no usable email is skipped, not saved (row 151)"*:

- asserts the page source no longer contains the old sentence verbatim,
- asserts the page renders from `CONTACT_IMPORT_CONTRACT_SUMMARY` (not a private string), and
- asserts the shared constant's rule text matches `/skipped and never saved/`.

Run against the unmodified tree (test added, `page.tsx` / `contact-import-contract.ts` not yet
edited): **failed red** — `expect(src).toContain("CONTACT_IMPORT_CONTRACT_SUMMARY")` failed because
the page still rendered its own hardcoded paragraph. After the two-file fix above: **green**, and
the other 6 pre-existing tests in the same file stayed green throughout.

```
✓ src/app/(app)/clients/[clientId]/sources/sources-page-copy.test.ts (7 tests)
```

## Gates run

- `npm run lint` — 0 problems.
- `npx tsc --noEmit` — 0 errors.
- `npm test` — 377 files / 3918 tests, 1 failed before this cycle's commit
  (`relay/cycle-log-reaches-git.test.ts`, flagging cycle 213's untracked log file as not yet
  committed — an expected, self-resolving state at the start of a cycle, not caused by this
  change; resolved by this cycle's own commit adding `.bidlow/relay/log/cycle-213.md` and
  `.bidlow/relay/row-reopen-counts.json`), 3917 passed. Re-run after committing those files to
  confirm the full suite is clean.

## What was not touched

`src/lib/training/modules.ts` was read and confirmed already correct; not edited. No schema,
migration, or send-path change. No email sent, no client data touched, nothing outside
`bidlowai` affected — this is copy-only.
