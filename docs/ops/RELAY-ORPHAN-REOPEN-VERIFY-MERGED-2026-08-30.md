# Relay: a timed-out row's reopen now checks whether the work is already merged

**Date:** 2026-08-30 (cycle 128, queue row 103)
**Files touched:** `relay-watch.ps1`, `relay-selftest.ps1`, `RELAY-README.md`, `CLAUDE.md`
**Scope:** documentation of the fix and the evidence for it. No schema, no migration, no send, no client data, no `.bidlow/GRADES.json` change.

## The defect, as observed

Cycle 125 completed row 101 in full and its pull request merged as `#420`
(`26559fd`), but the relay's 45-minute kill fired before the cycle could write
`DONE 125` into the status cell. Two different places in `relay-watch.ps1`
reopen an orphaned/stranded row, and **both wrote a bare `TODO`** with no
mention that the row's work might already be on `main`:

- the startup path, which reopens any row still marked `IN PROGRESS` when the
  watcher starts (nothing can legitimately be running yet, so it is always a
  corpse)
- the mid-run path, which gives a cycle's own row back the moment that cycle
  is killed at the 45-minute deadline, is reported `failed`, or fails to start

Cycle 126 was handed row 101 back as a plain `TODO` and would have redone
finished, merged work had a human not noticed by hand and rewritten the brief
first. That catch was manual and does not happen when nobody is watching.

## The exact lines, before this fix

Startup path (`relay-watch.ps1`, orphaned-`IN PROGRESS` block):

```powershell
$cycleMatch = [regex]::Match($row.Status, '^IN PROGRESS\s+(\d+)')
$deadCycle  = if ($cycleMatch.Success) { $cycleMatch.Groups[1].Value } else { 'unknown' }
# No pipe in the status text - see the standing rule at the top of QUEUE.md.
if (Set-QueueRowStatus $row.Number "TODO (reopened at startup - cycle $deadCycle never finished)") {
    $reopened++
    Write-Line "Reopened orphaned row #$($row.Number) - cycle $deadCycle took it and never finished."
} else {
    Write-Line "Row #$($row.Number) is orphaned IN PROGRESS but could not be rewritten. Check its formatting."
}
```

