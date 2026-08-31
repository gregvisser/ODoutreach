# Cycle 166 - row 131

## PR sweep

`gh pr list --state open` returned zero open PRs. Nothing to merge or chase.

## Leftover uncommitted state found at cycle start, investigated before touching anything

`git status` at the start of this cycle showed three files already modified
in the working tree, none of them mine: `.bidlow/relay/QUEUE.md`,
`.bidlow/relay/log/cycle-165.md`, and an untracked
`ODOUTREACH-PROJECT-INSTRUCTIONS.md`.

- `cycle-165.md` had gained the watcher's own auto-appended record of cycle
  165 (192 lines, starting "## The watcher's own record of this cycle") —
  legitimate, machine-written, additive. Left as-is and carried into this
  row's commit since it shares the same file as this row's own QUEUE.md edit.
- `QUEUE.md` had two changes: row 92 closed `DONE` by "the supervisor" (a
  prior Cowork session, per the note in its own status cell), correctly
  superseded by row 128's dimension-1 rescore which is already merged
  (`c88702c`, `f447fdc`) — checked and consistent, left as-is; and row 131
  itself already written in as `IN PROGRESS 166` by the watcher when it
  handed out this cycle, which is expected.
- `ODOUTREACH-PROJECT-INSTRUCTIONS.md` is untracked, not named by this row,
  and not something a prior cycle's log claims — left completely alone, not
  committed, not read for scope.

The watcher's own appended note inside `cycle-165.md` also flagged: **"RESTART
REQUIRED - this watcher is running a STALE copy of its own script"** (loaded
`B9E192203DEB`, on disk `51AF85ED01BF`). This matters directly to this row's
own work — see "Restart required" below.

## The work

1. **Committed the on-disk fix**, already present and uncommitted in
   `relay-selftest.ps1` before this cycle started (backup on disk:
   `relay-selftest.ps1.bak-before-cowork-stderr-fix`, gitignored, not
   touched). Re-verified independently: 74/74 checks green before any new
   work was added on top.
2. **Implemented the throw-vs-fail behaviour.** New pure function
   `Get-SelfTestOutcome` in `relay-selftest.ps1` turns `(Failures, Passes,
   HarnessError)` into an exit code (0 pass / 1 real failure / 2 harness
   crash with zero failures). The entire self-test body is now wrapped in one
   outer `try/catch` so a future crash anywhere is caught rather than killing
   the process uncaught. New pure function `Get-SelfTestStartupDecision` in
   `relay-watch.ps1` is what the real startup gate now calls: exit 1 still
   refuses to start (unchanged); exit 2 starts anyway but writes a
   `SELFTEST-HARNESS-ERROR.md` artefact and sends a distinctly-worded alert,
   so it is never silent. Full reasoning for the three options weighed, and
   the CI-gap question, is in
   `docs/ops/SELFTEST-HARNESS-VS-FAILURE-2026-08-31.md`.
3. **Two new self-test cases** (section 12, relay-selftest.ps1): a planted
   `throw` proves the outer catch actually catches, then feeds it through
   `Get-SelfTestOutcome`/`Get-SelfTestStartupDecision` and asserts the relay
   is NOT refused; a planted genuine failure asserts it IS still refused,
   including when a crash follows it. 9 new assertions, checks 74 → 83.
   **Proven red without the change**, by temporarily undoing each half of the
   fix and re-running: removing `Get-SelfTestStartupDecision` entirely made
   the self-test itself crash with `SELF-TEST HARNESS ERROR - 78 check(s)
   passed before the harness itself crashed`; restoring it but flipping its
   harness-error branch to `ShouldStart = $false` produced a genuine `FAIL`.
   Both reverted and the full run re-confirmed green at 83/83 before
   proceeding. Full transcript of both red runs is in the artefact.

## Gates

- `npm run lint` — clean, zero output.
- `npm run typecheck` — clean, zero output.
- `npm test` — 362 files / 3772 tests passed. Two Sentry-config tests
  (`src/instrumentation.test.ts`,
  `src/lib/monitoring/sentry-config-wiring.test.ts`) timed out on the first
  full-suite run under parallel load; re-run individually they pass in under
  1s each, and a second full-suite run passed clean at 3772/3772 — confirmed
  flaky under load, not caused by this row (no application TS/JS file was
  touched; only the two PowerShell relay scripts and this docs artefact).
- `relay-selftest.ps1` itself — 83/83 checks green, run directly (not part of
  `npm test`, per this file's own header comment on why it is a startup gate
  and not a CI job).

## The hard rule

No email sent, no data deleted, for any client. This row touched only two
PowerShell relay-ops scripts, one docs artefact, and this log/QUEUE.md — no
send path, no client data, no schema.

## Restart required — this row's own change is inert until Greg restarts

Per this project's own `CLAUDE.md`: `relay-watch.ps1` is dot-sourced once, at
process launch, and an already-running watcher keeps executing whatever was
in memory then. **`Get-SelfTestStartupDecision` and the updated startup-gate
wiring merged in this row do nothing until Greg runs `relay-start.cmd` by
hand.** Until that restart, a future self-test harness crash will still be
treated exactly as before this row — a bare non-zero exit code refusing to
start — which is the exact failure mode this row exists to fix. This is on
top of, not instead of, the pre-existing stale-watcher note already found in
`cycle-165.md`'s own appended section (loaded `B9E192203DEB`, disk
`51AF85ED01BF`) — that restart was already owed before this row added a
second reason for one. Do not report this as fixed on merge alone; the
acceptance test is a future cycle log line beginning `Watcher script:` naming
this row's own merge commit hash, and none exists yet.

## Merge

See QUEUE.md row 131 for the merge commit hash and the `git ls-remote`
confirmation, recorded there once the PR is actually merged (the hash cannot
be known before that).
