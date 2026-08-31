# The self-test harness crashing is not the same event as a check failing - 2026-08-31

Row 131, cycle 166. Written against `f447fdc` (`main` at cycle start) before the
merge of this row's own branch.

## What happened, in one sentence a non-coder can check

At 06:00 UTC on 31 August the relay refused to start three times in a row, not
because the safety machinery it checks was broken, but because the checking
code itself crashed - and the watcher had no way to tell those two things
apart, so it treated a broken test the same as a broken product.

## The on-disk fix (already verified before this row, re-verified here)

Row 122 added a self-test section that walks real git history in a scratch
repo to prove `Find-UnmergedPushedBranchForRow` actually works. Git writes its
own ordinary progress to stderr - `To <remote>` on every `push`, `Switched to
branch` on every `checkout`. `relay-selftest.ps1` sets
`$ErrorActionPreference = "Stop"` at the top of the file. Under `Stop`,
PowerShell turns *any* native-command stderr output into a terminating
`NativeCommandError` - not just non-zero exit codes - and the redirection
operators the row-122 code was using (`*> $null 2>&1`) do not prevent that
promotion. The whole file died uncaught on the first `git push`, which is why
it failed identically and reproducibly on every run rather than intermittently.

Two independent bugs were on disk, uncommitted, before this row started:

1. The row-122 git-walking block is now wrapped in
   `$ErrorActionPreference = "Continue"` with a `try { ... } finally { restore
   the old value }` around it, so git's own progress text can no longer be
   promoted into a terminating error. This is the same guard pattern already
   used by `Test-RowMergedOnMain` in `relay-watch.ps1`.
2. Four `.Count` reads on the return value of `Get-StrandedRowActions` were
   wrapped in `@(...)`. PowerShell unwraps a single-element array into a bare
   scalar, and a scalar has no `.Count` property, so it silently read back
   blank rather than `1` - which is exactly what the failure text
   `got  action(s)` (two spaces, no number) was showing. The assertion
   immediately after each one PASSED, reading a different property off the
   same value, which is the proof this was a test bug and not a production
   one: **the production guard was never broken; the test was.**

Both were verified independently before any new work started in this row: a
full self-test run at 06:01 UTC on 31 August passed 74 of 74 checks with
these two fixes and nothing else changed. That run is re-confirmed as part of
this row (see "Proof" below) before anything further was built on top of it.
No assertion was weakened or deleted to make this pass.

## The real work: separating "the test crashed" from "the test found a real problem"

The brief asked for one of three options to be chosen, with reasons written
down rather than picked silently:

1. **Separate harness errors from check failures**, so the two are reported
   and acted on differently.
2. **Run the git-dependent sections in a way whose failure is reported but
   non-fatal** - i.e. catch locally and keep going.
3. **Gate those sections behind an explicit capability check** before running
   them.

### Why (3), a capability check, was rejected

A capability check (e.g. "is git present and runnable on this machine?")
would not have caught this bug. Git *was* present and worked correctly - the
push genuinely succeeded. The defect was in how PowerShell's own error
machinery interprets a working command's ordinary progress output under
`$ErrorActionPreference = "Stop"`. A capability check answers "can I run git
at all", not "will this specific error-handling interaction blow up", so it
would have reported "capable" and then died on the very next line anyway.

### Why (2), catch-and-continue per section, was not the whole answer

The row-122 section is the *last* section in the file before the summary, so
locally catching its own crash and continuing would only ever reach the
summary two lines later - there is nothing after it to keep running for. It
also does not generalise: the next platform difference a future row
introduces might not be in a git-dependent section at all, and a purely local
catch only protects the one section it wraps. Section-local catching was kept
as a *complement*, not a substitute - see below - but it is not, by itself,
the fix that stops a future different crash from taking the whole engine down
the same way.

### Why (1), separating harness errors from check failures, is the actual fix

This is the one implemented, because it is the only option that answers the
brief's own framing directly: a check that legitimately FAILS is proof the
safety machinery is broken and must keep refusing to start; a harness that
CRASHES before it can even ask its question is not that proof, and must be
reported and acted on differently. Concretely:

- The entire body of `relay-selftest.ps1` (every section) is now wrapped in
  one outer `try { ... } catch { $script:HarnessError = $_ }`, in addition to
  the row-122 section's own local `try/finally` for its specific stderr
  cause. If some *other* future platform difference throws somewhere this
  file does not yet specifically guard, the outer catch still stops it from
  killing the process uncaught - it becomes a recorded, reported
  `HarnessError` instead of a silent process death indistinguishable from a
  real failure.
