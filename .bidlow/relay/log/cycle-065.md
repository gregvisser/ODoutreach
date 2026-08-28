# Cycle 65 — row 48: the sheet knew its own tab names all along

**Outcome: both halves built and proven — first-tab resolution AND a replace
that REFUSES instead of warning. Six behaviours watched red first. All four
gates green. PR #316.**

**Not finished, and the reason is a rule, not a difficulty.** The brief's
"done" is *both real sheets synced and the true row counts reported*. Pressing
Sync on Pareto FM or Train Hugger writes to — and for Train Hugger deletes —
**real client data**, which the hard rule reserves to `bidlowai` and which the
stop-and-ask list names outright at (b). So this cycle did not press it. Row
marked `PARTIAL 65`.

## The PR sweep found nothing to do

`gh pr list --state open` returned `[]`. A previous cycle had already cleared
the seventeen. Nothing to merge, nothing to leave a comment on.

## The brief was right about the bug and wrong about one thing

Right, and precisely so: `suppression-sync.ts:125` fell back to
`Sheet1!A1:Z50000`, `readSheetTabTitles` already existed, and it was already
being called — in the catch block, to write a nicer error. The product
diagnosed its own outage in a sentence and then threw the diagnosis away.

I confirmed that against production rather than taking it on trust. The
replies cron logs the full response body, and the run of
**2026-08-28T01:54:31Z** says:

```json
{"sources":34,"succeeded":32,"failed":2,"rowsWritten":50692,
 "errors":[
   "Train Hugger — Whole domains: … We looked in Sheet1!A1:Z50000. This Sheet's tabs are: \"Domains\", \"Company Names\".",
   "Pareto FM — Whole domains: … We looked in Sheet1!A1:Z50000. This Sheet's tabs are: \"Domains\"."
 ],"ok":false,"failedCount":2}
```

That is the whole bug in one line, and it also settles the design question:
**the first tab of both sheets is `Domains`.** "Read the first tab" is not a
guess about how clients name things — it is checked against what the live
system reported. Those exact strings are now the fixtures in
`sheet-range.test.ts`, with the run and timestamp cited above them.

**Where the brief is out of date: "add the `sheetRange` input the UI has never
rendered."** That input exists. `client-suppression-inline-card.tsx` renders
"Tab and range (optional)" for both lists (`sup-email-range` /
`sup-domain-range`), seeds it from what is saved so re-saving a URL cannot
blank a working range, and the Save button falls back to the stored spreadsheet
id — so a range can be saved *without* re-pasting the URL.
`client-suppression-range-wiring.test.ts` pins it. A previous cycle shipped it.

The brief's grep (`name="sheetRange"`) looked for a `<form>` attribute, but the
card is a controlled React component using `id=` and `value=`. The grep was
always going to miss it. QUEUE.md and the handover doc are both corrected.

That matters for the sentence at the top of the handover: *"he tried the
spreadsheet workaround and it did not stick"* is **not** explained by a missing
field. The field works. Nothing was owed there, and a cycle that had trusted
the brief would have spent itself rebuilding a working input.

## The part that mattered more

This path is delete-then-insert, which makes every misresolved range a
**deletion**. `suppressionShrinkWarning` reports it afterwards, which is a
receipt, not a guard.

`decideSuppressionReplace` (`src/lib/suppression/replace-guard.ts`) now runs
**inside the transaction, after the count and before the delete** — the only
place a guard can refuse without something already being gone. It refuses a
sync that would empty a non-empty list, or remove more than 10% of one, with an
absolute floor of 5 so small lists stay editable. Nothing is deleted,
`lastSyncedAt` is not stamped, and the reason lands on the source row and in
the cron's error list.

Zero is refused on its own terms rather than by the percentage, because zero is
the signature of a read that went wrong far more often than of a client
deciding nobody is blocked any more.

**A guard with no way out is a new outage,** so an operator who means it can
confirm — a "Remove them anyway (N)" button that does not exist until the guard
has fired, inside the already owner-gated sheet controls. The scheduled
re-sync never sets it: an unattended job must not be the thing that decides
hundreds of people may be contacted again. That was my call, not the brief's,
and it is why the diff reaches the action and the card.

## Red first, and it went red

Six new behaviours, all watched failing against the current code before a line
of the fix was written:

```
× reads a single-tab sheet's real tab when no range is saved
× reads the FIRST tab when the sheet has several
× quotes a first tab whose name has a space, so A1 notation stays valid
× ABORTS a 373-to-0 sync and leaves the 373 in place
× ABORTS a sync that would remove most of a list
× reports the blocked shrink so the caller can offer that confirmation
```

