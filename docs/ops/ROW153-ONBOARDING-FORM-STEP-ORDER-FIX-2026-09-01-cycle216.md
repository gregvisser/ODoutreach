# Row 153 — new-client form "After create" step order fix (cycle 216)

Raised by row 135 (cycle 195), finding 4. Full evidence in
`docs/ops/ROW135-SCREEN-WALK-PART1-2026-08-31-cycle195.md`, finding 4.

## What was wrong

`src/app/(app)/clients/new/onboarding-form.tsx:170-178`'s "After create" box
told a brand-new operator to complete setup in this order:

> Brief → Mailboxes → Sources → Suppression → Contacts → Templates →
> Sequences → Activity

The real post-creation checklist the client sees immediately
(`src/lib/clients/getting-started-view-model.ts:70-145`, the "Getting
started" card on the workspace overview) has 8 different steps in a
different order:

> Brief, Mailboxes, Suppression, Contacts, Templates, Sequences,
> Enrollments, Launch

There is no "Sources" step and no "Activity" step in the real checklist at
all, and the workspace subnav's own code comment
(`client-workspace-subnav.tsx:44-45`) confirms Suppression is deliberately
meant to come before Sources/Contacts import — the reverse of what the
form said. Nothing was mis-wired; this was a pure copy mismatch, but it is
the first thing a brand-new operator reads, and the very next screen they
land on visibly disagreed with it.

## What changed

**File touched:**
- `src/app/(app)/clients/new/onboarding-form.tsx:172-177` — the "After
  create" paragraph now reads "Brief → Mailboxes → Suppression → Contacts
  → Templates → Sequences → Enrollments → Launch", matching the real 8
  steps and order from `getting-started-view-model.ts` exactly. "Sources"
  and "Activity" are gone; "Enrollments" and "Launch" (both real steps on
  the actual checklist) are now named.
- `src/app/(app)/clients/new/onboarding-form-copy.test.ts` (new) —
  asserts the corrected 8-step order string is present (whitespace
  normalized, since the JSX text wraps across source lines) and the old
  8-step string is absent.

This is copy-only. No behaviour, routing, or data change.

## Proof it fires (red-first)

`onboarding-form-copy.test.ts` was run against the unmodified file first:
failed, because the corrected order string did not exist yet (the file
still contained the old "Sources ... Activity" order). After editing
`onboarding-form.tsx`, the same test passes.

Confirmed a second way: after fixing the file, `git stash push` on just
`onboarding-form.tsx` (reverting it to the unmodified `main` version) and
re-running the test reproduced the same red failure
(`expect(normalized).not.toContain(...)` — the old string was present),
then `git stash pop` restored the fix and the test went green again.

## Gates run (cycle 216, on branch `docs/row153-onboarding-form-order`)

- `npm run lint` — 0 problems.
- `npx tsc --noEmit` — 0 errors.
- `npm test` — 379 files / 3922 tests, all green except the pre-existing
  `cycle-log-reaches-git` guard flagging this cycle's own not-yet-committed
  `cycle-215.md` (the standing, expected state at the start of every cycle
  per that test's own message) — resolved by committing the log in the
  same PR as this fix.

## What was NOT touched

No schema change, no migration, no send-path code. No scoring changed. No
real email sent, no client data deleted or moved — this row only edits
one paragraph of onboarding-form copy and adds a test proving it.
