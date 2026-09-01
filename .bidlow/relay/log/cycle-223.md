# Cycle 223 - queue item 144

## Sweep first

`gh pr list --state open` returned `[]` - nothing open, nothing to merge.

## The item

Row 144 is a stranded fragment: cycle 188's log handed the relay a sentence
about what a future cycle should do IF row 138 or row 143 reopened again
before the watcher was restarted, the relay copied it into `QUEUE.md` as its
own row with no interpretation, and the row itself asks for exactly one of
two outcomes: turn it into real work, or close it WONTFIX.

This is the same defect class already closed WONTFIX for rows 124, 139, 140,
141 and 142: the carry-forward detector splits a recurring sentence about row
138/143's reopening mid-quote and stamps the fragment as its own row. Row
144's fragment is one more piece of that same sentence
(`.bidlow/relay/log/cycle-188.md` lines 101-107, quoted in full in the queue
cell below).

## What "done" looks like

The row says plainly what it wants: say "known cause, not new," and stop.
Before writing that, I checked whether it was still true rather than assuming
it:

1. **The watcher restart cycle 188 was waiting on has happened.** Every cycle
   log from 203 through 222 opens with `Watcher script: <hash> - the file on
   disk is identical`, so the live process has been running current code
   since at least cycle 203. Cycle 188's own condition ("before a restart
   happens") no longer holds.
2. **Rows 138 and 143 have stayed `DONE 184` unbroken since cycle 190** -
   over thirty cycles now, well past the "at least one subsequent cycle" bar
   cycle 188 itself set.
3. **The wider class this sentence warned about did recur twice** - the same
   stale-watcher-in-memory bug reopened row 134 (caught in cycle 193) and row
   137 (caught in cycle 201) before the restart landed - and both times the
   handling cycle correctly re-verified rather than redid the work, which is
   exactly the discipline this fragment was asking for, applied without ever
   needing to cite it.

There is nothing left to turn into a real item. The advice was followed every
time it applied, and the condition it was written for is now closed. Closed
`WONTFIX 223` in `.bidlow/relay/QUEUE.md`, quoting all three checks above in
the cell itself so nobody has to re-derive them.

## Files changed

- `.bidlow/relay/QUEUE.md` (row 144 status cell, and row 144/145 swapped in
  file order - see below)
- `.bidlow/relay/log/cycle-223.md` (this file)

No application source was in scope and none was touched.

## What must NOT be touched

Anything under `_standards` (not named by this row), any other client's
data, any real email send, `.bidlow/GRADES.json` or any dimension score.

## Red-first test

None new - this is a status-cell close, not new behaviour. The existing
`relay/queue-file-integrity.test.ts` caught a real ordering defect my first
edit introduced (below), which is the closest thing this row has to a
red-first proof: the test went red, I fixed the cause, it went green again.

## An ordering defect the edit itself introduced, caught by the existing gate

Setting row 144 straight to `WONTFIX 223` without moving it made it the
first halting (BLOCKED/WONTFIX) row in file order, with row 145 (`TODO`)
sitting immediately after it - `queue-file-integrity.test.ts`'s "keeps
BLOCKED and WONTFIX rows below every row still to be done" check failed
correctly: `#145 (line 380) is TODO but sits below #144, which is WONTFIX and
stops the picker`. Swapped rows 144 and 145 in file order (145 now above 144)
so the still-open row is not stranded behind a closed one. Re-ran the test
after the swap: all 9 cases pass.

## Gates (fresh run, this cycle)

- `npx vitest run relay/queue-file-integrity.test.ts`: **9/9 PASS** (1 red
  ordering failure caught and fixed mid-cycle, described above).
- `relay-selftest.ps1`: **SELF-TEST PASSED - 127 checks** (above the 74
  floor; check count has only grown since cycle 188).
- No application source touched - full `npm run lint` / `npm run typecheck`
  / `npm test` not re-run for that reason, matching cycles 185-188/193/201's
  own precedent for docs-only changes.
- No send, no client data, no schema, no migration, nothing scored.

## Rows 138 and 143: re-checked, unchanged

Both still read `DONE 184` in `origin/main`'s copy of `QUEUE.md`, byte-
identical to every cycle since 190. No reopen to report.
