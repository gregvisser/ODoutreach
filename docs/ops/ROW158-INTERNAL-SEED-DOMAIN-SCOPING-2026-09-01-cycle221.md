# Row 158 — internal-seed allowlist domain scoping (cycle 221, 2026-09-01)

**Raised by:** row 136 (cycle 197), finding 5 — see
`docs/ops/ROW136-SCREEN-WALK-PART2-2026-08-31-cycle197.md`.

## The gap

`upsertInternalSeedAddress` (`src/server/internal-seed/seed-allowlist.ts`) is the
only write path for the `/settings/internal-seed` admin screen. Before this row it
accepted any string containing `@` — no domain restriction, no client restriction.
The allowlist it writes to is consumed globally, at five call sites (suppression,
bounce handling, dispatch re-check, metrics, step-sends), once
`INTERNAL_SEED_ALLOWLIST_ENABLED` is turned on (currently `false` in production).
On-screen copy calls these entries "OpensDoors-internal test inboxes"
(`settings/internal-seed/page.tsx:56-61`), but nothing in code enforced that. Left
alone, a single owner mistake (or a compromised owner session) could add an
arbitrary address that becomes always-deliverable and suppression-exempt for
**every client's outreach**, not just OpensDoors' own test inboxes, the moment the
flag flips on.

This was inert today (`INTERNAL_SEED_ALLOWLIST_ENABLED=false`), so this is
hardening ahead of a future flip, not a live incident. No application behaviour
change for any currently-enabled flow.

## The fix

The six default seed addresses (`INTERNAL_SEED_DEFAULT_ADDRESSES`, seeded by
migration) are all `@opensdoors.co.uk`, matching the on-screen copy naming — so
that domain is the scope, not an invented one.

- **`src/lib/internal-seed/seed-allowlist-policy.ts`** (pure, no I/O): added
  `INTERNAL_SEED_ALLOWED_DOMAIN = "opensdoors.co.uk"` and
  `isSeedEmailDomainAllowed(email)`, which normalizes the address and compares
  its domain via `extractDomainFromEmail` (exact match, not a substring/`endsWith`
  check — so `attacker@opensdoors.co.uk.evil.com` is rejected, not matched).
- **`src/server/internal-seed/seed-allowlist.ts`**: `upsertInternalSeedAddress`
  now calls `isSeedEmailDomainAllowed` immediately after the existing
  blank/shape check and returns `null` (the function's existing "rejected"
  contract — same as today's blank-email case) for anything off-domain, before
  any Prisma call.
- No schema change, no migration, no UI change. The write action
  (`addInternalSeedAddressAction`) already silently no-ops on a `null` return
  (pre-existing behaviour for a blank/invalid email); a rejected off-domain
  address behaves identically. Surfacing an on-screen error for a rejected add is
  a separate, smaller UX gap — not raised as its own row since it doesn't change
  whether the scope is enforced, just how visibly.
- Client scoping (the row's alternative option, "or explicitly to the `bidlowai`
  test client") was not used: `InternalSeedAddress` has no client relation at
  all — it is a flat, global table by design (it exempts an *address*, not a
  client's outreach) — so a domain restriction is the correct, minimal scope
  here, and is also what the on-screen copy already promises.

## Proof it fires (red first)

New `src/server/internal-seed/seed-allowlist.test.ts` (mocks `@/lib/db`, no real
database):

- Confirmed **red** before the fix: `prospect@acme.com` and
  `attacker@opensdoors.co.uk.evil.com` both returned a written row and called
  `prisma.internalSeedAddress.upsert` — captured in this cycle's terminal output
  before the code change (`AssertionError: expected {...} to be null`).
- **Green** after the fix: both cases return `null` and `upsert` is never called;
  a same-domain address (`Adam@OpensDoors.co.uk`, mixed case) still normalizes
  and writes correctly; the pre-existing blank/invalid-string rejection is
  unchanged.

Also extended `src/lib/internal-seed/seed-allowlist-policy.test.ts` with direct
unit tests of the new pure `isSeedEmailDomainAllowed`: all six defaults pass,
`acme.com`/`bidlow.co.uk` are rejected, the lookalike-suffix case is rejected,
case-insensitivity and blank/null/undefined inputs are covered.

## Gates

- `npm run lint` — 0 errors.
- `npm run typecheck` (`tsc --noEmit`) — 0 errors.
- `npm test` — 387 files / 3973 tests, all green (the only failure seen in a
  pre-fix full run was the relay's own `cycle-log-reaches-git.test.ts`, which
  correctly flags this cycle's own not-yet-committed `cycle-220.md` — resolved by
  committing it in this same PR, same pattern as rows 155/156/157).

## Not done in this row, on purpose

- `INTERNAL_SEED_ALLOWLIST_ENABLED` was **not** touched — still `false` in
  production, per the row's explicit instruction. This row is pure hardening
  ahead of that decision.
- No scoring artefact was produced (`.bidlow/GRADES.json` untouched) — the row
  said "DO NOT SCORE ANYTHING."