- A new pure function, `Get-SelfTestOutcome($Failures, $Passes,
  $HarnessError)`, decides the outcome from what actually happened:
  - Any recorded `$Failures` (even one) → **exit code 1, "failed"**. This is
    unconditional: a real failure recorded before a crash still refuses to
    start, because the crash afterwards does not un-prove the failure. This
    was deliberately tested (see "Proof" below).
  - No failures, but a `$HarnessError` was caught → **exit code 2,
    "harness-error"**. Not a failure.
  - Neither → **exit code 0, "ok"**, unchanged from before this row.
- A second new pure function in `relay-watch.ps1`,
  `Get-SelfTestStartupDecision($ExitCode)`, is what the actual startup gate
  now calls instead of the old bare `if ($LASTEXITCODE -ne 0)` check:
  - `0` → start, no alert.
  - `2` (harness error) → **start anyway**, but never silently: write a
    `SELFTEST-HARNESS-ERROR.md` artefact (parallel to the existing
    `SELFTEST-FAILED.md`) and send a distinctly-worded alert -
    *"relay STARTED - self-test harness crashed (not a real failure)"* -
    so a human still sees it without it costing a stopped morning.
  - anything else (`1`, or any other non-zero code) → refuse to start,
    exactly as before this row: `SELFTEST-FAILED.md`, the existing
    "REFUSED TO START" alert, exit 1.

Both new functions are pulled out as pure, side-effect-free logic rather than
left inline - the same pattern already used in this file for
`Find-UnmergedPushedBranchForRow`, `Get-DoneWithoutMergeStatus` and
`Get-DoneWithUnmergedBranchStatus` (see the comments at those definitions
naming `relay-selftest.ps1` as the reason they were pulled out). That pattern
is why this row's own proof (below) can drive the exact decision logic
directly, instead of only being able to prove it by actually crashing the
real file and starting or refusing to start the real relay end to end.

**Why "start anyway" and not "still refuse, but say why differently"?**
Refusing either way still costs Greg exactly the same stopped morning this row
exists to prevent, no matter how the refusal is worded. The self-test's own
git-walking sections check the watcher's *own* queue-management correctness
(stranded-row reopening, stale-lock clearing, DONE-without-merge rewriting) -
none of them gate the thing that actually leaves the building for a real
person: that is enforced separately, in
`src/server/safety/autonomous-mode.ts` and `autonomous-actor-guard.ts`, which
this self-test does not touch and whose own tests are unaffected by any of
this. A harness crash in the queue-management self-test is therefore not
evidence that the send-side hard rule is unenforced, so it does not need to
block startup to stay safe - it needs to be *seen*, which the loud artefact
and the distinctly-worded alert now guarantee.

## Can the Windows/CI gap actually be closed, and what would each option cost

The brief's own header comment in `relay-selftest.ps1` already states the gap
plainly: "The watcher only ever runs on Greg's laptop, so a CI job on a Linux
runner would not exercise the thing that actually runs." Checked directly
against `.github/workflows/*.yml`: there is currently no CI job of any kind
that runs `relay-selftest.ps1` - "shipped green in CI" in row 131's brief
refers to the ordinary PR gate (lint/typecheck/test/build of the Next.js
app), not any execution of this script. So today the self-test is *only* ever
exercised for real on Greg's own machine, and that is the whole reason this
row's incident could happen unseen by anyone else.

**A Windows CI job is genuinely feasible, and cheap.** The row-122 section
that broke does not need a real GitHub remote - it creates its own local bare
repository in `$env:TEMP` and pushes to that, so it is already self-contained
and would run identically on a `windows-latest` GitHub Actions runner.
Measured locally: a full 83-check run takes about 17 seconds
(`time (pwsh -File relay-selftest.ps1)` → `real 0m17.4s`). Adding runner
spin-up and checkout, a Windows job would cost on the order of 1-2 minutes of
wall time per run. GitHub-hosted Windows runners are billed at a 2x minute
multiplier against Linux on private repos, so this is roughly 2-4 billed
minutes per PR - negligible against any paid Actions plan and well inside a
free tier's monthly minutes. **This would have caught 31 August's exact bug**
before it ever reached Greg's machine: the row-122 section would have thrown
in CI on `windows-latest` exactly as it did locally, and (with this row's own
fix) reported it as a self-test failure on the PR rather than as a 6am
surprise. Recommended as a follow-up row of its own, scoped narrowly to
adding one `windows-latest` job that runs
`pwsh -NoProfile -File relay-selftest.ps1` and fails the PR check on any
non-zero exit code (including 2 - a PR is exactly the place a harness crash
*should* block merge, even though a running relay should not stop for one).

