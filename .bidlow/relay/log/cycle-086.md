# Cycle 86 — row 80: AI features, slice 2 — the spend screen

## The PR sweep, first

`gh pr list --state open` returned exactly one: **#358**, opened by cycle 85 and
left with both checks still running. Both had since passed. `--auto` was refused
again (auto-merge is disabled on this repository — cycle 85 recorded this and it
is still true, so the sweep must watch and merge by hand). Merged at 04:03,
branch deleted, `gh pr list --state open` now returns nothing.

That is two cycles in a row where the sweep found exactly one PR and it was the
previous cycle's own. The structural failure the brief describes is real, and
the sweep is now the only thing closing it.

## Why the spend screen, and not one of items 3–7

Cycle 85's own handover named it first, and the reason survives inspection:
**the ledger was being written and nothing displayed it.** That is half a
billing system. The row's strongest instruction is that Greg must be able to
invoice the API usage, and a table nobody can read invoices nothing. Items 3–7
all add spend; none of them make it billable.

## The four things, written down before anything was touched

1. **Files.** New: `src/lib/ai/spend-summary.ts` (+ test),
   `src/server/queries/ai-spend.ts`, `src/app/(app)/settings/ai-spend/page.tsx`,
   `e2e/ai-spend.spec.ts`. Modified: `src/lib/ai/model-catalog.ts`,
   `src/app/(app)/settings/page.tsx`, `e2e/fixtures.ts`, `e2e/seed-e2e.ts`,
   `e2e/screen-walk.spec.ts`.
2. **Red-first.** `src/lib/ai/spend-summary.test.ts`, written before the module
   existed and watched fail with `Cannot find module './spend-summary'`.
3. **Done, in one sentence.** Greg opens one screen and sees, per client, how
   much AI spend to invoice this month — and how many calls refused.
4. **Not touched.** The send pipeline, suppression, `autonomous-actor-guard.ts`,
   the schema (no migration this cycle), the classification logic itself, and
   every queue row but 80.

## The arithmetic is a pure module because it decides what a customer owes

`summariseAiSpend` is separated from the Prisma query for one reason: the fold
from ledger rows to a bill is the part that can be wrong in Greg's favour or
against it, and it should be testable without a database. Fourteen unit tests,
each describing a way the number comes out wrong:

* **Bill the CLIENT, not the slug.** The ledger stores the slug as it was at the
  moment of the call. A workspace renamed mid-month would invoice as two
  customers if the fold keyed on that string.
* **Never drop a hard-deleted workspace.** `clientId` is `onDelete: SetNull`, so
  a deleted client leaves rows with a null id. The money was still spent.
* **Keep two deleted workspaces apart.** Both have a null id; folding on the id
  alone merges the whole estate into one nameless invoice line.
* **Refusals and errors are calls with no cost.** Today, with no API key in
  Azure, production is entirely refusals — "0 calls" and "480 refused" mean
  opposite things and the screen has to show the difference.
* **Deterministic order.** Largest bill first, ties broken by name then key. A
  table that reshuffles between renders is one nobody trusts a number from.

## The prices are STILL unverified, and this is the thing blocking an invoice

Cycle 85 could not reach the published price list because `WebFetch` was denied.
**The same happened this cycle:** `WebFetch` was denied, and so was the
`claude-api` skill, which exists precisely to answer this question. So the rates
in `model-catalog.ts` remain from model knowledge, which is what the engineering
standard forbids for anything feeding a real-world action.

Rather than let that quietly age into "the numbers are fine", this cycle made it
structural and visible:

* `isRateVersionVerified(version)` was added, backed by an **empty** set of
  verified rate versions. Unknown versions read as unverified, so the failure
  direction is safe.
* It is a set of VERSIONS rather than one boolean on purpose. The ledger is
  historical: when corrected prices ship, last month's rows still carry the old
  version and must still be flagged, while this month's are sound. A single
  boolean would go green the moment the current rates were checked and imply the
  old invoices had been checked too.
* The screen carries a banner: **"Do not invoice these amounts yet."** It says
  the token counts ARE exact — they come from the API — and that the rates used
  are stored per row, so every figure recomputes once the prices are confirmed.

