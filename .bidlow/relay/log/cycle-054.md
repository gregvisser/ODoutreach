# Cycle 54 — queue row 42 — the sheet range could be saved but never entered

**Result: DONE as code. PR [#301](https://github.com/gregvisser/ODoutreach/pull/301), branch
`fix/suppression-sheet-range-input`, commit `8e0551a`. NOT MERGED — blocked by row 39, not by
this work. One action outstanding: re-run CI after ~08:30 UTC and merge.**

## The brief was right, and I checked before believing it

Every claim in row 42 was re-verified against the code before a line was written:

| Claim | Verified |
|---|---|
| zod schema accepts `sheetRange` (line 18) | yes |
| trimmed (47), written to the row (58, 69) | yes |
| `suppression-sync.ts:125` reads it, defaults only when null | yes |
| `schema.prisma:967` has the column | yes |
| no component renders the input | yes — `grep` over `src/components` returns only type declarations and a read-only display |

## One correction to the row

The row says to add the input *"on both the client do-not-contact page and wherever else a
source is configured"*. **There is no "wherever else".** Every non-generated write to
`SuppressionSource` lives in `client-suppression-source-actions.ts`, and it has exactly one
caller: `client-suppression-inline-card.tsx`. The `/suppression` page already displays
`sheetRange` and is read-only, which is correct. So this was one component, not several. The
row has been corrected.

## The four things, written before touching anything

1. **Files:** `client-suppression-inline-card.tsx`, `client-suppression-source-actions.ts`,
   its test, plus two new test files.
2. **Red-first:** named below, watched failing first.
3. **Done:** an operator can type `Domains!A:A` on the client's do-not-contact card, save, and
   the sync reads that tab instead of `Sheet1` — no client has to rename their spreadsheet.
4. **Not touched:** the send pipeline, any schema or migration, the sync's delete/replace
   internals, any other client's data.

## What shipped

A **"Tab and range (optional)"** input on both the email and the domain list, seeded from the
saved value, default shown as the placeholder, accepting a bare tab name (`Domains`) or A1
notation (`Domains!A:A`). The effective range is now printed in the connection-status line, so
an operator can see which tab is being read without opening devtools.

### Two further defects found while wiring it up

Both would have made the fix useless or actively harmful, and neither was in the brief:

1. **Save was disabled unless the URL box had content.** That would have left the new field
   unreachable for exactly the two clients that need it — Train Hugger and Pareto FM are
   *already connected*; only the tab is wrong. An empty URL box now falls back to the id
   already on the row (`extractGoogleSpreadsheetId` accepts a bare id — verified, not assumed).
2. **The action wrote `sheetRange: null` unconditionally.** Any caller that saved a URL without
   echoing the range back would have wiped a working range and sent that client silently back
   to `Sheet1` — the exact outage being fixed, reintroduced by the fix. Absent and empty are
   now distinguished: an absent field leaves the column alone, an empty box clears it
   deliberately. The field is also bounded at 200 chars, since it goes straight to the Sheets API.

## Proof it fires — the part this project is worst at

**Red-first, reported honestly rather than flatteringly:**

- Wiring assertions: **5 of 6 red** before the fix.
- Action assertions: **2 of 5 red** (the wipe case and the length bound). The other three were
  green because that half genuinely already worked, as the row said.
- Sync assertions: **4 green from the start.** That link already worked. They are
  characterisation cover for a chain that had no test, and I am calling them that rather than
  dressing them up as red-first.

One wiring assertion **passed spuriously** on the first run — it matched a string that already
existed in a tooltip. A test that passes before the fix is not testing the fix, so it was
tightened until it failed for the right reason.

**Then proved capable of failing, all four, by deliberately breaking the code:**

| Deliberate break | Red |
|---|---|
| sync ignores the saved range (the original outage) | 2 failed |
| the card stops passing `sheetRange` (the defect itself) | 1 failed |
| the action wipes a saved range again | 1 failed |
| Save reverts to requiring a re-pasted URL | 1 failed |

Working tree restored clean after each; `git status` empty before pushing.

## Gates

```
lint       0
typecheck  0
tests      2730 passed / 279 files   (up 15 from 2715)
build      green
```

**No schema change and no migration** — the column already existed. Nothing here sends email or
touches client data, so none of the three stop-and-ask conditions applies. This was mine to merge.

## Why it is not merged, and it is not this work's fault

The branch was opened at **03:05 UTC**, inside the window where row 39 records the J5 pacing
test as deterministically red before ~08:30 UTC. #300 was red on `E2E (Playwright)` at that same
moment for exactly that reason — **a third independent confirmation of row 39, on a third
branch**. Merging would need an admin override of a genuinely red required check, which row 37
established is not the relay's to take.

I did not park this out of caution: no PR opened tonight can go green until row 39 lands.

## An operational trap worth recording

**Rows 39, 41, 42, 43 and 44 exist only on the unmerged `fix/cycle-logs-reach-git` branch
(#300). `main`'s QUEUE.md still stops at row 37.** So:

- This log and the row-42 evidence are committed to **that** branch, not to the code PR —
  merging #300 is what makes them durable.
- Cycle 53's finding compounds here: `/.bidlow/relay/log/` is still gitignored on `main`, so a
  log written against `main` would have been silently dropped. That is the same defect class as
  row 42 itself — something that reports success and never lands.
- The code PR was deliberately branched off `main` so it can merge independently of #300.

## Open questions for Greg: 1

Nothing here needs a decision. The single open item is mechanical and is already written into
row 42: **re-run CI on #301 after ~08:30 UTC and merge it.** If row 39 is fixed first, that
becomes automatic.
