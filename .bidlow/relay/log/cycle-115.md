# Cycle 115 - queue item 92

## Before touching anything

1. **Files to change:** `.bidlow/relay/QUEUE.md` (row 92 status cell only),
   a new `docs/ops/REPLY-PROOF-2026-08-29-cycle115.md`, this log file, and the
   watcher's own already-appended-but-uncommitted addendum to
   `.bidlow/relay/log/cycle-114.md` (carried forward, not this cycle's work
   product — same pattern cycle 114 followed for cycle 113's addendum).
2. **Red-first test:** none applicable — this is a docs-only observation
   cycle, no `src/` change, nothing to make go red then green.
3. **Done looks like:** a non-coder can read `docs/ops/REPLY-PROOF-2026-08-29-cycle115.md`
   and QUEUE.md row 92's status cell and understand, without opening any other
   file, whether dimension 1 moved and why (it didn't).
4. **Not touching:** `.bidlow/GRADES.json`, `relay-watch.ps1`, row 95's own
   text, any other queue row, any `src/` file, `_standards`, any sibling
   project folder.

## First: clear the green PRs

`gh pr list --state open` showed one open PR: **#406** (`docs/state-cycle-113`,
opened 2026-08-29, row 92 - identical redispatch one minute after cycle 112).
Checked `gh pr checks 406` twice this cycle: `verify` passed (5m25s); `E2E
(Playwright)` was still `pending` both times. Left open rather than force a
premature merge on an incomplete check run — will not park it silently
either; the next cycle to touch this row (or PR 406 directly) should re-check
`gh pr checks 406` first, since it may well be green by then.

## Investigation, before deciding whether to re-walk

Read the full chain: `.bidlow/relay/QUEUE.md` row 92 as committed at HEAD
(`0c5b286`), the last five cycle logs (110-114, i.e. `REPLY-PROOF-2026-08-29-cycle112.md`
through `-cycle114.md`), and the git log back to `c0b79d6` (cycle 103's first
close of this row). Found the working tree already carried uncommitted
changes when this cycle started: row 92's status cell set to a placeholder
`IN PROGRESS 115` and a ~174-line addendum appended to `cycle-114.md`. Traced
this to the same pattern `0c5b286` shows for cycle 113 - `relay-watch.ps1`
appends its own "watcher's own record of this cycle" section to the previous
cycle's log file after that process exits, uncommitted, and the next cycle's
commit is what actually lands it. Not stray or crashed state; carried forward
as-is, same as cycle 114 did for cycle 113's addendum.

Established from the last five cycles' own evidence: the reply chain for the
specific send this row needs proven (`cmteyyrsj0003g1mgs2slvdj3`, "Cycle 109
send-and-reply walk (v2)") is a known, static, already-diagnosed mismatch -
Greg's real reply was ingested but filed against the 26 August send instead,
because of a Gmail `+cycle109` alias / exact-`From`-match issue in how the
test was addressed, not a broken matcher. That fact has not changed since
cycle 111 first found it, and nothing in this cycle's window (a Sunday
night, cron next runs Monday 07:00 UK) could have changed it.

One thing hadn't been explicitly checked by any of cycles 110-114: whether
the `sync-replies.yml` workflow's recent run of **failures** (four in a row,
27-28 August) meant the reply pipeline itself had broken, as opposed to the
weekend schedule gap they all correctly reasoned about. Pulled the actual
step logs (`gh run view 33202356100 --log`) rather than trusting the
pass/fail badge: the reply-sync step returned `HTTP 200`,
`{"ok":true,"failedCount":0,...}` on its last run (28 August 19:06 UTC,
before Greg's reply existed); the workflow's overall red comes from an
unrelated step (a Train Hugger do-not-contact sheet shrink-guard refusing a
bulk removal). Full reasoning and raw evidence in
`docs/ops/REPLY-PROOF-2026-08-29-cycle115.md`. This narrows, not widens, what
this row is waiting on - it rules out "the pipeline is silently broken" as an
explanation, and confirms the wait is purely for Monday's cron window or a
fresh human action, exactly as cycles 112-114 already believed but had not
independently verified.

No screens were loaded, no session was minted, the reply-sync endpoint was
not triggered, and the production database was not queried directly - all
read-only, via `gh run list` / `gh run view --log` against GitHub's own
record of a workflow this row does not own.

## Re-score dimension 1

**Held at 8.** No new evidence exists that could move it - the one new check
this cycle ran rules out a failure mode, it does not supply a correct match.
`.bidlow/GRADES.json` was not edited this cycle.

## What this does not cover

The chain send -> arrival -> reply -> correct-thread-match remains unproven
for the specific send this row needs proven. Unchanged from cycle 114 - this
cycle added no new coverage toward it and claims none.

## Gates

No `src/` change, so no lint/typecheck/test run was needed or performed -
confirmed by `git status` before committing: only `.bidlow/relay/QUEUE.md`,
`.bidlow/relay/log/cycle-114.md` (carried-forward watcher addendum), this
file, and one new file under `docs/ops/`.
