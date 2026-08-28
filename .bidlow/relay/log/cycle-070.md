# Cycle 70 - row 48, the two failing do-not-contact sheets

## What I found before writing any code

The brief handed to me was **out of date**, and I am saying so here rather than
working around it, as the brief itself asks.

Everything row 48 describes as owed had already been built, merged and deployed
by cycles 65-69: tab resolution (`resolveDefaultSheetRange`), the refusing
replace guard (`replace-guard.ts`), the `sheetRange` input (which the brief says
"the UI has never rendered" - it has, since cycle 65, as a controlled React
component, which is why the brief's `name="sheetRange"` grep missed it), and the
four red-first tests. Production was already serving `06b8a37`.

The PR sweep found **zero** open PRs. Someone had already cleared them.

So the cycle had a choice: declare the row done off someone else's work, or ask
the question the row's own framing invites - "assume the seventh exists" - and
check what the fix does to the clients that were **not** broken.

## The defect that was actually there

`resolveDefaultSheetRange` picked the **first tab, unconditionally**.

That function decides the range for every suppression source with no saved
range. On 2026-08-28 that is **all 34 sources**, of which **32 were syncing
perfectly well**.

Those 32 work precisely because their sheet *does* have a tab called `Sheet1` -
that is why the old hardcoded `Sheet1!A1:Z50000` worked for them for years. If
any one of them keeps `Sheet1` in second place, "read the first tab" would have
silently repointed a **healthy live blocklist** at a different tab.

And the guard does not catch that. `decideSuppressionReplace` refuses a
**shrink** or a **zero**. A substitution of roughly equal size passes - that is
its own documented known limit, written when the change only affected broken
sources. The fix for two broken clients had become a quiet risk to thirty-two
working ones, on the exact failure this row exists to prevent.

## The change

An existing `Sheet1` wins, matched **exactly** (so `Sheet10` does not count);
otherwise the first tab; otherwise the historic default when the metadata
lookup fails.

Every list that reads correctly today reads the identical tab tomorrow. Only
sheets that never had a `Sheet1` change behaviour at all - which is exactly the
two that were broken.

**Files changed:** `src/server/integrations/google-sheets/sheet-range.ts` and
its test. Nothing else was touched.

## Red-first, watched failing

```
AssertionError: expected ''Company Names''!A1:Z50000 to be ''Sheet1''!A1:Z50000
Expected: "'Sheet1'!A1:Z50000"
Received: "'Company Names'!A1:Z50000"
```

Plus an exact-match test (`["Domains", "Sheet10"]` must resolve `Domains`).

## Gates

`npm run lint` 0 · `npx tsc --noEmit` 0 · `npm test` **3044 passed**, 308 files
(3042 before - the two new tests).

## Proven to FIRE in production, not merely to exist

PR #328, CI green, merged, deployed, verified by hash `c64543e` against the
**direct App Service URL**.

Then a **read-only** dry run against the running build (structurally incapable
of writing) - the whole point being that a passing unit test says nothing about
what the live sheets resolve to:

* **All 32 healthy sources resolve `'Sheet1'!A1:Z50000`** - unchanged, which is
  the entire claim of this fix.
* **Pareto FM / Whole domains** - resolves `'Domains'!A1:Z50000`,
  `previousCount 121`, `wouldWrite 121`. Stable. It held **0** before cycle 69.
* **Train Hugger / Whole domains** - resolves `'Domains'` correctly, and the
  guard then refused: *"would have removed 82 of 373 blocked domains, leaving
  291. Nothing was deleted - the 373 are still blocked."*

The DB inventory (read-only, no Google call) independently confirms the stored
counts: Pareto FM 121 SUCCESS, Train Hugger 373 ERROR, 2 empty lists of 34
(both BidlowAI, which is genuinely empty).

## What I deliberately did NOT do

* **Did not run `sync-one-dnc-sheet` on a healthy client.** It writes. Proving
  my change fires did not require writing to any client's data, and the
  read-only dry run gave better evidence anyway.
* **Did not sync BidlowAI** either. I had considered it as the one client the
  hard rule permits writes for, but the dry run already proved resolution fires
  on the live build, so the write would have been for its own sake.
* **Did not force-push to fix a cosmetic commit subject.** My `git commit -m`
  used PowerShell here-string syntax (`@'...'@`) inside the **Bash** tool, which
  bash concatenates rather than parses - so `@` became the subject line and the
  real message became the body. The content is all present in the commit body.
  Rewriting protected `main` to tidy a subject line is not a trade worth making;
  recording it here is. The repo's own CLAUDE.md warns against exactly this and
  I used it anyway.

## Why this row is BLOCKED and not DONE

The row's definition of done is "both real sheets synced and the true row counts
reported". Pareto FM is synced and reported. Train Hugger **cannot be** by any
agent: finishing it means confirming an 82-domain shrink, which unblocks 82
parties who asked not to be contacted. That is rule (b) - real client data - and
it is irreversible in the direction that matters.

**The question for Greg:** Train Hugger's "Domains" tab holds 291 today and we
hold 373. Did they deliberately shorten the list - in which case confirm it with
"Remove them anyway" and 82 become contactable - or did rows go missing from the
sheet, in which case put them back and re-sync and nothing is lost?

Until that is answered the 373 stay blocked, which is the safe direction and
costs nothing but a few unsent emails.

## Note for the next cycle

There is **no scheduled suppression sync workflow**; the nightly ~01:53Z run
comes in via `/api/internal/suppression/sync-all` as a side-step of the replies
cron. So nothing drifts silently while Train Hugger waits. It is also worth
knowing that suppression sync state is **absent from `alerts.yml`** - a source
sitting in ERROR is visible on-screen and nowhere else. Train Hugger sat in
ERROR from 2026-08-14 to 2026-08-28, a fortnight, without anything saying so.
That is a queue row someone should write.