**A lint rule for the two specific PowerShell idioms is not realistic as a
general solution.** PSScriptAnalyzer (the standard PowerShell linter) has no
built-in rule for "native-command stderr becomes a terminating error under
`$ErrorActionPreference = 'Stop'`" or for "a single-element array read via
`.Count` silently degrades to a scalar" - both are semantic, data-dependent
behaviours rather than syntax patterns a static rule can reliably flag
without a very high false-positive rate (most `.Count` reads in this file are
not on values that can degrade to scalars, and most native-command calls do
not run under `Stop` with unredirected stderr). A *custom* PSScriptAnalyzer
rule could theoretically be authored to flag files that set
`$ErrorActionPreference = "Stop"` and then call a bare `& <cmd> ...` with
unredirected or partially-redirected stderr, but
authoring and maintaining a bespoke static-analysis rule for two very
specific idioms is materially more expensive than the Windows CI job above,
for narrower coverage - it would only catch the exact idiom pattern, not the
next platform difference. **Not recommended.** The Windows CI job is the
option that actually closes the gap; the lint rule is not worth building.

This row does **not** implement the Windows CI job itself - it is scoped to
the fix already on disk, the throw-vs-fail behaviour, and the proof that it
fires. Adding a new CI job is real, separate scope (touches
`.github/workflows/`, needs its own verification that it does not flake or
slow the merge queue) and is recorded here as a follow-up rather than folded
in silently.

## Proof it fires

Two new self-test cases were added (section 12 of `relay-selftest.ps1`,
9 new assertions, 74 → 83 checks):

- A `try { throw ... } catch { ... }` planted directly in the test file
  proves the outer catch mechanism itself actually catches, then feeds that
  caught error into `Get-SelfTestOutcome` with zero recorded failures and
  asserts: exit code 2, severity `"harness-error"`, and that
  `Get-SelfTestStartupDecision` returns `ShouldStart = $true` with
  `AlertNeeded = $true` - a crash does not refuse to start, but does not go
  by silently either.
- The same functions are fed a planted genuinely-failing check (no crash) and
  assert: exit code 1, `ShouldStart = $false` - unchanged, refuses to start.
- A third case feeds a planted failure *and* a planted crash together and
  asserts exit code 1 still wins - a real failure recorded before a crash is
  not softened back into a mere harness error by what happens afterwards.

**Both required cases were proven red without the change**, by temporarily
undoing the fix and re-running:

- Renaming `Get-SelfTestStartupDecision` out of existence (so it does not
  exist, as it did not before this row) made the self-test itself crash
  partway through section 12 and report `SELF-TEST HARNESS ERROR - 78
  check(s) passed before the harness itself crashed` - it could not even
  reach a PASS/FAIL for the new assertions, because the capability being
  tested did not exist yet.
- Restoring the function but flipping its harness-error branch to return
  `ShouldStart = $false` (i.e. "still refuse to start on a harness crash",
  the pre-row-131 conflation this row exists to remove) produced a genuine
  red `FAIL`:
  `SELF-TEST FAILED - 1 of 83 checks: - a harness crash with no failed checks
  does not refuse to start the relay (got ShouldStart=False)`.

Both experiments were then reverted and the full run re-confirmed green:

```
SELF-TEST PASSED - 83 checks.
```

## What this row does not change

- No check that legitimately fails changes behaviour at all - a real failure
  still, unconditionally, refuses to start the relay. This was the one thing
  the brief said must not move, and the third proof case above (failure +
  crash together still exits 1) exists specifically to guard it.
- No assertion anywhere in the file was weakened, skipped or deleted.
- Nothing in `src/server/safety/autonomous-mode.ts` or
  `autonomous-actor-guard.ts` (the actual send-side hard-rule enforcement) was
  touched. The hard rule - real send/delete only for `bidlowai` - is enforced
  there, independently of this self-test, and is unaffected by any of this.

## The restart note this project's own `CLAUDE.md` requires

`relay-watch.ps1` is dot-sourced once, at process launch, and the running
watcher keeps executing whatever was in memory at that moment - a merge to
`main` does not change what an already-running process is doing.
**`Get-SelfTestStartupDecision` and the updated startup-gate wiring in this
row are therefore inert until Greg runs `relay-start.cmd` by hand.** Until
that restart happens, a self-test harness crash will still be treated exactly
as it was before this row - a bare non-zero exit code refusing to start - and
this row's whole point (start anyway, but loudly) will not actually be
running. `relay-selftest.ps1` itself is re-read fresh on every startup-gate
invocation (it is launched as a new child process, not dot-sourced), but that
invocation only ever happens from inside the watcher's own startup gate, so
it is gated by the same restart. Do not report this as fixed on merge alone;
the acceptance test is a future cycle log line beginning `Watcher script:`
naming this row's own commit hash, and none exists yet.
