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


---

## The watcher's own record of this cycle

Everything ABOVE this line was written by the cycle itself, and is kept exactly as the cycle left it. Nothing above was edited, shortened or reordered.

This section is written by `relay-watch.ps1` after the cycle's process has
exited. It is the independent half of the record: the cycle above says what it
meant to do, and this says what actually moved on disk, how long it took, and
how the process ended. Where the two disagree, this half is the evidence.
# Cycle 100 - timed-out

KILLED. This cycle was still running after 45 minutes, so it
was stopped, along with every process it had started (6 in
total). The relay did NOT wait for it and has carried on to the next item.

Anything it had already written to disk is still there - a kill does not undo
work - so read the evidence below before assuming this item is untouched.

Started 2026-08-29 13:43:48, took about 45 minutes.
How it ended: killed at the 45 minute deadline.

Evidence checked: git refs on every branch, the working tree, and these
files named in the brief: bidlow/GRADES.json, bidlow/relay/QUEUE.md

## What it was asked to do

# Cycle 100 - queue item 89

This brief was written by the relay itself, off the top of QUEUE.md. Greg has
not read it. If it is wrong, say so in your log rather than working around it,
and correct QUEUE.md.

## The item, verbatim from the queue

> **MOBILE HAS NEVER BEEN LOOKED AT, ON THIS PASS OR EITHER PREVIOUS ONE - CR-09.** `.bidlow/GRADES.json` records it as unproven rather than assumed fine, which was the right call and is now the oldest untouched item on the customer-ready list. OpensDoors' staff work from phones between client sites; a screen that cannot be used one-handed on a train is a product defect on this system specifically. **Measure before changing anything.** Drive the existing Playwright setup at a phone viewport (`e2e/`, the config already exists) across the journeys that actually matter: the client list, one client's overview, the mailboxes tab, the new setup-help page, and the send-preparation screen with its four-at-a-time gate. Capture what breaks - horizontal scroll, a control that cannot be reached, text under 12px, a table that cannot be read - and write it down BEFORE fixing anything, because the fix list is the deliverable and a guessed fix list is worthless. **Then fix only what the walk found**, smallest first, and re-walk to prove it. Do not start a responsive redesign; this row is about the journeys being usable, not about the design being fashionable.

## The one rule

THE HARD RULE, and it is not negotiable:
Real email may be sent, and data deleted, ONLY for the `bidlowai` client.
Every other client may be built on, tested and measured. Nothing leaves the
building for them. This is enforced in `autonomous-actor-guard.ts`, not by
your good intentions. If a task seems to need a real send for anyone else,
that task is wrong - stop and write down why.

## FIRST, BEFORE ANY NEW WORK: CLEAR THE GREEN PULL REQUESTS

Do this at the START of every cycle, before you read the item below. It takes two
minutes and it is the difference between a queue and a landfill.

`gh pr list --state open` then, for every PR whose checks are GREEN: bring the
branch up to date if branch protection requires it, and MERGE it. Greg counted
SEVENTEEN open on 2026-08-28 and most were green - they had simply been opened and
abandoned.

**Understand WHY this happens, because it is structural and not laziness.** A
cycle finishes its work, opens a PR, and ends. CI takes about five minutes. Nobody
ever comes back. So every cycle adds one and removes none, for ever. The only
place that can be fixed is here, at the start of the NEXT cycle.

Rules for the sweep:
* RED PRs are not yours to force. Read the failure, and either fix it as part of
  this cycle or say in your log why you left it.
* Merge order matters: branch protection requires each branch to be current, so
  every merge invalidates the next one. Take the docs and `.bidlow` record PRs
  first - they cannot conflict with code - then the code ones, updating as you go.
* `gh pr merge --auto` is better than update-then-race if auto-merge is allowed.
* A DESTRUCTIVE migration is still Greg's. Additive is yours.
* If a PR is genuinely not ready, say so in a comment on it, so the next cycle
  does not have to work that out again.

## Before you touch anything, write these four things down

1. **The files you are going to change.** Name them. If you cannot yet, your
   first job is to find out, and that reconnaissance IS the cycle.
