# Cycle 59 — the grade, the gate, and the two things that only fire in pairs

Queue item 40: Phase 2, build steps (1) the four-at-a-time screen gate, (2) the
three-tier grade + autonomous-send toggle with attribution, (3) re-scope
`autonomous-actor-guard.ts`.

**Outcome: (1) and (2a) shipped in [#306]. (2b) and (3) deliberately held.**

---

## The PR sweep, first, as instructed

Seventeen open. Two were green AND mergeable — merged both:

* **#291** `chore(gitignore)` — merged.
* **#274** "Report what automatic blocking would do, before it does it" — merged.

Auto-merge is **not enabled on this repository** (`allow_auto_merge: false`), and
branch protection is `strict: true` with `enforce_admins: true`. So
`gh pr merge --auto` is not available and every merge must be
update-branch → wait ~5 min for CI → merge, strictly serialised. That is the
mechanical reason the backlog grows: seventeen PRs is roughly ninety minutes of
pure CI waiting, which no single cycle absorbs alongside its own item.

I also updated **#300** and **#297** (behind, mergeable, E2E previously red for
the Sentry-429 reason that `72a11bd`/`f3ef2ac` fixed on main) so their CI re-runs
against a green base. They were not merged before this cycle ended.

I later got the verification working (`gh api .../contents/...?ref=main`, after
`git show origin/main:path` and PowerShell were both blocked) and **merged #300**
as well — the fix that stops relay cycle logs being gitignored.

**Closed five as superseded, verified rather than assumed:**

* **#243, #262** — main's reconciled QUEUE.md already records those cycles DONE.
* **#256, #264, #269** — main's `STATE.md` is at **cycle 47**; these record
  cycles 24, 28 and 32, so merging would have written an *older* state file over
  a newer one. A regression, not a record.

Each carries a comment explaining why, so the next cycle does not re-derive it.
**17 open at the start, 10 at the end.**

### The trap I walked into, recorded because the next cycle will meet it

**Merging #300 introduced duplicate row numbers 37/38/39 into main's QUEUE.md.**
#300 carried the *pre-reconciliation* queue, and cycle 58 had already re-homed
those same nine rows at 53–61. I caught it resolving the merge, checked all nine
against 53–61, found every one already present, and **dropped the incoming block
rather than renumbering it** — which is what this file's own header instructs.

I had first renumbered them to 43–51, which would have duplicated nine rows of
content under new numbers. That was wrong and I undid it. Worth recording that
the wrong instinct was the *tidy-looking* one.

**The lesson: a "docs-only" PR is not conflict-free with another docs-only PR.**
The brief says to take docs PRs first because "they cannot conflict with code" —
true, but they collide with *each other*, and QUEUE.md is exactly where that
bites. Check any PR touching QUEUE.md against the reconciled row list first.

### Why the backlog grows — the mechanical cause, measured

**Auto-merge is disabled on this repository** (`allow_auto_merge: false`), and
branch protection is `strict: true` with `enforce_admins: true`. So
`gh pr merge --auto` is unavailable and every merge is
update-branch → wait ~5 min → merge, strictly serialised: roughly ninety minutes
of pure waiting for seventeen PRs. No cycle absorbs that alongside its own item.
**The cheapest real fix is enabling auto-merge — a settings change, not code.**

### The structural finding worth carrying forward

**#306 turned out to be stacked on cycle 58's own unmerged work.** Cycle 58
committed the queue reconciliation to `docs/queue-reconcile-phase2`, pushed it,
and **never opened a PR** — so it was already rotting when this cycle started.
Branching from it means #306 carries those three commits too, which is fine and
lands them. But it is the exact failure the brief describes, committed by the
cycle that wrote the warning about it.

---

## What shipped

### The grade

`CORPORATE` / `MID` / `STANDARD` on the client account card, with the signature
the owner asked for **by name**:

> "there has to be a signature shown who switched the toggle and who set the
> grade of the customer."

Rendered **next to the control** — "Set to Corporate (VIP) by Sophie, 28 Aug
14:02" — not only in a log. The stamp on the client is the latest decision; the
`auditLog` row (following `bounce-suppression.ts`) is every decision. Both,
because overwriting the stamp must never lose the history.

Timestamp built from UTC parts, not `toLocaleString` — this repo has already
shipped a hydration mismatch on exactly that.

### The gate

Four at a time, per mailbox, 45 minutes between groups. A pure decision in
`src/lib/outreach/manual-send-window.ts`, wired into the real dispatch loop via
`src/server/email-sequences/corporate-release-gate.ts`.

It lands as a `Math.min` against the allowance the dispatcher already computed,
so **no input can let a mailbox send more** than the daily cap, warm-up ramp and
pacing gate already allow. It slices; it never adds.

`send-pacing.ts` is **untouched**, as the brief demanded. Worth recording why the
warning was justified: `Client.sendBatchSize` already exists and its schema
comment literally says *"the '4 at a time' the client was promised"*. A cycle
skimming for "four at a time" would have found that field and edited the machine
dispatch layer instead of building the screen gate. Different layer, different
actor.

---

## The seventh instance, and it was mine

The brief said to assume the seventh exists. It did, and it was this log.

