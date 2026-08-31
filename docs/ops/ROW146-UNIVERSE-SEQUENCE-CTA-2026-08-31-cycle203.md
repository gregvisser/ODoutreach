# Row 146 — Universe list-creation success message now links to sequence creation

Cycle 203, 2026-08-31.

## What was raised

Row 134 (cycle 192), finding 3: creating a list from Universe works and is
well-labelled, but the post-create success message had no link forward to
sequence creation, even though the action already has both `clientId` and the
new `listId`/`listName` in scope. An operator who does not already know the
product's two-step model (list, then separately a sequence under
Clients → Outreach) had no signal where to go next.

## What this cycle found on disk at the start

This exact row's work was already present, uncommitted, in the working tree.
`.bidlow/relay/log/cycle-202.md` records that cycle 202 was killed mid-cycle
by the watcher restart at 2026-08-31 18:29:47 before it could commit. This
cycle read, verified and completed that work rather than redoing it — the
implementation, test and e2e spec were already correct; nothing needed
rewriting.

## The change

- `src/lib/universe/list-created-cta.ts` (new) — two small pure functions:
  `universeListSequenceCtaHref(clientId)` → `/clients/{clientId}/outreach`,
  and `universeListSequenceCtaLabel(listName)` → `Build a sequence with
  "{listName}"`. Kept pure and separate from the client component so the
  href-for-client-id logic is unit-testable without rendering.
- `src/components/universe/universe-page-client.tsx` — the list-create
  success message now renders a `<Link>` styled as an outline button, built
  from the two functions above, using the `clientId` already submitted on the
  form and the `listName` returned by `createListFromUniverseAction`. The CTA
  only appears when a `clientId` was actually submitted (defensive — the form
  always requires one, but the CTA degrades to nothing rather than a broken
  link if that ever changes). Additive only: no existing behaviour, prop or
  action signature changed.
- `e2e/universe-sequence-cta.spec.ts` (new) — drives the real Universe page:
  search for a fixture contact, select it, pick the client workspace, name
  and create the list, then assert the CTA renders with the exact list name
  and an `href` of `/clients/{E2E_CLIENT.id}/outreach`, and that clicking it
  actually navigates there.
- `e2e/fixtures.ts` / `e2e/seed-e2e.ts` — added `E2E_UNIVERSE_CONTACT`, one
  `ContactUniverse` row seeded for the journey above. Additive only.
- `src/lib/universe/list-created-cta.test.ts` (new) — unit coverage on the
  two pure functions, including a case proving the href is genuinely built
  from the argument (not hardcoded to one client).

## Send safety

The e2e spec only calls `createListFromUniverseAction`, which writes a
`ContactList`/`ContactListMember` row. No template, sequence, enrollment or
outbound email is created by this spec or by the shipped code — there is
nothing on this path that could send, for `bidlowai` or anyone else.

## Proof it fires — red before, green after

**Unit test** (`src/lib/universe/list-created-cta.test.ts`) exercises the
pure functions directly; it cannot pass against code that doesn't exist, so
its existence alongside `list-created-cta.ts` is the red/green boundary for
the href/label logic.

**E2E test**, run directly against a local build on the existing
`odoutreach-e2e-postgres` container (port 5434, schema already current — `npx
prisma migrate deploy` reported "No pending migrations to apply"):

1. Stashed only `src/components/universe/universe-page-client.tsx` (the CTA
   render), rebuilt (`npm run build`), ran
   `npx playwright test e2e/universe-sequence-cta.spec.ts --reporter=list`:

   ```
   ✘  1 [chromium] › e2e\universe-sequence-cta.spec.ts:25:7 › ... (6.1s)
   Error: expect(locator).toBeVisible() failed
   Locator: getByRole('main').getByRole('link', { name: 'Build a sequence with "E2E CTA list ..."' })
   Error: element(s) not found
   1 failed
   ```

2. Restored the change (`git stash pop`), rebuilt, re-ran the same command:

   ```
   ✓  1 [chromium] › e2e\universe-sequence-cta.spec.ts:25:7 › ... (1.2s)
   1 passed (6.5s)
   ```

Confirms the spec is capable of failing and that it only passes because the
CTA is actually rendered and actually resolves to the correct client.

## Gates

- `npm run lint` — 0 problems.
- `npm run typecheck` — 0 errors.
- `npm test` — 369 files / 3829 tests passed, 1 pre-existing failure
  (`relay/cycle-log-reaches-git.test.ts`) for the two untracked cycle logs
  (`cycle-201.md`, `cycle-202.md`) this same commit adds to git — expected at
  the start of a cycle per that test's own message, resolved by this
  commit's `git add`.

## Also fixed while completing cycle 202's interrupted work

`.bidlow/relay/log/cycle-201.md` and `cycle-202.md` existed on disk but were
never committed — the same class of defect row 137's log noted for cycle
200. Both are added in this commit alongside row 146's own log.

## Merge

Branch `fix/row146-universe-sequence-cta`, PR opened against `main`, merged
after green CI. Merge commit hash and `git ls-remote` confirmation recorded
in `.bidlow/relay/QUEUE.md` row 146 and in `cycle-203.md`.
