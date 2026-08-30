# Cycle 117 — row 92: reply leg, forced instead of waited for

## PR sweep, first

One open PR at cycle start: #408 (row 96, docs-only, green — E2E and verify
both `pass`). Merged via `gh pr merge 408 --squash --auto`. It landed as
`3f5aeb9`.

## Row 92, what was different this time

This is the row's eighth-plus consecutive dispatch on effectively identical
brief text. Cycles 110–115 correctly declined to redo the walk or re-trigger
anything, because no time in which new information could exist had passed
between redispatches. This cycle is different: about 8 hours had passed
since cycle 115's check, and the reply-sync cron
(`.github/workflows/sync-replies.yml`, weekdays 07:00–18:00 UK only) had not
run at all since 2026-08-28T19:06:18Z — over 28 hours, all of it outside the
cron's window, with roughly 30 more hours left until Monday's window opens.

One concrete question was still open: has Greg's confirmed reply been
ingested yet, or is it still waiting? That can only be answered by running
the ingestion, not by reading anything again. `sync-replies.yml` already
supports `workflow_dispatch` (used once before, 27 August) for exactly this.
Triggered it by hand this cycle — decided and recorded rather than asked,
since it sends no email, alters no schema, and runs the identical,
already-approved, unattended job that fires automatically 48 times a day on
weekdays; only the timing is different.

Result: the reply-sync leg ran clean (`ok:true`, `repliesLinked:0`). Fresh
read-only screens (minted staff session, headless Chromium — no button that
mutates state clicked; deliberately did not open the individual reply detail,
since its own copy implies a view/lock side-effect) show there is still only
**one** relevant reply — the same 23:48 UK / 29 August one cycles 111–112
already found and documented, still mismatched to the 26-August thread
despite its own Subject reading "RE: A quick note from BidlowAI" correctly.
No reply postdating that one exists. The queue's "22:51 UTC" reference is
read as when Greg told the relay he'd replied (in Cowork), a few minutes
after the reply cycles 111/112 already captured, not a second reply's own
send time.

Root cause reconfirmed unchanged from cycle 111: Gmail's Reply button drops
the outbound's `+cycle109` alias, so `process-synced-replies.ts`'s
exact-contact match resolves to the wrong existing contact/thread.

Dimension 1 held at 8. `.bidlow/GRADES.json` not touched. Full evidence:
`docs/ops/REPLY-PROOF-2026-08-30-cycle117.md`. Row 92 marked `PARTIAL 117` in
`QUEUE.md`, with a recommendation against further identical-grounds
redispatch — closing this needs a fresh non-aliased send or a deliberate
matcher change, neither authorized for a docs-only row.

## Files changed this cycle

- `.bidlow/relay/QUEUE.md` — row 92 status only.
- `docs/ops/REPLY-PROOF-2026-08-30-cycle117.md` — new evidence artefact.
- `.bidlow/relay/log/cycle-117.md` — this file.

No code changed. No other dimension touched. Scratch Playwright scripts and
screenshots used for the screen check were deleted before this cycle ends —
nothing beyond the three files above is being committed from this cycle's
own work (`.bidlow/relay/log/cycle-116.md` also carries an uncommitted
addendum from the watcher's own post-cycle-116 record, pre-existing and not
authored by this cycle).
