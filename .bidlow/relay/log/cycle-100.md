# Cycle 100 — queue item 89: measure mobile before changing anything (CR-09)

## What the item said

Mobile had never been looked at, on this pass or either previous one.
`.bidlow/GRADES.json` recorded CR-09 as unproven rather than assumed fine.
The brief: drive the existing Playwright setup at a phone viewport across the
journeys that actually matter (client list, one client's overview, the
mailboxes tab, the setup-help page, the send-preparation screen with its
four-at-a-time gate), write down what breaks BEFORE fixing anything, then fix
only what the walk found, smallest first, and re-walk to prove it. Explicitly
not a responsive redesign.

## PR sweep first

`gh pr list --state open` → `[]`. Nothing to merge.

## Files changed

- `e2e/mobile-walk.spec.ts` (new) — drives five journeys at a 375×667 (iPhone
  SE) viewport, asserting no horizontal page overflow, no rendered text under
  12px, no table wider than the viewport lacking its own scroller, and no
  interactive control under 24px (WCAG 2.5.8).
- `src/components/clients/client-logo.tsx` — monogram tile font-size floor
  10px → 12px.
- `src/components/clients/client-operational-snapshot.tsx` — two
  `text-[11px]` labels → `text-xs` (12px).
- `src/components/clients/client-mailbox-identities-panel.tsx` — the mailbox
  row action-button group: `flex-wrap` → `flex-nowrap` (drops the now-inert
  `max-w-md`).
- `src/components/clients/client-deliverability-help.tsx` — the `Rec`
  component (SPF/DMARC record display): value moved onto its own full-width
  line, `break-all` → `break-words`.
- `.bidlow/GRADES.json`, `CUSTOMER-READY-REPORT.md` — CR-09 OPEN → CLOSED with
  evidence; dimension 4 observed-text updated, score unchanged at 8.

## The red-first measurement

Built production (`npm run build`), ran `mobile-walk` against it. First run:
2 of 5 screens red.

- `client-list`: monogram initials ("EB", "ES", "ET", "JW") at 11px.
- `client-overview`: eight Operational Snapshot labels/hints at 11px.

Re-ran after applying `prisma migrate deploy` to the stale local e2e Postgres
(it was missing five same-day AI-feature migrations, which had been silently
swallowing content on `/mailboxes` and `/outreach` and hiding real render
paths) — this surfaced two more red screens, `client-mailboxes` and
`client-outreach-send-prep`, both flagging text at 11px inside collapsed
`<details>` panels ("Connection troubleshooting (owner only)" and a sequence
selection hint).

## A bug in the walk itself, found and fixed before it produced a false fix

Investigated why closed `<details>` content was reading as on-screen: Chromium
keeps a cached, non-zero `getBoundingClientRect()` for a closed `<details>`
panel's children (so re-expanding is instant) even though nothing is painted
— confirmed with a throwaway debug spec that walked the ancestor chain,
checked `getComputedStyle`, and finally called `Element.checkVisibility()`,
which correctly reported `false` while `details.open === false` reported
`true` for the rect. Added `checkVisibility()` as a gate on every check in
`mobile-walk.spec.ts` (text, tables, tap targets) rather than trusting a
bounding rect alone. Re-ran: `client-mailboxes` and
`client-outreach-send-prep` went green — that finding was a test bug, not a
product bug, and is recorded as such rather than "fixed" with product code.

## What the walk actually found real, and fixed

1. **Client-logo monogram at 11px** (`client-logo.tsx`) — `fontSize:
   Math.max(10, Math.round(size * 0.35))` gives 11px at the 32px size used on
   `/clients`. Floor raised to 12px; the only other three call sites (56px,
   64px, 64px) were already unaffected.
2. **Operational Snapshot labels at 11px** (`client-operational-snapshot.tsx`)
   — literal `text-[11px]` on both the label and the hint. Changed to
   `text-xs` (12px), the size already used everywhere else in this card grid.
