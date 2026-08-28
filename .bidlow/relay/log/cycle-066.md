# Cycle 66 — row 48: the guard refused, and it was right to

**Outcome: the measurement half is built, deployed, verified by hash, and RUN
twice against the 34 real sheets. The counts are in. One of them says this
row's instruction would have caused the disaster the row was written to
prevent. Merged as `aa7540d` (PR #319). Row marked `PARTIAL 66`.**

## The headline, before anything else

Row 48 says Train Hugger's whole-domain list "is serving 373 STALE rows", and
that reading the sheet's real first tab "fixes both clients".

Measured, twice, on production:

| | stored in the database | in the sheet's real `Domains` tab |
|---|---|---|
| Train Hugger — whole domains | **373** | **291** |

The database holds **82 domains the sheet does not**. The 373 were not stale in
the direction the row assumed — they were the *more protective* number. Doing
what row 48 instructed would have replaced 373 with 291 and **silently
unblocked 82 organisations on a live cold-email system.**

It did not happen, and the reason is worth being precise about: *the diagnosis
did not save it, the guard did.* Cycle 65 built a replace that refuses a shrink
beyond 10%, and this is it firing on real client data the first time it was
ever asked:

```
Train Hugger — Whole domains: Sync refused: this would have removed 82 of 373
blocked domains, leaving 291. Nothing was deleted — the 373 are still blocked.
```

Both cycles' briefs, and my own reading of them, expected that sync to be
routine housekeeping. It was one confirmation click away from being the worst
outcome this product has. The lesson is not "the brief was wrong" — briefs are
written from the outside and being wrong is their normal condition. It is that
**the guard was the only component that had actually looked at the data.**

## The other two numbers

**Pareto FM — whole domains: 0 stored, 121 in the sheet, tab `'Domains'`
resolved correctly.** Cycle 65's fix works exactly as designed. This client has
121 domains of protection currently missing, and the write is purely additive —
there is nothing to delete.

**The tab resolution did not regress anyone.** All 29 other sources resolved to
`'Sheet1'` because their first tab is genuinely called Sheet1. The change only
ever moved the two sheets it was meant to.

## What was actually built, and why it was needed

The PR sweep found nothing — `gh pr list --state open` returned `[]`.

Cycle 65 had already shipped the fix (PR #316, `1c002d1`, live). So the work
was the row's other half: *"done means both real sheets synced and the true row
counts reported"*. That could not be done, for a structural reason rather than
a bug:

* **`SuppressionSyncAllResult` carried totals only.** `succeeded`, `failed`,
  and one summed `rowsWritten` across all 34 sources. A working sheet vanished
  into the total; a broken one appeared only as a sentence in `errors`. The
  production run cited in QUEUE.md reported `rowsWritten: 50692` and **not one
  row of it could be attributed to a client.** A blocklist is per-client by
  definition, and "Pareto FM has no protection" is exactly what an aggregate
  hides.
* **There was no way to ask without writing.** The sync is delete-then-insert,
  so measuring a blocklist and changing it were the same action. "How many rows
  does Train Hugger's sheet have?" could only be answered by pressing the thing
  that deletes Train Hugger's rows.

So: per-sheet outcomes (client, list, tab read, rows stored, rows written), and
a `dryRun` that resolves, reads, normalises and runs the guard, then stops.

It routes through `syncSuppressionSourceFromGoogle` rather than a separate
preview function on purpose — **a preview that resolved the tab, deduped or
applied the public-suffix rule differently would predict nothing.** It writes no
rows, no `lastSyncedAt`, and no status columns either: asking a question must
not leave the Sources screen looking like a failed scheduled sync.

Then `dnc-sheet-dry-run.yml`, because the dry run could not be *called* — the
route is bearer-gated on `PROCESS_QUEUE_SECRET`, which lives in GitHub Secrets
and Azure config and is correctly not readable from a workstation. GitHub holds
the secret; I never see it.

## It had never fired

Worth recording, because it is this project's signature defect and it caught me
too. The fix deployed at 10:20Z and I nearly reported it as working on that
basis. It had never run: the cron that drives it (`*/15 7-18`) **last executed
at 01:52Z, before the deploy, and silently skipped every slot that morning.**
Cycle 65 shipped a correct fix into a job that was not running. Deployed is not
fired, and the only thing that separated those two here was dispatching it by
hand and reading what came back.

## Proving the tests could fail

The dry-run and per-sheet assertions were **red-first**: fifteen watched failing
before a line was written. The one that passed from the start is a regression
pin on the totals the cron reads.

The route and workflow guards were written after their code, so they were proven
capable of failing **by sabotage**, which is this repo's established substitute:

| sabotage | test that went red |
|---|---|
| `=== true` relaxed to a truthy check | does not accept a merely-truthy dryRun |
| unreadable body defaults to a dry run | treats an unreadable body as a REAL sync |
| `{"dryRun":true}` becomes an input | the dry-run workflow cannot write, by construction |
| a `schedule:` added | the dry-run workflow is manual, never scheduled |
| checks `.ok` instead of `.dryRun` | refuses to report unless the SERVER confirms it |
| CDN hostname swapped in | reads the direct App Service URL, not the CDN |

Six for six, each turning its own test red and nothing else.

That third row matters more than it looks. A dry run reached by *accident* would
freeze every blocklist while every run stayed green — a quieter version of the
outage this path exists to fix. Hence `=== true` and nothing else, and hence the
workflow re-reading `dryRun` from the **response**: against a build predating
this PR the identical request performs a real sync of all 34 sources, so "I
asked for a dry run" is not evidence of having got one.

## Gates

lint **0** · typecheck **0** · **3008 tests across 304 files** · build exit 0 ·
CI green on #319 (verify 4m40s, E2E 5m18s) · deploy `aa7540d` confirmed live by
hash on `app-opensdoors-outreach-prod.azurewebsites.net/api/build-info`, not the
CDN domain and not liveness.

No schema change, no migration, and **no client data written by this cycle.**

## New finding, queued as row 69

**Cycle 65's fix pushed the sync over Google's read quota.** Every run returns
`failedCount: 5` — a different five each time — with `Quota exceeded … 'Read
requests per minute per user'`.

Arithmetic, not a bug: resolving the real tab costs a `spreadsheets.get` per
source, ~29 of 34 sources have no saved range, so a run went from ~34 reads to
~63 against a 60/minute quota. **This hits the real 15-minute cron, not just the
dry run** — they issue identical reads. A rotating 15% of clients' blocklists
silently fail to update every run, which is the same defect class as the outage
row 48 exists to fix.

There is a sharper edge to it. When the *metadata* call is the one refused,
`readSheetTabTitles` swallows the error and returns `[]`, which falls back to
`Sheet1!A1:Z50000` — so a quota blip can silently aim a REPLACE at the wrong
tab. The shrink guard catches the large ones. That is a backstop, not a reason
to leave it.

## What is left, and why I did not do it

Neither sheet is synced, and both reasons are rules rather than difficulty.

* **Train Hugger needs `confirmShrink`** — a human deciding that 82 blocked
  organisations may be contacted again. That is Greg's under (b) and (c), and
  it is not a close call: it is the single decision this product exists to make
  carefully.
* **Pareto FM is additive** (0 → 121, nothing deleted) and the 15-minute cron
  performs it unattended by design. It needs no decision from anyone — only for
  the cron to run. I did not press it by hand because it still writes a client's
  data and (b) is a stop, not a preference.

**Open questions for Greg: 2.**

1. Train Hugger's whole-domain sheet has 291 domains; the system is blocking
   373. Should the 82 that are in the system but not the sheet be unblocked
   (confirm the shrink), or put back into the sheet? Nothing will change until
   you say.
2. Pareto FM has no whole-domain protection at all and its sheet holds 121.
   Confirm you want that synced and I will let the next cron run take it, or
   press it on your say-so.
