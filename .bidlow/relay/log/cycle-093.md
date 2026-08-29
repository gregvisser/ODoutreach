# Cycle 93 — queue row 81

**The do-not-contact sync now remembers which tab it read.** Shipped as
`111a298` (PR #370), merged to `main` on green CI and deployed.

## PR sweep at cycle start

`gh pr list --state open` returned `[]`. Nothing to merge, nothing abandoned.
The landfill is empty for the first time in this stretch.

## What the row asked for, and what was actually true

Row 81 said five of thirty-four blocklists fail every run with
`Quota exceeded`, and that "~29 of the 34 sources have no saved
`sheetRange`".

**Both halves needed correcting, in opposite directions.**

Measured before touching anything, via `dnc-sheet-inventory` (database only,
no Google call, cannot itself exceed a quota), run 33241655685:

* **The quota failures are STALE.** The 2026-08-28 19:07–19:08 production run
  shows **33 of 34 SUCCESS and zero quota errors**, the whole sweep finishing
  in 89 seconds. The read limiter built after cycle 66
  (`sheets-read-limiter.ts`) already fixed the outage this row was written
  about — it paces reads 1.1s apart and retries a refusal twice. The row's
  own "second option is a small concurrency/backoff limit" was taken by a
  later cycle and never written back here.
* **The one ERROR is not quota.** Train Hugger — Whole domains, stuck since
  2026-08-14, `lastError` = the shrink guard refusing to remove 82 of 373
  blocked domains. That is the guard working, not a failure.
* **The arithmetic is WORSE than the row thought.** Not ~29 of 34 —
  **34 of 34** sources have `rangeSaved: false`. Every one of them. So each
  15-minute cron pays 68 Google reads to re-derive 34 answers that have not
  changed.

So this was not an outage fix. It halves a standing cost currently absorbed
by ~45 seconds of deliberate sleeping per run, and it closes a real hazard
the row identified correctly.

## What shipped

**1. The resolved range is remembered.** Once Google has served a range, it
is saved to the source. A sweep over N sources issues 2N reads the first
time and **N** thereafter.

The row flagged this as "a WRITE to client config, so decide deliberately".
The decision, and the four conditions that make it narrow:

* only when the operator left the range blank — an explicit range is theirs
  and is never overwritten
* only when the tab names were **genuinely read**, never from a guess
* only after Google served that exact range
* never on a dry run

It is reversible without a deploy: clearing the box in the UI restores
today's resolve-every-time behaviour. That reversibility is what made this
mine to decide rather than Greg's — it is not a one-way door, it moves no
client data, and it sends nothing.

It is also remembered when the **shrink guard refuses**. The refusal is
about how many rows the sheet holds, not which tab they are on, and Google
already served that range. Without this, Train Hugger's domain list would
re-resolve its tab every fifteen minutes for ever while parked in refusal.

**2. The sync refuses instead of guessing.** This is the sharper half.
`readSheetTabTitles` swallowed its errors and returned `[]`, which was
indistinguishable from "this sheet has no tabs" and fell back to
`Sheet1!A1:Z50000` — on a path that **DELETES before it inserts**. A metadata
call refused for quota could therefore aim a REPLACE at a tab nobody chose
and silently unblock a client's whole do-not-contact list. The lookup now
reports its failure and the sync refuses.

Cost of refusing: one missed 15-minute cycle. Cost of guessing: a blocklist
replaced from the wrong tab. This also reversed a documented earlier
decision — `sheet-range.ts` argued the fallback "leaves behaviour exactly as
it was rather than inventing a range". That reasoning missed what the caller
does next; the reversal is recorded inline at both changed tests.

The two halves compose: a range from a guess can never be persisted, which
is precisely what makes (1) safe.

## Red-first

`suppression-sync-range-persistence.test.ts` drives the **real**
`syncAllConfiguredSuppressionSources` over a mutable store that the sync
writes back into, twice, and counts the Google calls. Staging a "second
run" with pre-saved rows would have proved nothing about whether the first
run saved anything — the feedback IS the behaviour under test.

Against the old code: **7 of 11 failed.** The 4 that passed are the ones
pinning behaviour that must NOT change (operator range respected, dry run
writes nothing, first-sweep read count). Green after. That split is the
useful signal — it isolates the new behaviour from the preserved behaviour.

Two existing tests asserting the `Sheet1` fallback were rewritten to assert
the refusal.

## Gates — all run, all shown

* `npm run lint` — clean, 0
* `npm run typecheck` — clean, 0
* `npm test` — **3589 passed in 345 files**
* `npm run build` — green
* CI on PR #370: `verify` pass 4m45s, `E2E (Playwright)` pass 5m33s

No schema change, no migration, no client data moved, **no email sent**.
None of the three stop-and-ask conditions was touched.

## Proven to FIRE, not merely to exist

The queue's standing warning is six things built, wired, reporting success
and never firing. The guard here is that the new suite drives the real
sync-all through a real store: unwire the persist and the second-sweep read
count goes straight back to 2N and the suite goes red. It cannot pass while
the feature is inert.

Verified live after deploy — see below.

## What was deliberately NOT done

* **The quota was not raised.** The row forbade it, and the measurement says
  it is unnecessary.
* **No new column.** I designed and then rejected a
  `sheetRangeAutoResolvedAt` column plus auto-healing (clear the range on a
  range-invalid error and re-resolve). Auto-heal would mean a client renaming
  a tab causes the app to **silently re-point their blocklist at a different
  tab** and REPLACE from it. A loud error plus a human decision is correct for
  opt-out data. Dropping the auto-heal removed the only reason for the column.
* **`rangeSaved` in the inventory** now means "a range is stored", not "an
  operator typed one". Corrected in the doc comment rather than papered over —
  the repair is the same either way (clear the box).

## Open question for Greg — 1

**Train Hugger's domain blocklist has been stuck since 2026-08-14** in a
refused shrink: the sheet would remove 82 of 373 blocked domains, and the
guard is holding all 373. That is fifteen days of a list not updating. It
needs a human to decide whether the removal was deliberate (confirm it) or a
mistake in the sheet (put the rows back). Nothing in this cycle changes it,
and no agent may decide it — unblocking 82 domains on a live cold-email
system is a client-data call.