**Owed, and it is now a two-minute job for anyone with a browser:** read the
per-MTok prices at `docs.claude.com/en/docs/about-claude/pricing`, correct
`RATES` (adding a new `RATE_VERSION` if they differ), add the version string to
`VERIFIED_RATE_VERSIONS`, set `RATES_VERIFIED` true. The banner disappears by
itself.

## Proven to fire — by watching it go red, with the build rerun

The brief says to assume the seventh exists. A spend table is the perfect shape
for that defect: an empty table looks identical whether the query works, returns
nothing, or throws and gets swallowed, and the screen-walk would still pass
because an `<h1>` rendered.

So nine ledger rows with deliberately odd, exact figures are seeded into the e2e
database — 3 charged + 4 refused + 1 failed on workspace A, 1 charged on
workspace B, totalling **$2.00** — and `e2e/ai-spend.spec.ts` asserts those
figures on the rendered page against a real Postgres and a real production
build.

Then the wiring was deliberately broken (`summariseAiSpend` handed an empty
array whenever the query returned rows), **the build was rerun**, and:

```
4 failed
  › shows what each client owes, read from the usage ledger
  › shows refused and failed calls, so a switched-off feature is not mistaken for a quiet one
  › warns that the prices behind the cost column are unverified
  › a hand-typed month falls back to the current bill instead of erroring
2 passed
```

The two that stayed green are the empty-month case and the staff-denied case,
both of which correctly expect nothing on screen. Restored, rebuilt, and 37 e2e
green: the 6 new specs plus all 31 screen-walk screens including the new one.

## Frozen boundaries — three amendments, all additive

`e2e/fixtures.ts`, `e2e/seed-e2e.ts` and `e2e/screen-walk.spec.ts` are all frozen
rules, and the gate blocked each edit until an amendment was recorded. Every
amendment is written up in `.bidlow/FROZEN.json` attributed to
`Claude (agent), relay cycle 86, for Greg's review`, matching the precedent set
by cycles 49 and 52. All three are strictly additive: **no existing fixture,
count, id, expected value or assertion was changed or removed**, so nothing that
was already being proved moved.

`e2e/seed-e2e.ts` carries two amendment entries for one change, because the gate
re-blocks a file after each edit; the second entry carries the final hash and
the full description.

One deliberate departure inside that seed: the AI rows are
`deleteMany`-then-`createMany` rather than upserted, unlike every other write in
the file. The spend query is month-bounded, so an upsert would preserve the
original `createdAt` and the rows would silently fall out of range on any
database that outlived a month boundary — a spec failing for a reason that has
nothing to do with the code. The delete is narrowed to the fixture's own id
prefix and sits behind `assertSafeTestDatabase`.

## Tenant isolation got its own assertion, because this screen has none

`/settings/ai-spend` is cross-client by design — it exists so one person can
raise one invoice — so it deliberately does NOT go through
`getAccessibleClientIds` the way tenant-scoped screens do. The
`staff.isSuperAdmin` check IS the boundary, and it runs before any query. That
made it worth its own e2e case rather than an assumption: signed in as ordinary
staff, the page shows "Only the owner account can see AI spend across clients"
and neither a client row nor a total exists in the DOM.

## No migration, no schema change, nothing sent

Nothing in this cycle touches the database schema, real client data, or anything
that could cause an email to be sent. None of the three stop-and-ask conditions
applies, so the PR was merged on green CI as the brief directs.

## Gates

* `npm run lint` — clean.
* `npm run typecheck` — clean.
* `npm test` — **3288 passed, 325 files** (up from 3264 / 323).
* `npm run build` — green.
* `npx playwright test e2e/ai-spend.spec.ts e2e/screen-walk.spec.ts` — **37 passed**.
* `npx vitest run relay/` after editing QUEUE.md — 156 passed, so the queue still
  parses through the real watcher parser.

## Open questions — 2, and both are Greg's because both are money

1. **Set `ANTHROPIC_API_KEY` in Azure App Service config?** Still unset. Until it
   is, every inbound reply refuses, the new screen honestly shows all-refused,
   and zero replies are classified. Setting it starts real billable spend.
   Carried forward from cycle 85 unanswered.
2. **Who checks the per-token prices?** Two cycles have now been denied network
   access to the published price list. Until someone reads it, the cost column
   is an estimate and the screen says so. Everything else needed to invoice is
   in place.
