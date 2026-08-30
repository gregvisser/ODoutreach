# Cycle 144 - queue item 110

## Before anything else: the four things written down

1. **Files I might change:** `.bidlow/relay/QUEUE.md` (row 110's status cell only,
   if anything needs updating), `.bidlow/relay/log/cycle-144.md` (this file).
   Whether any Microsoft Graph code gets touched depends entirely on the gate
   check below, same as cycles 136, 137 and 143.
2. **The red-first test:** none. Row 110 forbids starting the Graph work -
   draft-then-send, the `rfc822MessageId` capture, the `BY_THREAD_REF` test,
   the step-2-failure cleanup test - until row 108's Gmail fix is observed
   working in production. The gate is still not met (below), so there is
   nothing to write a red test against.
3. **What "done" looks like today:** confirm whether anything has changed
   since row 110 was closed `BLOCKED 143` (no Google mailbox connected, so
   the fix can never be observed firing); if nothing has changed, do not
   re-run the same measurement a fourth time - that is the exact loop the
   `BLOCKED 143` note says it exists to stop - and say so plainly instead.
4. **What I must not touch:** the Microsoft Graph send path, `execute-one.ts`'s
   Gmail branch, `process-synced-replies.ts` legs 2/3, the content of rows
   111-116/118 (already closed by earlier cycles/Cowork), and `.bidlow/GRADES.json`.

## PR sweep (done first, as instructed)

`gh pr list --state open` returned exactly one PR: **#443**
(`docs/row-110-gate-recheck-cycle-143`, cycle 143's own row-110/queue-order
PR), and its checks were **RED** (`verify` job failing).

Investigated rather than forced past it. Two things were true at once:

1. **The working tree already had an un-pushed fix on top of #443's commit.**
   `git status` showed `QUEUE.md` and `cycle-143.md` both modified, plus an
   untracked `ODOUTREACH-PROJECT-INSTRUCTIONS.md`. Diffing confirmed the
   `cycle-143.md` change was just the watcher's own end-of-cycle footer (normal,
   expected). The `QUEUE.md` change was substantive: it raised a new row 118
   ("no Google mailbox is CONNECTED, so row 108's fix can never be observed"),
   closed row 110 `BLOCKED 143` referencing it, and moved rows 113 and 110 to
   the very back of the table. `.bidlow/relay/QUEUE.md.bak-before-cowork-*`
   timestamped 12:24-12:26 today confirm this was made directly on disk by
   Cowork (Greg's own supervisor session), not by a relay cycle - consistent
   with row 115's own text describing Cowork as a separate, parallel channel
   that edits this file with backups.
2. **That uncommitted fix was exactly what #443's CI needed.** Cycle 143's own
   pushed commit had restored row 113 (`BLOCKED 141`) to sit between rows 112
   and 116 - literal compliance with the brief's "order must stay 115, 111,
   112, 113, 116..." instruction - but that placed a BLOCKED row above several
   still-TODO rows (116 at the time still open, 108's neighbour 110, 114, 95,
   117), which is precisely what
   `relay/queue-file-integrity.test.ts`'s "keeps BLOCKED and WONTFIX rows below
   every row still to be done" guards against. Cycle 143's own log says gates
   were skipped because "no application code changed" - true for `src/`, but
   this test reads the real `QUEUE.md` regardless, so the gate should still
   have been run. That is why CI was red.

Ran the full gate against the working tree as it stood (Cowork's fix included):
`npm run lint` (0), `tsc --noEmit` (0), `npm test` (356 files / 3742 tests,
including `queue-file-integrity.test.ts` 9/9 green). Committed exactly what
was on disk - QUEUE.md and cycle-143.md only, not the stray instructions file
(same call cycle 143 made: it reads as Cowork-project draft copy, not code or
a relay artefact, and the repository-boundary rule puts that kind of thing in
`C:\Bidlowbusiness`, not this repo - left untouched, not mine to place or
delete) - pushed to `docs/row-110-gate-recheck-cycle-143`, watched CI
(`verify` + `E2E (Playwright)` both green in ~5.5 min), and merged #443
(squash, branch deleted). `gh pr list --state open` now returns empty.

## Row 110 - confirmed still correctly BLOCKED, not re-measured

Cowork's `BLOCKED 143` note gives a full, evidenced reason: the mailbox
probe (`gh workflow run mailbox-credential-probe.yml`, run `33307493700`,
2026-08-30T10:52Z) found zero Google mailboxes CONNECTED in production, so
row 108's Gmail Message-ID read-back - merged and deployed (`d083bfc`) - can
never be *observed* firing, which is what row 110's own gate requires before
any Microsoft Graph work may start.

Checked whether anything has moved since that measurement, without repeating
the measurement itself:

- `gh run list --workflow=mailbox-credential-probe.yml --limit 5` shows no run
  newer than `33307493700` (10:51:40Z). Nobody has re-probed since.
- Row 118 (the row that owns fixing the stranded Google mailboxes) is still
  `TODO` on disk - nobody has reconnected one yet.
- `gh pr list` / recent `git log` show no merge touching mailbox OAuth,
  credential storage, or the Google connect flow since cycle 143.

So the gate is unchanged: **still not met, for the same reason.** Re-running
the same probe a fourth time (cycles 136, 137, 143 already did) would add
nothing - that repetition is the exact loop Cowork's note says it closed the
row to stop. Row 110 stays `BLOCKED 143` as Cowork left it; I have not
touched its status cell, and no Microsoft Graph code, send path, or matcher
leg was touched this cycle either.

**One honest observation, not acted on:** by the relay's own picker rule in
`relay-watch.ps1` (`Invoke-SelfQueue` takes the first row in file order that
is not `DONE`/`IN PROGRESS`, and halts rather than skips at the first
`BLOCKED`/`WONTFIX` row), row 110 sitting at the very back behind several
still-`TODO` rows (95, 118, 114) should mean the *next* automatic pick is one
of those, not row 110. This cycle's brief named row 110 verbatim regardless -
most likely because it was generated from queue state at the moment cycle 143
was dispatched, before Cowork's reorder landed, or because Cowork dispatched
this cycle directly rather than through the picker. Both explanations are
already fully accounted for by the evidence above (the `.bak-before-cowork-*`
files and their timestamps), so this is recorded here as a closed observation
rather than as something a future cycle still has to chase down.

## Gates run

`npm run lint` - 0 errors.
`tsc --noEmit` - 0 errors.
`npm test` - 356 files / 3742 tests, all green (includes
`relay/queue-file-integrity.test.ts` 9/9, previously 1 failing on #443's CI).

## What's left

Row 110 stays `BLOCKED 143` (Cowork's status, reconfirmed unchanged by this
cycle). It unblocks the moment a Google mailbox reconnects and sends - that is
row 118's job, still `TODO`. No cycle should re-run the mailbox probe on row
110's account again; check row 118's status instead.
