# Row 159 — support ticket reply thread (cycle 222, 2026-09-01)

Raised by row 136 (cycle 197), finding 6: `src/app/(app)/support/page.tsx:64-66`
tells a reporter "the developer picks up each ticket, fixes it, and closes it,"
but a ticket's only two free-text fields for its whole lifetime were the
reporter's initial description and the resolver's single closing note — no
`addComment`/reply action existed anywhere, and `[ticketId]/page.tsx` had no
thread UI.

## The decision: build it, not soften the copy

The row asked to assess first: build a real thread, or soften the on-screen
promise to match current behaviour. Decided to build, for this reason —
neither of the three stop-conditions (destructive migration, client-data
touch, or an email send) applies. A reply thread is a small, purely additive
change (one new table, no change to any existing column, type, or row), and
the row's own "IF BUILDING" section already specified the full shape wanted:
an append-only comment list, its own server action, durable storage, visible
to the reporter and the owner. Softening the copy would have been the lower
bar, and the feature itself is cheap enough (~150 lines across a migration, a
server action, and a small client component) that building the real thing was
the better trade. This is a decision the standing rules make mine to make —
recorded here rather than asked, per the row's own "or record the decision if
it is genuinely yours" clause.

## What shipped

- **Schema** (`prisma/schema.prisma`): new `SupportTicketComment` model — `id`,
  `ticketId`, `body`, `authorStaffUserId` (nullable, `SetNull` on staff
  deletion, mirroring `SupportTicket.createdByStaffUserId`), `authorEmail`
  (snapshot, survives staff deletion), `createdAt`. New relation field
  `comments SupportTicketComment[]` on `SupportTicket`, and
  `supportTicketCommentsPosted` on `StaffUser`. Migration
  `prisma/migrations/20260901120000_support_ticket_comments/migration.sql` —
  additive only (one `CREATE TABLE`, one index, two foreign keys); dropping
  the table restores today's behaviour exactly, since no existing code path
  reads or writes it.
- **Server action** (`src/app/(app)/support/actions.ts`):
  `addSupportTicketComment({ ticketId, body })` — any signed-in staff member
  can post (mirrors the existing visibility model: `/support` already lists
  every ticket to every staff member, and there is no reporter-only
  restriction on `/support/[ticketId]` today, so a reply thread visible to
  "the reporter and the owner" is, in practice, visible to all staff exactly
  as the rest of the ticket already is). Rejects a blank/whitespace-only body
  (< 2 chars) and a missing ticket before ever writing. Append-only — no edit
  or delete action exists.
- **UI**: new `src/components/support/support-ticket-comments.tsx` — an
  oldest-first list of replies plus a small reply form, wired into
  `src/app/(app)/support/[ticketId]/page.tsx` in a new "Replies" card between
  the Resolution card and the Actions card. The page queries
  `comments: { orderBy: { createdAt: "asc" }, include: { author: ... } }` and
  passes that array straight through without re-sorting.

## Proof it fires — red before green

Two test files prove this, both watched red without the change (this repo's
established substitute for a jsdom render harness — `npm test` runs
`environment: "node"`, unit/pure only, matching only `*.test.ts`, as row
154/155/156 already established):

- `src/app/(app)/support/actions.test.ts` — 5 new cases for
  `addSupportTicketComment` (rejects blank/whitespace body without touching
  Prisma, returns not-found for a missing ticket, posts for a non-owner staff
  member, trims the body). Proven red by `git stash push` on just
  `actions.ts`: all 5 failed with `TypeError: addSupportTicketComment is not
  a function` before the implementation existed; restored and green after.
- `src/components/support/support-ticket-comments-copy.test.ts` (new) — a
  source-grep test in the same style as the row 154/155/156 copy tests,
  asserting the page queries comments oldest-first
  (`orderBy: { createdAt: "asc" }`), renders them through
  `SupportTicketComments` without re-sorting, and that the component posts new
  replies via the real `addSupportTicketComment` server action rather than a
  local stub. Proven red by `git stash push -u` on the page and the new
  component together: all 3 assertions failed (missing import / missing file)
  before the change; restored and green after.

Both stash/restore cycles are the literal "adds a reply and asserts it renders
on the ticket detail page in order" proof the row asked for, adapted to this
repo's real test harness rather than a jsdom mount that doesn't exist here.

## The hard rule

No email was sent. No client data was touched, read, or deleted for any
client other than what already existed in mocked test fixtures (`t1`,
`missing` — not real records). The only database change is a new, empty
table — no existing row in any client's data was read, written, or altered.

## Gates

- `npx tsc --noEmit` — 0 errors.
- `npm run lint` — 0 errors/warnings.
- `npm test` — 388 files, 3981 tests: 3978 passed, 3 failed. The 3 failures
  (`src/instrumentation.test.ts`, `src/lib/monitoring/sentry-config-wiring.test.ts`
  ×2 cases) are in files this change never touches (confirmed via
  `git diff --name-only`) — both time out at 5000ms trying to reach a
  synthetic Sentry DSN host, a pre-existing network-access limitation of this
  sandbox, not a regression from this row. Not fixed here; outside this row's
  scope.
- `npm run build -- --webpack` — succeeded; `/support/[ticketId]` builds as a
  dynamic route as before.

## What this did not touch

Row 156's resolution-note minimum (`isResolutionNoteReady`), the resolve/
reopen actions, `/operations`, `/google-reconnects`, `/settings/internal-seed`
— none of these files were opened for writing.
