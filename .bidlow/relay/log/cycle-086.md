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


---

## The watcher's own record of this cycle

Everything ABOVE this line was written by the cycle itself, and is kept exactly as the cycle left it. Nothing above was edited, shortened or reordered.

This section is written by `relay-watch.ps1` after the cycle's process has
exited. It is the independent half of the record: the cycle above says what it
meant to do, and this says what actually moved on disk, how long it took, and
how the process ended. Where the two disagree, this half is the evidence.
# Cycle 86 - finished

Work happened. Evidence: a git ref moved, so something was committed; the working tree changed, so files were edited.

Started 2026-08-29 04:02:52, took about 38.3 minutes.
How it ended: exit code 0.

Evidence checked: git refs on every branch, the working tree, and these
files named in the brief: Bidlowbusiness\_odoutreach-handover\PHASE-2-SPEC.md, bidlow/relay/QUEUE.md

## What it was asked to do

# Cycle 86 - queue item 80

This brief was written by the relay itself, off the top of QUEUE.md. Greg has
not read it. If it is wrong, say so in your log rather than working around it,
and correct QUEUE.md.

## The item, verbatim from the queue

> **AI FEATURES - THE HALF THAT NEEDS NO TRACKING. Spec: `C:\Bidlowbusiness\_odoutreach-handover\PHASE-2-SPEC.md`.** In this order of value: (1) reply classification - positive / interested later / referral / not interested / unsubscribe; (2) stop the sequence the instant someone replies; (3) AI writes a whole SEQUENCE (day 1, 4, 9, 16, 25) rather than one email; (4) campaign quality score and critique; (5) AI-chosen send times; (6) rep performance dashboard with AI explaining the differences; (7) best-message-by-job-title. Reply classification first - routing a "yes, happy to talk" to a human within minutes is worth more than every open-count feature on the owner's list combined. **METER THE AI SPEND PER CLIENT FROM THE FIRST COMMIT.** Greg is invoicing the owner for API usage. If model, tokens in, tokens out, cost and client are not recorded on every call as it happens, he cannot bill it and he eats the cost. Retrofitted metering always under-counts. This is a build requirement, not an afterthought. Every existing guardrail applies unchanged: an AI-drafted email is still an email, suppression is still checked at queue AND dispatch, caps and warm-up are still ceilings. *(Cycle 71: this row was numbered 42 in the second, header-less table that used to sit at the bottom of this file. Merging the tables gave it 80 so it would stop sharing a number with a different job.)*

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
  `DONE 86`, or back to `TODO` with a note if you could not do it.

## THE STATUS CELL: SIX WORDS, AND ONLY SIX

The status cell of a queue row MUST BEGIN with one of exactly these six:

    TODO    DONE    BLOCKED    PARTIAL    IN PROGRESS    WONTFIX

Markdown bold around it is fine - `| **DONE 86 - ...** |` reads correctly.
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

* Finished it -> `DONE 86 - <what you did, and the proof>`
* Did some of it -> `PARTIAL 86 - <what is done, what is left>`. PARTIAL
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

Cycle 86 complete. Row 80 is now `PARTIAL 86`.

## PR sweep
One open PR (#358, cycle 85's own, both checks green) — merged, branch deleted. Zero open now. Auto-merge is still disabled on this repo, so the sweep has to watch and merge by hand.

## What shipped
`/settings/ai-spend` — owner-only, linked from Settings. Per client per month: charged / refused / failed calls, tokens in, tokens out, cost, largest bill first, Total row, month picker. Cycle 85 wrote the billing ledger and shipped no way to read it; this is the other half of the queue's billing requirement.

The arithmetic that decides what a customer owes is a pure module (`src/lib/ai/spend-summary.ts`, 14 tests written red-first — watched fail with `Cannot find module`). Each test is a way the number comes out wrong: bill the **client** not the slug (a mid-month rename would invoice one client twice); never drop a hard-deleted workspace (`clientId` is `SetNull`, the money was still spent); keep two deleted workspaces apart; refusals and errors count as calls but never as cost.

## Proven to fire
An empty spend table looks identical whether the query works or is broken. So nine ledger rows with exact figures are seeded into the e2e database and asserted on the rendered page. Breaking the wiring so the screen read an empty ledger — **and rebuilding** — turned 4 of 6 specs red; the two that stayed green are the empty-month and staff-denied cases, which correctly expect nothing. Restored: 37 e2e green.

## Gates
lint clean · typecheck clean · `npm test` 3288 passed / 325 files · build green · 37 Playwright passed · `vitest run relay/` 156 passed (QUEUE.md still parses).

## Deployed and verified by hash
`/api/build-info` on the direct App Service URL returns `de2b9d9bd284b59313ee6fc5a3e5b62ff79ec944` — the merge commit exactly. `/api/health` database ok. No schema change, no migration, nothing sent.

Three frozen e2e boundaries were amended, all strictly additive, recorded in `.bidlow/FROZEN.json`.

**Open questions: 2, and both are yours because both are money.**
1. Set `ANTHROPIC_API_KEY` in Azure? Still unset, so production classifies nothing and the new screen will honestly show all-refused. Carried forward from cycle 85, unanswered.
2. Who reads the price list? `WebFetch` and the `claude-api` skill were denied again this cycle, as in 85 — so the per-token rates are still from memory. I did not fake them: `VERIFIED_RATE_VERSIONS` is an empty set and the screen says "Do not invoice these amounts yet". Token counts are exact and the applied rates are stored per row, so every figure recomputes the moment someone checks. That two-minute browser job is now the only thing between the ledger and a real invoice.