Five neighbouring assertions in the same file were **green from the start** —
explicit range still wins, Sheet1 fallback when tabs are unreadable, an empty
list may be filled, a small shrink still syncs. Those are regression pins, and
I am recording that they never went red so nobody counts them as new work.

## Known limit, stated rather than implied

The guard compares **counts**. A sync replacing 373 entries with 373 completely
different ones passes it. That covers the failure actually seen in production —
a misresolved tab reading empty or near-empty — and not a same-size
substitution, which would need the previous rows read and diffed. It is written
into the module docstring, not left for someone to discover.

## Gates

* `npm run lint` — 0
* `npm run typecheck` — 0
* `npm test` — **2982 passed / 301 files**
* `npm run build` — exit 0

## Proving it fires, not that it exists

The queue's worst recurring defect is the thing that is built, wired, reports
success and never runs. For this change the firing mechanism is already in
production and already observable: the replies cron calls
`/api/internal/suppression/sync-all` every run and `cat`s the whole response
body into the workflow log. That is how the baseline above was read.

So the proof is a before-and-after on the same log line, not a green test:

* **Before** (2026-08-28T01:54:31Z): `"succeeded":32,"failed":2` naming both
  sheets and the Sheet1 range.
* **After** the deploy, that line must show `failed:0` with both sheets
  reporting real row counts — or Train Hugger **refusing** with the new reason,
  which is also a pass and is the safe direction.

Either outcome answers the brief's question. Neither requires anyone to press
anything.

## What is left, and who it belongs to

The two real syncs. The cron will do them on its own next run — it fires on
`*/15 7-18 * * 1-5` and it is Friday inside that window, though observed drift
on this schedule is hours, not minutes (the last three runs were 01:52, 17:55
and 06:12). I did not `workflow_dispatch` it manually, because dispatching it
is me pressing the button on another client's data.

**The question for Greg, which is genuinely his:** may a relay cycle trigger
the do-not-contact sync for a non-`bidlowai` client, given that it deletes rows
even when the net effect is a more correct list? Today's answer is no, and the
work is parked on that.

## Found on the way in, not looked for: the log-destroyer is still running

Start-of-cycle `git status` showed `.bidlow/relay/log/cycle-064.md` modified.
The real 240-line log cycle 64 committed to `main` had been replaced on disk by
a 167-line stub opening `# Cycle 64 - finished / Work happened. Evidence: a git
ref moved…`. Same signature cycle 63 diagnosed, same stub, one cycle later.

Restored with `git checkout HEAD -- .bidlow/relay/log/cycle-064.md` before
anything was committed, so nothing was lost. Row 52 already covers this and I
have added the confirmation to it rather than opening a duplicate.

It is worth being blunt about the shape: the fix is correct, merged and tested,
and the running PowerShell process has held the pre-fix script in memory since
before `3d7fef6`. **A restart is the entire remaining fix, and no relay cycle
can restart the process that is running it.** Meanwhile every cycle has to
remember to restore the previous cycle's log by hand, and the one that forgets
commits the stub over the real thing permanently.

## Files

| File | What |
|---|---|
| `src/server/integrations/google-sheets/sheet-range.ts` | new — A1 quoting + first-tab resolution |
| `src/server/integrations/google-sheets/sheet-range.test.ts` | new — 8 tests, fixtures from the production log |
| `src/lib/suppression/replace-guard.ts` | new — the refuse decision |
| `src/lib/suppression/replace-guard.test.ts` | new — 9 tests |
| `src/server/integrations/google-sheets/suppression-sync-tab-resolution.test.ts` | new — 11 tests, 6 of them red first |
| `src/server/integrations/google-sheets/suppression-sync.ts` | resolve up front; refuse before the delete |
| `src/server/integrations/google-sheets/suppression-sync.test.ts` | one test renamed — it now pins the fallback, not the default |
| `src/app/(app)/clients/client-suppression-source-actions.ts` | `confirmShrink` through, `blockedShrink` back |
| `src/app/(app)/clients/client-suppression-source-actions.test.ts` | 3 new tests |
| `src/components/clients/client-suppression-inline-card.tsx` | one `sync()` instead of two; the confirm |

No schema change. No migration. Nothing on the send path. Nothing outside the
files above.

## Open questions: 1

May a relay cycle trigger the do-not-contact sync for a non-`bidlowai` client?
