# Row 152 — list detail page: read-only statement, sequence CTA, Subject fallback fix (cycle 215)

Raised by row 135 (cycle 195), finding 3. Full evidence in
`docs/ops/ROW135-SCREEN-WALK-PART1-2026-08-31-cycle195.md`, finding 3.

## What was wrong

`src/app/(app)/clients/[clientId]/lists/[listId]/page.tsx` — a contact
list's own permanent home page — rendered ten summary counts and a full
contact table with no clickable element beyond a breadcrumb link. Unlike
the Contacts tab one level up (`contacts/page.tsx:392-393`, "This page is
read-only"), it said nothing about being read-only, and had no forward
path to building a sequence with the list — independently reproducing row
146's gap (Universe's list-creation success message had no sequence link)
on a screen an operator returns to every time they check the list, not
just a one-time success message.

A second, smaller defect on the same page: the expanded contact row's
"Subject" field fell back to the sending mailbox's own email address when
no subject preview was captured (`ss?.subjectPreview ?? outbound?.mailbox
?.email ?? null`, `client-contact-list-detail.ts:297`), so a row without a
captured subject read as e.g. "Subject: sender@opensdoors.com" — a mailbox
address masquerading as an email subject line.

## What changed

**Files touched:**
- `src/app/(app)/clients/[clientId]/lists/[listId]/page.tsx` — added a
  read-only statement plus a "Build a sequence with &lt;list&gt;" link to
  the client's Outreach tab, reusing the same `universeListSequenceCtaHref`
  / `universeListSequenceCtaLabel` helpers row 146 (cycle 203) built for
  the Universe success message, so the two forward paths cannot drift
  apart from each other.
- `src/server/queries/client-contact-list-detail.ts:297` — the Subject
  fallback now reads `ss?.subjectPreview ?? (outbound ? "Subject not
  captured" : null)` instead of falling back to the mailbox's email
  address. A contact that was never sent (`outbound` is null) still shows
  the generic "—" empty state, consistent with every other blank field on
  the page; a contact that WAS sent/queued but has no captured subject
  preview now shows the explicit sentence instead.
- `src/app/(app)/clients/[clientId]/lists/[listId]/list-detail-page-copy.test.ts`
  (new) — asserts the page source states plainly that it is read-only and
  wires the sequence CTA via the shared helpers.
- `src/server/queries/client-contact-list-detail.test.ts` — new test
  asserting the Subject field does not fall back to the mailbox address
  and instead reads "Subject not captured" when no preview exists.

Row 146 was checked first (`DONE 204`, merged as `b2f85e0`) — it only
covers the Universe list-creation success message, not this page, so this
row's fix is additive and does not duplicate it. It deliberately reuses
row 146's own href/label helpers rather than inventing new copy, so the
two "build a sequence" prompts stay in sync going forward.

## Proof it fires (red-first)

Both new/changed tests were run and confirmed failing against the
unmodified code before the fix, then passing after:

- `list-detail-page-copy.test.ts` — 2 tests, both failed
  (`toMatch(/read-only/i)` found nothing; `toContain("universeListSequenceCtaHref"/"...Label")`
  found nothing) against the original page source; both pass after the
  page was edited.
- `client-contact-list-detail.test.ts` — new "does not fall back to the
  mailbox address for Subject..." test failed
  (`expect(subject).not.toBe("sender@opensdoors.com")` — subject WAS the
  mailbox address) against the unmodified query; passes after the fix,
  reading "Subject not captured".

## Gates run (cycle 215, on the `docs/row152-list-detail-readonly-cta` branch)

- `npm run lint` — 0 problems.
- `npx tsc --noEmit` — 0 errors.
- `npm test` — 378 files / 3921 tests, all green except the pre-existing
  `cycle-log-reaches-git` guard flagging this cycle's own not-yet-committed
  `cycle-214.md` (the standing, expected state at the start of every
  cycle per that test's own message) — resolved by committing the log in
  the same PR as this fix.

## What was NOT touched

No schema change, no migration, no send-path code. No real email sent, no
client data deleted or moved — this row only edits page copy, a query
fallback, and adds tests.