Mid-run timeout path (`relay-watch.ps1`, "A CYCLE THAT ENDED BADLY MUST GIVE
ITS ROW BACK" block):

```powershell
foreach ($row in $stranded) {
    $why = if ($outcome -eq "timed-out") { "was killed at the $CycleTimeoutMinutes minute deadline" }
           elseif ($outcome -eq "failed to run") { "never started" }
           else { "ended badly" }
    if (Set-QueueRowStatus $row.Number "TODO (reopened - cycle $cycle $why and did not finish this)") {
        Write-Line "Gave row #$($row.Number) back to the queue - cycle $cycle $why, so it is TODO again rather than stranded."
    } else {
        Write-Line "Row #$($row.Number) is stranded on cycle $cycle and could NOT be rewritten. Check its formatting."
    }
}
```

Both call `Set-QueueRowStatus` with a hand-built `TODO (...)` string. Neither
asks `main`'s history anything before writing it.

## The exact lines, after this fix

Two new functions were added (`relay-watch.ps1`, placed after
`Repair-UnreadableQueueRow` and before line 1959's `if ($LoadOnly) { return }`,
so `relay-selftest.ps1 -LoadOnly` loads them):

```powershell
function Test-RowNumberMergedInLog([string]$LogText, [string]$RowNumber) {
    if ([string]::IsNullOrWhiteSpace($LogText)) { return $false }
    if ([string]::IsNullOrWhiteSpace($RowNumber)) { return $false }
    # Anchored on both sides so "row 100" can never match while testing for
    # row 10 or row 1001 - digits are word characters, so \b sits only at a
    # genuine boundary either way.
    return [bool]([regex]::IsMatch($LogText, "(?i)\brow\s*$([regex]::Escape($RowNumber))\b"))
}

function Test-RowMergedOnMain([string]$RowNumber, [string]$RepoPath = $RepoRoot) {
    $previous = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try {
        $log = (& git -C $RepoPath log --oneline -300 main 2>$null | Out-String)
    } catch {
        $log = ""
    } finally {
        $ErrorActionPreference = $previous
    }
    return Test-RowNumberMergedInLog $log $RowNumber
}

function Get-OrphanReopenStatus {
    param(
        [Parameter(Mandatory = $true)][string]$CycleNumber,
        [Parameter(Mandatory = $true)][string]$ReasonSuffix,
        [Parameter(Mandatory = $true)][bool]$MergedOnMain
    )
    if ($MergedOnMain) {
        return "PARTIAL $CycleNumber - work may already be merged, VERIFY main BEFORE redoing ($ReasonSuffix)"
    }
    return "TODO ($ReasonSuffix)"
}
```

The startup path now reads:

```powershell
$cycleMatch = [regex]::Match($row.Status, '^IN PROGRESS\s+(\d+)')
$deadCycle  = if ($cycleMatch.Success) { $cycleMatch.Groups[1].Value } else { 'unknown' }
$mergedOnMain = Test-RowMergedOnMain $row.Number
$newStatus = Get-OrphanReopenStatus -CycleNumber $deadCycle `
    -ReasonSuffix "reopened at startup - cycle $deadCycle never finished" `
    -MergedOnMain $mergedOnMain
if (Set-QueueRowStatus $row.Number $newStatus) {
    $reopened++
    if ($mergedOnMain) {
        Write-Line "Reopened orphaned row #$($row.Number) as PARTIAL - cycle $deadCycle took it and never finished, but main's history already mentions this row. VERIFY before redoing."
    } else {
        Write-Line "Reopened orphaned row #$($row.Number) - cycle $deadCycle took it and never finished."
    }
} else {
    Write-Line "Row #$($row.Number) is orphaned IN PROGRESS but could not be rewritten. Check its formatting."
}
```

The mid-run path now reads:

```powershell
foreach ($row in $stranded) {
    $why = if ($outcome -eq "timed-out") { "was killed at the $CycleTimeoutMinutes minute deadline" }
           elseif ($outcome -eq "failed to run") { "never started" }
           else { "ended badly" }
    $mergedOnMain = Test-RowMergedOnMain $row.Number
    $newStatus = Get-OrphanReopenStatus -CycleNumber $cycle `
        -ReasonSuffix "reopened - cycle $cycle $why and did not finish this" `
        -MergedOnMain $mergedOnMain
    if (Set-QueueRowStatus $row.Number $newStatus) {
        if ($mergedOnMain) {
            Write-Line "Gave row #$($row.Number) back to the queue as PARTIAL - cycle $cycle $why, but main's history already mentions this row. VERIFY before redoing."
        } else {
            Write-Line "Gave row #$($row.Number) back to the queue - cycle $cycle $why, so it is TODO again rather than stranded."
        }
    } else {
        Write-Line "Row #$($row.Number) is stranded on cycle $cycle and could NOT be rewritten. Check its formatting."
    }
}
```

Neither path is taught to decide a row is `DONE`. Both only choose which
warning word goes in front of the reopen note that was already being written.
`Set-QueueRowStatus` itself is unchanged — it still refuses to touch a row it
cannot parse, and it still writes exactly one row.

## Why the matcher works

Every row's landing commit in this repository's own history names its row
directly — either because the branch-naming convention
(`fix/reply-matcher-plus-alias-row100`, `feat/ai-processor-coverage-gate-row101`)
surfaces into the merge/squash commit subject, or because the message says so
outright:

```
3cd6fd1 docs(relay): row 101 - verify and close CR-10 engineering half (cycle 126) (#421)
8b2370f fix(mailbox): canonicalize plus-alias recipients in reply matching (row 100) (#419)
```

`Test-RowNumberMergedInLog` anchors `\brow\s*<N>\b` on both sides, so row 10
is never falsely matched inside "row 100" or "row 101", and a row with no
commit at all (row 103, before this fix landed) correctly comes back `$false`.

## Red, then green

`relay-selftest.ps1` had 35 checks before this cycle. A new section 8 was
added asserting the reopened-row status carries the `PARTIAL ... VERIFY main
BEFORE redoing` warning form when the row's number is found merged on `main`,
and stays a bare `TODO` when it is not. The implementation was stashed out of
`relay-watch.ps1` (`git stash push -- relay-watch.ps1`) before running the
test, so the new functions genuinely did not exist yet:

```
8. A timed-out row whose work is already merged is reopened with a warning
Test-RowNumberMergedInLog : The term 'Test-RowNumberMergedInLog' is not recognized as the name of a cmdlet, function,
script file, or operable program. Check the spelling of the name, or if a path was included, verify that the path is
correct and try again.
At C:\Bidlowprojects\BidlowClients\Opensdoors\ODoutreach\relay-selftest.ps1:379 char:15
+ Assert-True ((Test-RowNumberMergedInLog $mainLogWithMergedRows "101") ...
+               ~~~~~~~~~~~~~~~~~~~~~~~~~
    + CategoryInfo          : ObjectNotFound: (Test-RowNumberMergedInLog:String) [], ParentContainsErrorRecordExceptio
   n
    + FullyQualifiedErrorId : CommandNotFoundException
```

Red confirmed. The stash was restored (`git stash pop`) and the self-test run
again:

```
8. A timed-out row whose work is already merged is reopened with a warning
  PASS  row 101's merge commit ('row 101 - verify and close...') is recognised in main's history
  PASS  row 100's merge commit ('...matching (row 100) (#419)') is recognised in main's history
  PASS  row 10 is NOT falsely matched inside 'row 100' or 'row 101' - the word-boundary check holds
  PASS  a row with no commit at all (this row, 103, before this fix lands) is correctly reported as not merged
  PASS  a merged, timed-out row is reopened as PARTIAL with the verify-first warning, not a bare TODO (got: PARTIAL 125 - work may already be merged, VERIFY main BEFORE redoing (reopened - cycle 125 was killed at the 45 minute deadline and did not finish this))
  PASS  the original reopen reason is still carried in full - nothing the old behaviour recorded is lost (got: PARTIAL 125 - work may already be merged, VERIFY main BEFORE redoing (reopened - cycle 125 was killed at the 45 minute deadline and did not finish this))
  PASS  a row with nothing found on main is still reopened as a plain TODO, exactly as before this fix (got: TODO (reopened - cycle 41 was killed at the 45 minute deadline and did not finish this))
  PASS  the PARTIAL warning is never applied when nothing was found on main - a false alarm here would train Greg to ignore it

SELF-TEST PASSED - 43 checks.
```

35 checks before, 43 after (8 new).

## The documentation half — this is what protects tonight

Row 103's brief was explicit that any change to `relay-watch.ps1` is **inert
until the watcher process is restarted**, because PowerShell reads a script
once at launch and runs from memory — the exact lesson of queue row 52. So the
code fix above will do nothing for the currently-running watcher process, if
one is running, until it is stopped and `relay-start.cmd` is run by hand. That
restart was **deliberately not performed by this cycle** — row 103's own
instructions forbid it.

To protect tonight regardless, the standing rule was written directly into two
places a cycle reads immediately, before touching any code:

- `RELAY-README.md`, under "1. A stuck cycle gets 45 minutes, then it is
  killed" — the plain-English version, for Greg.
- `CLAUDE.md`, as its own section, "A row reopened after a relay timeout may
  already be merged — check `main` first" — the version an agent cycle reads
  as part of its standing instructions on every run.

Both say the same thing: if you are handed a row that was reopened after a
timeout, your first action is `git log --oneline -10 main` for that row's
number, and if the merged work satisfies the brief, verify and close the row
rather than redoing it.

## Gates run

- `npm run lint` — 0 problems
- `npm run typecheck` (`tsc --noEmit`) — 0 errors
- `npm test` — full unit suite green
- `.\relay-selftest.ps1` — 43/43 checks green (was 35/35 before this cycle)

(Exact output captured in the cycle 128 log, `.bidlow/relay/log/cycle-128.md`.)

## What this does NOT do

- It does not change the 45-minute deadline.
- It does not let the watcher mark any row `DONE`. `Get-OrphanReopenStatus`
  has exactly two outputs: a bare `TODO` and a `PARTIAL ... VERIFY` warning.
  Closing a row is still, and will always be, a decision a person or the next
  cycle makes by reading the brief.
- It is **inert on the currently-running watcher process, if one exists**,
  until that process is stopped and restarted via `relay-start.cmd`. This
  cycle did not perform that restart.
