# Cycle 106 — queue item 92: walk the send-and-reply journey through the real screens

## What the item said

Dimension 1 (Core journeys end-to-end, weight 18, score 8) is held at 8 because
nobody has clicked send-and-reply through the actual UI screens on this build —
a test nobody has run, not a score that is wrong. Walk it as a human: sign in as
staff, pick or enrol a contact, prepare the send, send it, watch it arrive, reply
from the recipient side, confirm the reply lands back against the right thread
and contact. `bidlowai` only, real mail or nothing. Record it like the 26 August
proofs — a dated artefact under `docs/ops/`. Re-score dimension 1 only if the
walk moves it; if it cannot be completed, leave the score at 8, say which step
blocked it, and mark the row PARTIAL.

## PR sweep first

`gh pr list --state open --json number,title,statusCheckRollup,mergeable,headRefName`
→ `[]`. Nothing to merge.

## Picking this up: what was already on disk

This row had already been attempted twice and killed both times at the 45-minute
deadline (cycle 103 on an earlier row, cycle 105 on this one — see
`log/cycle-103.md`, `log/cycle-105.md`). Cycle 105's work was not lost: the
working tree already carried a completed `docs/ops/SEQUENCE-LAUNCH-SCREEN-WALK-2026-08-29.md`,
a `.bidlow/STATE.md` note recording the walk in progress, and a `QUEUE.md` edit
marking the row (mid-write, not in the six-word status vocabulary). Nothing had
been committed. Per this project's rule that a kill does not undo work, the
document was read and independently checked rather than re-done from scratch or
discarded.

## Verifying the inherited work before trusting it

- Re-read the exact lines the document cites in `src/server/email-sequences/send-introduction.ts`
  (`buildUnsubscribePlaceholder`, `alignedLinkBaseUrl`, `senderRowForSend`, the
  `composeSequenceEmail` call and its `blocked.push` branch) and in
  `src/lib/email-sequences/sequence-email-composition.ts` (`SEND_REQUIRED_FIELDS`,
  the `sendReady` computation). All match the document's account exactly —
  `Client.defaultSenderEmail` null → `buildUnsubscribePlaceholder` returns `""` →
  `unsubscribe_link` missing → `sendReady: false` → blocked before any
  `OutboundEmail` row is created.
- Read `scripts/.tmp-launch-log.txt` (a raw, timestamped log written by the
  inherited walk script, not authored by this cycle): confirms the identical
  on-screen refusal and the safety-gated abort ("expected exactly 1 queued row
  (mine), found 0. Not draining.") that the document reports.
- Fetched a fresh 30-minute-lifetime staff session (same `encode()`-from-`next-auth/jwt`
  technique the document and `e2e/global-setup.ts` both use, secret pulled live
  from the production App Service config, never written to a file that reaches
  git) and did a **read-only** check of `bidlowai`'s outreach sequence list.
  Result: exactly one `Cycle 105 walk` sequence remains, plus the pre-existing
  `BidlowAI — audit-led intro` sequence the document deliberately left alone —
  matching the document's own "what this walk leaves behind" section with no
  stray debug duplicates. A `scripts/tmp-cleanup.mjs` script had been written to
  delete leftover duplicates but, on this evidence, was never actually needed.

Nothing about the inherited document's technical claims or its conclusion
needed correcting.

## Files changed

- `.bidlow/GRADES.json` — dimension 1's `observed` field extended with the
  2026-08-29 re-walk (root cause, both passes, what remains unproven). **Score
  left at 8**, exactly as instructed for a walk that could not be completed.
- `CUSTOMER-READY-REPORT.md` — matching scorecard row 1 update and a new
  "Re-walked 2026-08-29 (cycle 106)" paragraph. Weighted total unchanged (7.76).
- `.bidlow/STATE.md` — replaced the stale "in progress, mid-task" cycle 105 note
  with the closed-out account.
- `.bidlow/relay/QUEUE.md` — row 92 set to `PARTIAL 106` with the finding and
  proof-file pointer.
- `docs/ops/SEQUENCE-LAUNCH-SCREEN-WALK-2026-08-29.md` — kept as written by the
  inherited walk (verified, not modified).
- `.bidlow/relay/log/cycle-103.md`, `cycle-104.md`, `cycle-105.md`, `cycle-106.md`
  — added; a merge-blocking test (`relay/cycle-log-reaches-git.test.ts`) exists
  precisely so these do not go missing in a rebase.
- **Deleted, never committed:** `scripts/.tmp-cookie-header.txt`,
  `scripts/.tmp-launch-log.txt`, `scripts/.tmp-prod-storage-state.json` (held a
  live production session cookie — a secret, and must never reach git history),
  `scripts/.tmp-screenshots/` (28 PNGs, scratch evidence already narrated in the
  kept document), and the four `scripts/tmp-*.mjs` throwaway Playwright scripts
  (each header-commented TEMPORARY / NOT COMMITTED), plus one read-only listing
  script written and deleted this cycle.
- **Left untouched, out of scope for this row:** `ODOUTREACH-PROJECT-INSTRUCTIONS.md`
  (untracked, pre-existing, unrelated to dimension 1 — not created or needed by
  this row, so not committed or deleted).

## Red-first

Not applicable in the usual sense — this row is a manual walk-and-record task,
not a code change with a red/green cycle. The equivalent substitute, per this
repository's established practice for non-code rows: the *inherited* raw
evidence (`scripts/.tmp-launch-log.txt`, now deleted after being read and its
content folded into this log) was independently re-derived by re-reading the
cited source lines rather than trusting the document's paraphrase, and the
document's "what remains" claim was checked against a fresh read-only query
rather than assumed.

## What this closes and what it does not

**Closes:** the walk itself, performed through the real screens, with proof.
**Does not close:** the row. Per the row's own instruction, a walk that cannot
complete send → arrival → reply → match stays PARTIAL with the score held. Named
plainly: none of those four steps were reached; the walk got to the point of a
genuine, reproducible refusal at launch and stopped there, honestly.

## Gates run

- `npm run lint` → 0 errors.
- `npm run typecheck` → 0 errors.
- `node -e "JSON.parse(...)"` on `.bidlow/GRADES.json` → valid.
- `npm test` → 3643/3644 passing. The one failure
  (`relay/cycle-log-reaches-git.test.ts`) is the test's own documented expected
  state at the start of a cycle (untracked cycle logs on disk) and resolves once
  this commit adds `.bidlow/relay/log/cycle-103.md` through `cycle-106.md`.

No schema change, no migration, no client data moved, no email sent. The hard
rule was never approached this cycle: the only production actions taken were a
read-only session-mint and a read-only sequence listing, both against `bidlowai`.