I wrote `cycle-059.md`, ran `git add -A .bidlow/`, committed, pushed — and the
file **was silently dropped**. It never appeared in #306's file list.
`.gitignore:107` ignored `/.bidlow/relay/log/`, so `git add` skipped it without
a word and the commit reported success.

That is queue row 54's defect reproduced live, by the cycle that had just merged
its fix. I only noticed because I checked #306's actual file list against what I
thought I had committed, rather than trusting the commit.

**Worth generalising: `git add -A` followed by a successful commit is not
evidence that a file is in the commit.** It is the same shape as everything else
on this project's list — the operation reports success and does nothing.

## A defect I found in my own wiring

Reviewing the dispatch loop after the first commit: when the gate held a mailbox
at zero, the blocked reason fell through to **"No mailbox capacity remaining in
this UTC day"** — which is false. The mailbox has plenty of capacity; it is
forty minutes into a forty-five-minute wait.

That is precisely what the spec forbids: it asks for an honest state on screen
because *"it shows the owner the product refuses to do the unsafe thing."* An
operator told "no capacity" goes hunting for a problem that does not exist.
Fixed in a follow-up commit with `heldByCorporateGate`, named ahead of the
pacing and cap reasons because it is the most specific and most temporary.

## Proving it fires, not that it exists

The brief said to assume the seventh instance exists. So:

The gate test was run **RED first** against a deliberately permissive
implementation: **7 of 10 failed**, and the 3 that passed were exactly the
ungated cases that *should* pass against a permissive gate — which is what makes
the red meaningful rather than decorative. Restored, 10/10.

`corporate-release-gate.test.ts` proves the wiring, including the inertness
claim the hard way: it asserts an ungraded client **does not even query the
database**. "Inert for other clients" is a claim that is usually asserted and
rarely tested.

All four spec assertions covered: 30 exposes exactly 4; the 5th needs BOTH 4
sends and 45 minutes; the 5th stays shut after 45 minutes if only 3 went; two
mailboxes hold independent clocks.

---

## Two decisions I made rather than stalling

**1. Steps (1) and (2) shipped together.** The build order says (1) first because
it can only slow sending down. But the gate is *"just for corporate clients"* —
it cannot fire without the grade. Shipping (1) alone would have produced exactly
the artefact this project keeps producing: built, wired, reporting success,
never firing. So the unit that shipped is "the gate **and** the grade that drives
it".

**2. Steps (2b) and (3) held, for the same reason inverted.** The
autonomous-send toggle and the `autonomous-actor-guard.ts` re-scope only fire as
a pair — a toggle nothing consults is the same defect wearing different clothes.
Better as one honest next cycle than as two half-cycles.
`autonomous-actor-guard.ts` is untouched and still enforces bidlowai-only.

**3. The pool/mailbox reconciliation.** The owner described staff hand-working a
list from ONE mailbox; this app distributes a launch across a mailbox POOL. The
two models had to be reconciled and it is not Greg's call (not money, not a
client relationship, not one of the three named). Decided: **the gate applies per
mailbox.** For a one-mailbox client — the case being described — the behaviour is
exactly as asked; with several, each holds its own clock, which is what "the
clock is per mailbox, per account" says literally. The alternative (4 across the
whole account) would make a second mailbox pointless.

---

## Gates

| gate | result |
|---|---|
| `npm run lint` | clean |
| `npm run typecheck` | clean |
| `npm test` | **2772 passed**, 283 files, 19 new |

Migration is purely additive — 1 enum, 3 nullable columns, 1 FK to the existing
`StaffUser`, 1 index. Dropping all of it restores today's behaviour exactly, so
it is mine to merge under the brief's own test.

## Merged, deployed and verified live — by hash, not by prediction

#306 merged as **`afa5471620a5851f5caf9223324ae28b9553bb97`**.

Deploy run [33147696909](https://github.com/gregvisser/ODoutreach/actions/runs/33147696909)
green, **including the "Prisma migrate deploy (production database)" step** — so
the additive migration is applied to the live client database.

* `GET /api/build-info` on the **direct App Service URL** (never the CDN-cached
  custom domain) → `commit: afa5471620a5851f5caf9223324ae28b9553bb97`. Exact
  match.
* `GET /api/health` → `ok: true`, `database: ok`.
* The same response carries `autonomousRelay: {active: true,
  allowlistedClients: 1}` — independent confirmation that
  `autonomous-actor-guard.ts` is untouched and still bidlowai-only.

**Nothing was sent and no client data was touched.** The gate is inert until
someone grades a client CORPORATE, and nobody has. The live behaviour change so
far is exactly zero, by design — which is the honest way to ship a gate.

---

## Open questions: 2

1. **Does the four-at-a-time gate need to bite on the SCREEN as well as the
   dispatcher?** It now caps what a launch actually releases, which is the half
   that governs real email. The panel still displays aggregate counts rather
   than individual recipients, so "only displays 4" is satisfied in effect but
   not literally in the UI copy. Worth a decision before anyone demos it.
2. **Should `MID` and `STANDARD` differ at all?** They are currently identical in
   behaviour and only differ as a commercial label. That is honest, but if the
   owner expects MID to mean something operationally, it needs saying now rather
   than after the tiers are in use.
