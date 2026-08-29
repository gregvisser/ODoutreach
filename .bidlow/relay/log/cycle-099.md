# Cycle 99 — queue item 88: re-grade CR-07, do not rebuild

## What the item said

`.bidlow/GRADES.json` still recorded CR-07 OPEN — "there is no terms of service
and no privacy policy anywhere in the product" — but PR #302 (merged
2026-08-28) shipped `/privacy` and `/terms`, live and public. The instruction
was narrow: re-grade honestly, close CR-07 with evidence, recompute the
weighted total, restate the sell gate, and touch nothing else. Not a rebuild.

## PR sweep first

`gh pr list --state open` → `[]`. Nothing to merge.

Four relay bookkeeping commits (`cc37037`, `f5dc9d4`, `e54b6b4`, `697768d`)
were sitting on local `main`, ahead of `origin/main`, from prior cycles —
docs(queue)/chore(relay) commits that were never pushed through a PR. `git push
origin main` confirmed why: branch protection rejects a direct push
(`GH006 — 2 of 2 required status checks are expected`), since no CI ever ran
against those commit SHAs outside a PR. This is not a defect in this cycle's
work; it is pre-existing state inherited at cycle start. It gets reconciled in
the same branch/PR this cycle opens, since it cannot conflict with anything —
docs-only, no app code.

## The files changed

- `.bidlow/GRADES.json` — CR-07 OPEN → CLOSED with evidence and `closed_on`;
  dimension 10 (Commercial mechanics) 5 → 7; `customer_ready.score` 7.4 → 7.5;
  `weighted_total` 7.42 → 7.50; `sell_gate.note` rewritten to name what is
  actually left.
- `CUSTOMER-READY-REPORT.md` — synced to match: headline score, scorecard row
  10, top-blockers list, fix-to-ready checklist.
- `.bidlow/relay/QUEUE.md` — row 88 → `DONE 99`.

**Not touched, deliberately:** CR-08, CR-01b, CR-09 — all three remain OPEN on
their own rows, exactly as the brief required. No application code changed.

## The red-first substitute

This is a records-correction, not a behaviour change, so there is no code
path to watch go red→green. The honest substitute used here: **verify the
claimed fix live, independently of the merge record, before writing anything
down.** Before touching `GRADES.json` I did not assume PR #302's diff was
enough — I fetched the actual running product:

```
GET https://opensdoors.bidlow.co.uk/privacy                              → 200
GET https://opensdoors.bidlow.co.uk/terms                                → 200
GET https://app-opensdoors-outreach-prod.azurewebsites.net/privacy       → 200
GET https://app-opensdoors-outreach-prod.azurewebsites.net/terms         → 200
GET https://app-opensdoors-outreach-prod.azurewebsites.net/api/build-info
  → commit 3bdf6f5ac815a350fe7e2a10ba4671df004c62ff (current, post-#302)
GET https://opensdoors.bidlow.co.uk/sign-in                              → 200, no session
  → footer contains href="/privacy", href="/terms"
```

Both pages render real, substantive content written from the actual code
behaviour (retention, ContactUniverse survival past a client purge, per-client
suppression, open-tracking defaults) — not a stub, not lorem ipsum. That rules
out the "placeholder content" hard cap from the customer-ready-audit rubric.

**What kept this from a full 8–10 on dimension 10, and why:** both pages carry
an on-screen amber notice, `data-testid="legal-draft-notice"`: *"Draft — not
yet reviewed, and not legal advice."* That is real and honest — the content
was written by describing what the software does, not invented — but it is
also a customer-visible caveat on a commercial document. A prospect or an
OAuth reviewer landing on `/terms` sees, in the same view, "here are our
terms" and "these aren't final." Scored 7, not higher, on that basis. This
follows the same discipline cycle 62 used when it closed CR-06 without
inflating dimension 8: closing a blocker's root cause is not automatically
worth the full point range the dimension allows.

## Why the total only moved 0.08

Weighted arithmetic: dimension 10 carries weight 4 out of 100. Moving it from
5 to 7 is +2 × 4 = +8 on the 0–1000 scale, i.e. +0.08 on the 0–10 scale.
7.42 → 7.50. The queue item's own arithmetic estimate ("roughly 8.1" if CR-06,
CR-07 and CR-08 all closed together) was never a promise that CR-07 alone
would close the gate — and it doesn't. The sell gate is unchanged:
**NOT SATISFIED.** Distance to 8 is now 0.5, down from 0.6.

## What is actually left, named rather than hedged

- **CR-08** — a raw correlation cuid, ungated, on the outbound email detail
  page (dimension 3, weight 10). Cheapest remaining fix per the report's own
  ordering — one gated field.
- **CR-01b** — the bounce path has never been *observed* firing in production
  (dimension 9, weight 6). Structurally fixed since cycle 39; nothing has sent
  since 3 July so there is no real NDR to observe. **No cycle can close this.**
  Rule (c) is absolute: nothing may cause an email to be sent to prove it.
- **CR-09** — mobile/responsive has never been checked, on any pass to date;
  it is folded into why dimension 4 is held at 8 rather than higher.

## Gates

```
npm run lint       → 0 errors
npm run typecheck  → tsc --noEmit, 0 errors
npm test            → 348 files, 3643/3644 passed
```

The one failure, `sentry-config-wiring.test.ts` > "hands Sentry a client that
will not collect prospect data", timed out at 5000ms under the full suite's
parallel contention. Re-run alone: **passes in 401ms**, well inside budget —
confirmed environmental, not a regression. This cycle changed zero application
code (only `.bidlow/GRADES.json`, `CUSTOMER-READY-REPORT.md`,
`.bidlow/relay/QUEUE.md`), so there is no code path here that could have
caused it. Same defect *class* row 87 fixed (a merge-blocking test sensitive
to contention) but a different file and not this row's scope — named here so
the next cycle does not have to rediscover it, not fixed here because it
belongs to whichever row actually touches that file.

## What Greg needs to know

**Zero.** Nothing here needs him — a records correction, verified live,
recomputed honestly, no schema, no migration, no client data, no email. The
sell gate is still not open; what is left to open it is named above, and one
of the three items (CR-01b) cannot be closed by any cycle at all.