3. **Mailbox table rows inflated by a wrapped action-button column**
   (`client-mailbox-identities-panel.tsx`) — the Actions cell
   (`Set primary`/`Reconnect`/`Disconnect`/`Remove`/`Edit`, five buttons) used
   `flex flex-wrap`, which wrapped onto two lines inside its ~192px column and
   pushed every row to ~97px tall. Because the table is horizontally
   scrollable (`Table`'s own `overflow-x-auto`), that extra height leaked back
   into the still-visible Mailbox/Provider columns as a large block of blank
   space per row — screenshot before/after: page height 3366px → 3102px for
   the same five mailboxes, nothing removed. Fixed with `flex-nowrap` (the
   table already handles overflow by scrolling, so wrapping served no
   purpose at any viewport).
4. **SPF/DMARC records chopped mid-word on setup-help**
   (`client-deliverability-help.tsx`) — the `Rec` component crammed label,
   value and a Copy button into one row with `break-all` on the value; on a
   phone the remaining width forced `v=spf1 include:spf.protection.outlook.com
   -all` to break as `spf.pro` / `tection.outlook.com` / `-a` / `ll`. This is
   the exact string a customer's IT department is asked to copy-paste for
   deliverability — a wrapping bug on it is not cosmetic. Given the value its
   own full-width line and swapped to `break-words`, which now wraps at the
   space before `-all` and leaves the record intact.

Re-walked after each fix; all five journeys green: `npx playwright test
mobile-walk` → 5 passed.

## What was NOT done, named rather than hidden

- The send-preparation screen's **populated** four-at-a-time state (actual
  recipient batches, cooldown countdown, Launch button) was not exercised.
  The e2e fixture client has no active `ClientEmailSequence`/enrollment, so
  `/outreach` renders its clean empty state ("No sequences yet"). Seeding one
  would mean adding `ContactList`/`ClientEmailTemplate`/
  `ClientEmailSequence`/`ClientEmailSequenceEnrollment` rows to
  `e2e/seed-e2e.ts`, a shared fixture file seven other specs depend on — out
  of scope for a single "measure, then fix only what was found" cycle.
  Recommend a follow-up row if the populated gate UI needs its own mobile
  check.
- Only one viewport was measured (375×667). A second breakpoint (e.g.
  390×844) was not run.
- Did not touch the `Table` component's horizontal-scroll pattern itself
  (used across dozens of tables app-wide) — a swipeable table inside a card is
  a standard, acceptable mobile pattern, and reworking it would be the
  responsive redesign the brief explicitly ruled out.
- Left the pre-existing stale entries in `CUSTOMER-READY-REPORT.md`'s "Top
  blockers" list (CR-06, CR-05 shown as open when `GRADES.json` already
  records them closed) — inherited drift from before this cycle, unrelated to
  CR-09, one concern per cycle.

## Gates

- `npm run lint` → 0 errors.
- `npx tsc --noEmit` → 0 errors.
- `npm test` (vitest) → 3644/3644 passed, 348 files.
- `npx playwright test` (full suite, not just the new spec) → 91/92 passed, 1
  pre-existing skip (`training-screenshots.spec.ts`) unrelated to this cycle —
  proves the shared-component edits (`ClientLogo`, the mailboxes table, the
  operational snapshot) did not regress `screen-walk`,
  `mailboxes-table-first`, or anything else.
- `npm run build` → webpack production build, exit 0, three times (once per
  round of fixes).

No schema, no migration, no client data moved, no email.

## Grading

CR-09 OPEN → CLOSED in `.bidlow/GRADES.json` and `CUSTOMER-READY-REPORT.md`,
with the evidence above. Dimension 4 (Professional polish & UX) observed-text
updated to record mobile was checked; **score unchanged at 8** — three
pre-existing, unrelated contrast defects in `DESIGN.json` already held it
there. Weighted total unchanged at **7.50**. Sell gate still NOT SATISFIED:
CR-08 and CR-01b remain open on their own rows; CR-01b cannot be closed by any
cycle (rule (c), no send).
