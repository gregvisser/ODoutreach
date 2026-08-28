# Cycle 69 - queue item 48 - the two failing do-not-contact sheets

**Outcome: PARTIAL 69. One sheet fixed and proven, one sheet correctly refused
and now waiting on Greg. No code changed, because none needed to.**

## PR sweep (done first, as instructed)

`gh pr list --state open` returned `[]`. Zero open PRs. Nothing to merge, nothing
left rotting. The landfill the sweep exists to prevent is currently empty.

## The four things, written down before touching anything

1. **Files I expected to change:** none, once reconnaissance was done. The
   reconnaissance WAS the cycle, and that was the right answer.
2. **Red-first test:** not applicable - the tests already existed and were
   already green. Proof-of-firing came from production instead, which is
   stronger. See "Proven to fire" below.
3. **Done looks like:** both real sheets read, and their true row counts
   reported back in numbers Greg can check against his own spreadsheets.
4. **Must not touch:** anything that writes. No real sync, no shrink
   confirmation, no schema, no send.

## The thing the brief got wrong, and it matters

The queue row and `DNC-SHEET-RANGE-FIX.md` are both written as if the fix is
still to be built - "the fix is to stop guessing", "add the `sheetRange` input
the UI has never rendered". **All of it was already built, merged and deployed
before this cycle started.** `suppression-sync.ts:183-185` already calls
`resolveDefaultSheetRange(await readSheetTabTitles(spreadsheetId))`; the replace
guard already refuses inside the transaction, before the delete; the range input
already exists. Live commit `db4b301`, confirmed by hash against
`app-opensdoors-outreach-prod.azurewebsites.net/api/build-info`, not the CDN
domain and not liveness.

What NO cycle had done is the sentence the row ends with: *"Done means both real
sheets synced and the true row counts reported - not a green test."* Cycle 68 was
killed at 45 minutes trying. That gap - built, deployed, never actually pressed -
is the seventh instance of this project's worst defect, and it is why the row was
still open with the work finished.

**I have corrected the row and the handover brief rather than working around
them.**

## What I did instead: pressed it, read-only

Two production endpoints, neither of which writes anything:

* `GET /api/internal/suppression/sources` - inventory, database only, no Google
  call, no quota, no write.
* `POST /api/internal/suppression/sync-all {"dryRun":true,"sourceId":"..."}` -
  resolves the tab, reads the Sheet, normalises, runs the guard, then stops
  before the delete. Writes nothing, including the source's own status columns.

Secret read from Azure App Service config via an authenticated `az` session.

### Result 1 - Pareto FM whole-domains: FIXED

```
storedRows: 121   syncStatus: SUCCESS   lastSyncedAt: 2026-08-28T12:53:46Z
dry run -> resolvedRange: 'Domains'!A1:Z50000
           previousCount: 121   wouldWrite: 121
```

Greg verified 0 rows this morning. It now holds **121**, synced at 12:53:46Z -
after the 12:48:11Z deploy. The dry run re-reading 121-for-121 is what makes this
stable rather than a lucky one-off: the stored list is exactly what the sheet
holds. **A client that had no domain protection at all now has 121 domains of
it.**

### Result 2 - Train Hugger whole-domains: THE GUARD REFUSED, AND THAT IS RIGHT

```
dry run -> resolvedRange: 'Domains'!A1:Z50000
           previousCount: 373   wouldWrite: 291   refusedShrink: true
"Sync refused: this would have removed 82 of 373 blocked domains, leaving 291.
 Nothing was deleted - the 373 are still blocked."
```

Both halves worked. The tab resolution read the tab really called "Domains"
(first of two; "Company Names" correctly not read) instead of guessing "Sheet1".
Then the guard did its job: 82 removals is 22% of the list, past the 10% limit,
so the replace refused **before** the `deleteMany`.

**This is the guard firing on live production data against a real client's real
spreadsheet.** The brief said "assume the seventh exists - prove it FIRES, not
that it exists". This is that proof, and it is not a mock. Under the old code
those 82 domains would have gone from blocked to sendable silently on a live
cold-email system - the exact outcome the row was written to prevent.

### Result 3 - the asymmetry is explained

Train Hugger's EMAIL list resolves `'Sheet1'!A1:Z50000`. That sheet really does
have a tab called Sheet1. That is the whole reason the email lists always synced
and only the domain lists broke - the brief noticed the asymmetry but not its
cause.

## Gates

```
npx vitest run src/server/integrations/google-sheets/ src/lib/suppression/replace-guard.test.ts
13 test files passed, 110 tests passed
```

Includes all four tests the row demanded - single-tab sheet with no range, a
two-tab sheet reading the first, a 373-to-0 sync aborting with the 373 intact,
and an explicit range still winning - plus tab-title quoting, the
metadata-failure fallback, and the confirm-shrink path.

Lint/typecheck not run and not claimed: **no source file changed this cycle.**
The only edits are this log, QUEUE.md, and the handover brief. Saying a gate
passed that I did not run is the thing this project refuses to do.

## What is left, and why it is not the next cycle's

Finishing Train Hugger means confirming the shrink, which **unblocks 82 domains a
client put on a do-not-contact list**. That is rule (b), real client data, and it
is precisely the decision the guard was built to hand to a human. No agent should
press it.

**The question for Greg, in one line:** Train Hugger's "Domains" tab holds 291
domains today, we hold 373 stored from before 2026-08-14 - did they deliberately
shorten the list (confirm the shrink, and 82 become contactable), or did rows go
missing from the sheet (put them back, re-sync, nothing is lost)?

Until he answers, the 373 stay blocked. That is the safe direction and it costs
nothing but a few unnecessary blocks.

## What I deliberately did not do

Identifying *which* 82 domains needs the production database. My IP is not on the
Azure Postgres firewall (`connect ETIMEDOUT`). **Opening a production client
database to a laptop for a diagnostic is a worse trade than letting Greg eyeball
two lists**, so I stopped, deleted the throwaway query script and its output, and
left the firewall alone. Temp files removed; working tree carries only the three
record files.

## Estate-wide, as a by-product

34 suppression sources. 32 SUCCESS. Train Hugger whole-domains is the single
ERROR. BidlowAI's two are legitimately 0. Largest lists: Panda Recycling 30,229
emails / 12,795 domains, GreenTheUK 1,829 / 896.

## Open questions: 1

The Train Hugger 291-vs-373 question above. It is Greg's and only Greg's.
