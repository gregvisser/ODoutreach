# Row 148 — all fourteen training-content drift defects fixed

**Date:** 2026-08-31 · **Cycle:** 207 · **Type:** copy-only fix inside
`src/lib/training/` (`modules.ts`, `staff-handover-guide.ts`) and one
navigation link added on `src/app/(app)/training/page.tsx`. No schema change,
no send-path change, no client data touched.

Evidence for the twelve findings raised by row 134 (cycle 192) and the two
folded in by row 136 (cycle 197):
`docs/ops/ROW134-FOUR-QUESTIONS-2026-08-31-cycle192.md` and
`docs/ops/ROW136-SCREEN-WALK-PART2-2026-08-31-cycle197.md`. This artefact
records what actually changed, checked against the live code a second time
before editing (some line numbers had drifted since cycle 192/197 read them).

## Fixes, against the row's own numbering

1. **`{{email_signature}}` regression in the worked-example template** —
   removed the line from `OPENSDOORS_TRAINING_EXAMPLE.template.body`
   (`modules.ts`). The reused code block at the bottom of the Outreach module
   reads from the same constant, so it is fixed too.
2. **Sources module's false "valid = imported" claim** — rewrote the details
   bullet, the "Confirm every row is valid" step (renamed "Check the preview
   for skipped rows"), and the whatGoodLooksLike bullet to say plainly that a
   row needs a usable email to be saved at all; LinkedIn/mobile/office number
   alone gets a row marked skipped, never persisted — matching
   `EMAIL_REQUIRED_FOR_PERSISTENCE` and `import-preview.ts`'s real skip
   reasons.
3. **Mailbox connect/reconnect/signature described as admin-only** — fixed in
   `mailboxesModule` (details, "Confirm the per-mailbox signature" step,
   common mistake) and in `staff-handover-guide.ts` (Daily workflow bullet,
   Client setup bullet) to say any staff member can do this, matching
   `canAccessMailboxSetupTools` (unconditionally `true`).
4. **Activity module taught a removed cross-client sidebar link** — rewrote
   `activityModule`'s purpose, the "Open Activity" step (renamed "Open a
   client's Activity tab"), the whatGoodLooksLike bullet, and the module's own
   `portalLink` (was `/activity`, now `/clients` with a note that `/activity`
   is admin-only) to describe per-client Activity only, matching
   `activity/page.tsx`'s redirect and `nav-config.ts`.
5. **"Setup help" tab missing from every tab-row list** — added to the
   onboarding module's tab-row sentence (NOT to the separate seven-item Launch
   readiness list, which is a different, narrower set and stays as-is), to
   the Settings module's per-client list, and to both `staff-handover-guide.ts`
   spots — all in the real tab order from `client-workspace-subnav.tsx`
   (Overview, Brief, Mailboxes, Setup help, Do-not-contact, Sources, Lists,
   Templates, Outreach, Activity).
6. **Outreach module conflated template authoring with the Outreach tab** —
   rewrote the purpose, the details bullet, the "Draft a template" step
   (renamed "Draft a template on the Templates tab"), and the two Outreach
   screenshot captions to say templates are created and edited on the
   Templates tab, matching `templates/page.tsx` and `outreach/page.tsx`'s own
   "edit templates on the Templates tab" copy.
7. **"Internal verification" taught as an Outreach step** — removed from
   `outreachModule` (the step is now "Optional: limited first batch",
   internal-verification language and its whatGoodLooksLike bullet removed);
   added a new step and whatGoodLooksLike bullet to `mailboxesModule`
   describing the real `InternalProofSendCard` ("Send verification email"
   button), matching `mailboxes/page.tsx:315` and the card's actual copy.
8. **Sidebar screenshot stale by three missing items + one removed item** —
   rewrote the alt text and caption on the Settings module's sidebar
   screenshot to the real `nav-config.ts` order (Reports, Replies to answer,
   Clients, New client, Universe, Blocked contacts, Google logins, Training,
   Support, Settings) and to say Activity is per-client only, not in the
   sidebar.
9. **Manual-signature button misnamed; branded-signature generator
   undocumented** — fixed in the same `mailboxesModule` edits as (3): "Edit
   manual signature" → "Set signature" (matching
   `client-mailbox-identities-panel.tsx:1196`), and both the signature step
   and the common-mistake line now mention the one-click "Set branded
   signatures" button (`:978`).
10. **10-day cooldown and Re-engage override undocumented** — added a details
    bullet to `outreachModule` naming the workspace-wide 10-day cooldown, the
    "Recently contacted (10-day cooldown)" preparation-screen label, and the
    real "Re-engage (bypass cooldown)" button
    (`sequence-send-preparation-panel.tsx:300-307`), noting Do-not-contact,
    unsubscribes and hard bounces are still enforced regardless.
11. **Dev-isms rendered to operators** — stripped the PR-number reference and
    the "no raw enum chips" parenthetical from the Do-not-contact sync step
    (`modules.ts`), and stripped `PR #\d+` from four `STAFF_VIDEO_SCRIPTS`
    entries and one `staff-handover-guide.ts` bullet. Left source `/** */`
    doc comments alone (not operator-facing).
12. **Settings "admin-only" role language broader than enforced** — added a
    clarifying sentence to the "Read the Team access roster" step: admins
    control the staff roster itself (invite/remove/role changes); role no
    longer gates day-to-day workspace actions, matching
    `requireStaffAdmin`'s narrow use (staff management only) and
    `staff-access/actions.ts`.
13. **`staff-handover` guide unreachable from training index** — added a
    "Printable staff handover guide →" link to `training/page.tsx`'s header
    actions, pointing at `/training/staff-handover`.
14. **Printed checklist misquoted the sidebar label** — "the sidebar, titled
    'People blocked from outreach'" → "sidebar → Blocked contacts; the page
    itself is titled 'People blocked from outreach'", matching
    `nav-config.ts:66`'s real sidebar label.

## Proof it fires

New file `src/lib/training/row148-drift-fixes.test.ts` — one `describe` per
finding (20 assertions total). Confirmed **red** against the unmodified
source before any fix was applied (`npx vitest run
src/lib/training/row148-drift-fixes.test.ts` → 20/20 failed with the expected
messages), then fixed each finding and re-ran to **green**.

The pre-existing lock-down test, `modules-staff-readiness.test.ts`, was
re-checked line by line against every edit — no assertion there needed
changing. In particular, the onboarding module's Launch-readiness substring
(`"Brief, Mailboxes, Sources, Do-not-contact, Lists, Outreach, Activity"`) is
untouched; "Setup help" was added only to the separate tab-row sentence in the
same string, not to the seven-module launch-readiness list.

## Gates, run and shown

- `npm run lint` — 0 errors.
- `npx tsc --noEmit` — 0 errors.
- `npm test` — 372 files, 3882 tests, all green (was 3862 before this row's
  new test file; +20 matches the new file's test count).

## Hard rule compliance

No email sent, no client data touched or deleted, no migration. This row
edited only static training copy and one navigation link.
