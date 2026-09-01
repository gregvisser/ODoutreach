# Row 156 — support tickets can be resolved with a blank resolution note

Cycle 219, 2026-09-01. Raised by row 136 (cycle 197), finding 3:
`docs/ops/ROW136-SCREEN-WALK-PART2-2026-08-31-cycle197.md` finding 3.

## The gap

Ticket creation enforced a real minimum (title ≥3 chars, description ≥10
chars, `src/app/(app)/support/actions.ts:37-41`), but `resolveSupportTicket()`
accepted `input.resolutionNote.trim() || null` with no minimum at all
(`actions.ts:120-126`), and the Resolution card on `[ticketId]/page.tsx:125-136`
simply doesn't render when the note is empty. A reporter watching their own
ticket only saw the status pill flip to "Resolved" with no explanation of
what was actually fixed.

## The fix

Added a single shared, pure predicate — `isResolutionNoteReady` /
`MIN_RESOLUTION_NOTE_LENGTH` (= 10, mirroring the description's own floor) —
in `src/lib/support/support-labels.ts`, imported by both sides so they can't
drift apart:

1. **Server (`src/app/(app)/support/actions.ts`)** — `resolveSupportTicket`
   now trims the note, checks it against `isResolutionNoteReady`, and returns
   `{ ok: false, error: "Explain what was fixed in a bit more detail (at
   least 10 characters)." }` before it ever calls `prisma.supportTicket.update`.
   This is the real enforcement — the client-side gate below is UX, not the
   security boundary.
2. **Form (`src/components/support/support-ticket-detail-actions.tsx`)** —
   the "Resolve & close" button is now `disabled={pending || !noteReady}`,
   where `noteReady = isResolutionNoteReady(resolutionText)`, and a hint line
   under the textarea tells the owner the note is too short and that the
   reporter reads it.

`scripts/support-agent/resolve-ticket.ts` (a separate developer CLI that
writes to Prisma directly, not through the server action) was deliberately
left untouched — it already refuses an empty `--note` and isn't named by the
brief; adding the same 10-character floor there is a separate, smaller row
if wanted, not folded into this one.

## Proof it fires (red before, green after)

Three test files, each proven red by temporarily reverting just that file
with `git stash push -- <file>` and re-running, then restored with
`git stash pop`:

1. **`src/lib/support/support-labels.test.ts`** (new) — 6 cases on the pure
   predicate (blank, whitespace-only, too short, too-short-before-trim, exact
   boundary, real note). All 6 failed with `isResolutionNoteReady is not a
   function` before the function existed; all 6 pass after.
2. **`src/app/(app)/support/actions.test.ts`** (extended) — 3 new cases:
   blank note, whitespace-only note, and an 8-character note ("fixed it"),
   each asserting `resolveSupportTicket` returns `ok:false` and never calls
   `update`. All 3 failed (`expected true to be false`, `update` was called)
   against the unmodified `actions.ts`; pass after. The pre-existing "resolves
   an open ticket" case was updated from a 5-character note ("fixed") to a
   14-character one ("fixed the bug") since it now needs to legitimately clear
   the new floor.
3. **`src/components/support/support-ticket-detail-actions-copy.test.ts`**
   (new) — this repo has no jsdom/render harness (`vitest.config.ts` runs
   `environment: "node"`, and `include` only matches `*.test.ts`, not
   `*.test.tsx`; no `@testing-library/react` dependency exists), so — matching
   the established precedent from row 154's `google-reconnects-page-copy.test.ts`
   and row 155's `nav-config.badge.test.ts` — this asserts the real component
   source imports `isResolutionNoteReady`/`MIN_RESOLUTION_NOTE_LENGTH`, wires
   `disabled={pending || !noteReady}` onto the button, and renders the minimum
   in its on-screen hint. All 3 failed against the unmodified component
   (`disabled={pending}` only, no import, no hint text); pass after.

## Gates

- `npm run lint` — 0 problems.
- `npm run typecheck` (`tsc --noEmit`) — 0 errors.
- `npm test` — 383 files / 3945 tests, all green (includes the 3 new/extended
  files above plus the pre-existing `relay/cycle-log-reaches-git.test.ts`,
  which required committing the previous cycle's untracked
  `.bidlow/relay/log/cycle-218.md` as part of this cycle's commit — the
  established, expected start-of-cycle state).

## Scope discipline

Did not touch: ticket creation validation, status transitions, the
`scripts/support-agent/*` CLI tools, anything under `_standards`, or any
other client's data. No email sent, no data deleted, no destructive
migration — this is a pure application-logic change with no schema change.
