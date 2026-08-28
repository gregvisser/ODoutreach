# Cycle 67 - queue item 48

The two do-not-contact sheets. **The counts are in, and the fix that was
supposed to close this row had broken something else on its way past.**

## PR sweep

`gh pr list --state open` returned `[]`. Nothing to sweep - cycle 66's #319 and
#320 both landed. The landfill is, for once, empty.

## What was already done before this cycle

Most of row 48 was shipped by cycles 65 and 66 and is on `main`:

* `1c002d1` (#316) - resolve the sheet's FIRST tab instead of guessing
  `Sheet1`, and make the replace REFUSE a shrink rather than warn after it.
* `aa7540d` (#319) - per-sheet outcomes, a `dryRun` that writes nothing, and
  `.github/workflows/dnc-sheet-dry-run.yml` to call it.

The brief's "done" was never the code. It was: **both real sheets synced and
the true row counts reported.** That is what was left.

## The thing worth reading

Cycle 66 built the measuring tool, **fired it twice, and both runs went red** -
then it hit the 45-minute kill before it could look at why. The runs were
sitting there in Actions the whole time. Reading them first was the cycle.

They said two things.

**The tab fix works.** Train Hugger's domain list resolved
`'Domains'!A1:Z50000`, not `Sheet1`. Proven firing in production, not merely
tested. The guard fired too, on live data, and refused to delete 82 domains.

**And five sheets said "Quota exceeded" - including Pareto FM.** The client the
fix was written for was knocked out by the fix.

That is not a coincidence and it is not Google being flaky. Resolving a tab
costs a `spreadsheets.get` on top of the `values.get`. Thirty-four configured
sources therefore went from **34 read requests to 68**, and Google allows
**60 per minute per user** - and the service account is one user for every
client we have. Checked rather than assumed: the cron run at 01:52Z, seven
hours *before* that fix deployed, shows the tab errors and **zero** quota
errors. We did this to ourselves by doubling our own request rate.

Worth naming because it is the shape of the thing: **a correct fix, shipped
green, that silently broke the client it was written for.** The only reason it
surfaced is that cycle 66 had just built a tool that reports per-client instead
of one summed total. The old aggregate would have shown `rowsWritten: 50692`
and looked healthy.

## What was built

`sheets-read-limiter.ts` - paces Sheets reads under the ceiling and retries the
ones that still bounce. Merged as `c92c616` (PR #321).

Three decisions in it that matter more than the pacing:

* **A bad range is NOT retried.** It can never succeed, and retrying it would
  dress a permanently broken blocklist up as a transient blip - which is
  precisely how one stays broken for weeks with nothing ever failing hard.
* **Retries bounded at two.** A sheet still refused after 25s must be REPORTED
  as failing, not hold the request open until it times out and all 34
  blocklists learn nothing.
* **Queued, not merely spaced**, and module-level. The quota is per service
  account, not per request; concurrent callers checking the same last-started
  timestamp would all decide they need not wait, and burst anyway.

Pacing is start-to-start, so it costs the difference between the natural rate
and the allowed one - the sweep went from 50s to ~80s, not 50s + 75s.

## Red-first, and the sabotage

The eleven limiter behaviours were **watched failing** before the module
existed.

The four WIRING tests were written after the code, so they were proven capable
of failing the established way: **unwiring `limitSheetsRead` from the values
read turned exactly two of them red**, and restoring it turned them green.

That check is the one this project keeps missing. Six times this week something
was built, wired, reported success and never fired. A guard existing is not a
guard being called - so under vitest the waits are zero but **the retries
remain**, which is what leaves the wiring observable at all.

## Gates

* `npm run lint` - 0
* `npm run typecheck` - 0
* `npm test` - **3023 passed, 306 files**
* CI on #321 - verify PASS, E2E (Playwright) PASS
* Deployed and **verified by hash on the DIRECT App Service URL**:
  `c92c616` live at 11:45:32Z.

## The measurement - 2026-08-28T11:52Z, against `c92c616`

Zero quota errors. 33 of 34 sheets reporting, up from 29.

| Client / list | Stored | Sheet holds | Tab read |
|---|---|---|---|
| **Pareto FM / Whole domains** | 0 | **121** | `'Domains'!A1:Z50000` |
| **Train Hugger / Whole domains** | 373 | **291** | `'Domains'!A1:Z50000` |

Pareto FM has had **no whole-domain protection at all**, and its sheet has been
holding 121 domains the whole time.

## What was deliberately NOT done, and why

**Neither write was performed.**

* **Train Hugger** needs an explicit "Remove them anyway": syncing it unblocks
  **82 domains** on a live cold-email system. That is the exact decision the
  guard was built to force a *human* to make, and `suppression-sync.ts` says so
  in as many words - "an unattended job must not be the thing that decides
  hundreds of people may be contacted again." I am an unattended job. **This
  one is Greg's**, and it is rule (b).
* **Pareto FM** 0 -> 121 is purely additive - `deleteMany` on 0 rows deletes
  nothing, and it only ever *adds* protection. It still writes a real client's
  data, so I left it to the scheduled sync, which will now apply it: both the
  tab bug and the quota bug that were stopping it are gone.

So the row is **PARTIAL**, not DONE. The counts are reported and the blockers
are cleared; the two writes are not confirmed landed. Next cycle: check Pareto
FM actually reached 121, and put Train Hugger's 82 domains to Greg.

## Open questions: 1

**Train Hugger's sheet holds 291 domains but the database holds 373. Should the
82 be unblocked?** Someone either deleted them from the sheet deliberately, or
the sheet has been edited by hand and lost rows. Until that is answered the 373
stay blocked, which is the safe direction and costs nothing but a few
unsendable domains.