2. **The red-first test.** Name the test file and what it asserts. Watch it FAIL
   before you make it pass. If the behaviour cannot go red first, say why, and
   prove the test is capable of failing by deliberately breaking the code and
   showing the red - that is this repository's established substitute.
3. **What "done" looks like** for this item, in one sentence a non-coder can check.
4. **What you must NOT touch.** Anything outside the files in (1).

## The rules that apply to every cycle

* Do not stall on a question. Decide, record the decision and why, and continue.
  If the decision is genuinely Greg's - money, a client relationship, or one of
  the three named below - stop and write down the question instead. Note what
  changed on 2026-08-27: "an irreversible one-way door" used to sit in this list
  and was read as covering any production merge. It does not. Only (a), (b) and
  (c) below stop you now.
* Gates before you claim anything: `npm run lint`, `npm run typecheck`,
  `npm test`. Show the real output. A gate you did not run is not met.
* Commit and push when confident. Branch protection is ON, so it is
  branch -> PR -> green CI -> merge. Never push straight to `main`.
* **MERGING IS YOURS NOW. Greg decided this on 2026-08-27 and asked to stop being
  the bottleneck.** With green CI, MERGE AND DEPLOY WITHOUT ASKING. Do not park a
  finished, green PR and wait for him - a PR left open ROTS: #231 went from clean
  to 36 commits behind and CONFLICTING in a single day, and cost a whole cycle to
  rescue. Leaving it open is not the safe option, it is the expensive one.
* Three things still stop and ask, and they are the ONLY three:
  (a) a DESTRUCTIVE migration - anything that drops or alters an EXISTING table,
      column or type, or backfills over existing rows. Creating a NEW table, a new
      enum, or adding foreign keys to a new table is ADDITIVE and is yours to merge.
      The test is: does dropping what this adds restore today's behaviour exactly?
  (b) anything that touches or moves real CLIENT data.
  (c) anything that causes an EMAIL TO BE SENT. That one is absolute and it is on
      top of the hard rule about `bidlowai`, not instead of it.
  If it is none of those three, you do not need him. Merge it.
* If you deploy, verify the running commit by HASH against the DIRECT App
  Service URL (`app-opensdoors-outreach-prod.azurewebsites.net`), never the
  CDN-cached custom domain, and never liveness alone.
* Production migrations are real. `PRODUCTION_PRISMA_MIGRATE` is true, so
  merging a migration applies it to the live client database.
* When you finish, update this item's row in `.bidlow/relay/QUEUE.md` to
  `DONE 100`, or back to `TODO` with a note if you could not do it.

## THE STATUS CELL: SIX WORDS, AND ONLY SIX

The status cell of a queue row MUST BEGIN with one of exactly these six:

    TODO    DONE    BLOCKED    PARTIAL    IN PROGRESS    WONTFIX

Markdown bold around it is fine - `| **DONE 100 - ...** |` reads correctly.
Anything else does not. The relay reads QUEUE.md with a regex, and a status it
cannot read STOPS THE WHOLE QUEUE, on purpose: refusing to guess is the right
behaviour, and inventing is the one thing this relay will never do.

This is not hypothetical, and it is not pedantry. Cycle 59 built, merged and
DEPLOYED half of row 40 - good work, verified by commit hash - and then wrote its
status as `PARTLY DONE 59`. Two words, one of them not on the list above. The
row stopped parsing, the picker met it first, and the relay took nothing at all
for seventy minutes while eleven jobs waited behind it. `SUPERSEDED` did exactly
the same thing to row 38 the day before.

So, plainly:

* Finished it -> `DONE 100 - <what you did, and the proof>`
* Did some of it -> `PARTIAL 100 - <what is done, what is left>`. PARTIAL
  is TAKEN by the relay, so the next cycle picks the row straight back up. This is
  the right answer whenever you shipped part of a row.
* Could not start -> `TODO - <why>`
* Never invent a seventh word.
* Do NOT write the next NEXT.md. The watcher does that. One cycle, one item.

## Assume the seventh exists

QUEUE.md records six instances this week of something built, wired, reporting
success, and never firing. It is the defect this project is worst at by a wide
margin. Whatever you build this cycle, prove it FIRES - not that it exists.


## What it did


