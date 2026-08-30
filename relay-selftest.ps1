# relay-selftest.ps1 - proves the relay's safety machinery actually FIRES.
#
#   Run it yourself:  .\relay-selftest.ps1
#   The watcher runs it automatically every time it starts, and REFUSES to run
#   if it fails.
#
# ---------------------------------------------------------------------------
# WHY THIS IS A STARTUP GATE AND NOT A CI JOB
#
# QUEUE.md records eight instances this week of something built, wired,
# reporting success, and never firing. The relay's timeout is a perfect
# candidate for the ninth: it only matters on the one night a cycle hangs, and
# nobody would ever notice it had rotted.
#
# The watcher only ever runs on Greg's laptop, so a CI job on a Linux runner
# would not exercise the thing that actually runs. Making it a startup gate is
# strictly stronger: it fires on EVERY start, on the real machine, against the
# real code, and a failure stops the relay instead of turning a check amber
# somewhere nobody looks.
# ---------------------------------------------------------------------------
#
# THIS FILE IS DELIBERATELY PLAIN ASCII - see the note at the top of
# relay-watch.ps1. Typographic punctuation makes PowerShell unable to parse it.

$ErrorActionPreference = "Stop"

$script:Failures = New-Object System.Collections.Generic.List[string]
$script:Passes   = 0

function Assert-True($condition, $what) {
    if ($condition) {
        $script:Passes++
        Write-Host "  PASS  $what"
    } else {
        $script:Failures.Add($what)
        Write-Host "  FAIL  $what" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "Relay self-test - proving the safety machinery fires, not that it exists."
Write-Host ""

# Load the watcher's functions WITHOUT starting the loop.
. (Join-Path $PSScriptRoot "relay-watch.ps1") -LoadOnly

# ===========================================================================
# 1. THE TIMEOUT ACTUALLY KILLS A HUNG CYCLE
#
# The real failure being guarded against: `claude -p` hangs, and the watcher
# blocks on it forever. Only a human can clear that, which is exactly the
# thing this cycle exists to remove.
#
# The fake hung agent is `cmd.exe` launching a PowerShell that sleeps. That is
# deliberate: it makes cmd the child and PowerShell a GRANDCHILD. Killing only
# the process we started would leave the sleeping grandchild alive, holding the
# output files, and the relay would look like it recovered when it had not.
# ===========================================================================

Write-Host "1. A hung cycle is killed, and its children die with it"

$stdinFile = Join-Path $env:TEMP "relay-selftest-stdin.txt"
Set-Content -Path $stdinFile -Value "this input is never read" -Encoding ascii

$started = Get-Date
$result  = Invoke-CycleAgent `
    -PromptPath      $stdinFile `
    -TimeoutSeconds  8 `
    -Exe             "cmd.exe" `
    -ExeArgs         @("/c", "powershell -NoProfile -Command Start-Sleep -Seconds 300")
$elapsed = ((Get-Date) - $started).TotalSeconds

Assert-True ($result.TimedOut -eq $true) `
    "a cycle that overruns is reported as timed out"

Assert-True ($elapsed -lt 40) `
    "it is killed at the deadline rather than waited out (took $([math]::Round($elapsed,1))s, deadline was 8s)"

# The assertion that matters. A "kill" that leaves the tree running is the
# same defect as no kill at all, and it would look identical from the log.
$survivors = New-Object System.Collections.Generic.List[string]
foreach ($deadPid in $result.Pids) {
    if (Get-Process -Id $deadPid -ErrorAction SilentlyContinue) { $survivors.Add($deadPid) }
}
Assert-True ($survivors.Count -eq 0) `
    "no process from the killed cycle is still running (checked $($result.Pids.Count): $($result.Pids -join ', '))"

Assert-True ($result.Pids.Count -ge 2) `
    "the test really did create a process tree, so the tree-kill was exercised"

# ===========================================================================
# 2. A NORMAL CYCLE IS NOT AFFECTED
#
# A timeout that also breaks the ordinary path would be worse than no timeout.
# ===========================================================================

Write-Host ""
Write-Host "2. A normal cycle still runs, and its output is captured"

$result2 = Invoke-CycleAgent `
    -PromptPath     $stdinFile `
    -TimeoutSeconds 60 `
    -Exe            "cmd.exe" `
    -ExeArgs        @("/c", "echo relay-selftest-marker")

Assert-True ($result2.TimedOut -eq $false) "a cycle that finishes in time is not reported as timed out"
Assert-True ($result2.ExitCode -eq 0)      "its exit code is read back"
Assert-True ($result2.Output -match "relay-selftest-marker") "its output is captured, not lost"

# ===========================================================================
# 3. A CYCLE THAT FAILS IS REPORTED AS FAILED
# ===========================================================================

Write-Host ""
Write-Host "3. A cycle that exits badly is reported, not swallowed"

$result3 = Invoke-CycleAgent `
    -PromptPath     $stdinFile `
    -TimeoutSeconds 60 `
    -Exe            "cmd.exe" `
    -ExeArgs        @("/c", "exit 3")

Assert-True ($result3.ExitCode -eq 3) "a non-zero exit code is reported (got $($result3.ExitCode))"
Assert-True ($result3.TimedOut -eq $false) "a fast failure is not mistaken for a timeout"

# A program that does not exist must be reported, never treated as a clean run.
$result4 = Invoke-CycleAgent `
    -PromptPath     $stdinFile `
    -TimeoutSeconds 60 `
    -Exe            "this-program-does-not-exist-relay-selftest.exe" `
    -ExeArgs        @()

Assert-True ($result4.Started -eq $false) "a cycle that could not start at all says so"

Remove-Item $stdinFile -Force -ErrorAction SilentlyContinue

# ===========================================================================
# 4. THE ALERT PATH IS ARMED
#
# This does NOT send. If it did, Greg would get an email every time the relay
# started, and an alert that arrives when nothing is wrong is one he learns to
# ignore.
#
# What it checks is everything that can be checked without sending: the tool
# exists, it is signed in, and the workflow that does the sending is present.
# Those are the three ways this silently stops working.
# ===========================================================================

Write-Host ""
Write-Host "4. The alert path is armed (nothing is sent)"

$armed = Test-AlertPathArmed
Assert-True $armed.Ok "Greg can actually be emailed if a cycle fails ($($armed.Detail))"

# The mute that exists for the test suite must never be in force on the real
# relay. Because this self-test is a STARTUP GATE, failing here refuses to start
# the watcher at all - so a stray RELAY_ALERT_SUPPRESS cannot produce a relay
# that runs all night with its alarm disconnected. It stops it, loudly, instead.
Assert-True ([string]::IsNullOrEmpty($env:RELAY_ALERT_SUPPRESS)) `
    "the alarm is not muted (RELAY_ALERT_SUPPRESS is not set)"

# ===========================================================================
# 5. A SILENT RELAY SHOUTS
#
# The failure this guards against, twice on 2026-08-26: the relay went quiet
# with a full queue behind it and only a human happening to look noticed. Once
# because a cycle hung, once because one malformed row made it idle for 30
# minutes. Overnight, either costs the whole night.
#
# The decision is tested here, not the send. If the self-test actually emailed,
# Greg would get one every time the relay started, and an alert that arrives
# when nothing is wrong is one he learns to ignore. The SEND is proved
# separately and deliberately, by relay-stall-proof.ps1.
#
# Time is injected rather than waited for. A test that takes 20 minutes to run
# is a test that runs once and then gets commented out.
# ===========================================================================

Write-Host ""
Write-Host "5. Going quiet with work still waiting raises the alarm"

$now = Get-Date

# The case that cost the night: idle well past the threshold, jobs waiting.
$stalled = Get-StallVerdict -IdleSince $now.AddMinutes(-25) -Now $now `
    -ThresholdMinutes 20 -AlreadyAlerted $false -TodoCount 5
Assert-True ($stalled.ShouldAlert -eq $true) `
    "25 minutes idle with 5 jobs waiting raises the alarm"
Assert-True ($stalled.Subject -match 'STALLED') `
    "the subject line says STALLED so it is obvious in a phone notification"
Assert-True ($stalled.Subject -match '5') `
    "the subject says how many jobs are waiting (got: $($stalled.Subject))"

# Not yet idle enough. A relay between items is not a broken relay.
$young = Get-StallVerdict -IdleSince $now.AddMinutes(-3) -Now $now `
    -ThresholdMinutes 20 -AlreadyAlerted $false -TodoCount 5
Assert-True ($young.ShouldAlert -eq $false) `
    "3 minutes between items is normal and stays quiet"

# An empty queue is not a stall. The relay has finished, which is good news.
$empty = Get-StallVerdict -IdleSince $now.AddMinutes(-90) -Now $now `
    -ThresholdMinutes 20 -AlreadyAlerted $false -TodoCount 0
Assert-True ($empty.ShouldAlert -eq $false) `
    "idle with an EMPTY queue stays quiet - finishing the work is not a fault"

# "Send once per stall, not every 20 minutes" - verbatim from the queue item.
$repeat = Get-StallVerdict -IdleSince $now.AddMinutes(-300) -Now $now `
    -ThresholdMinutes 20 -AlreadyAlerted $true -TodoCount 5
Assert-True ($repeat.ShouldAlert -eq $false) `
    "a stall already reported is not reported again every 20 minutes"

# ===========================================================================
# 6. THE COUNT IN THE SUBJECT IS REAL
#
# The subject line promises a number of waiting jobs. If that number came from
# a parser that quietly returned zero, the alert would never fire at all - the
# exact defect class this repository has recorded eight times.
# ===========================================================================

Write-Host ""
Write-Host "6. The waiting-jobs count is read from a real queue file"

$fixture = Join-Path $env:TEMP "relay-selftest-queue.md"
@(
    "| 1 | done thing | DONE 4 |"
    "| 2 | waiting thing | TODO |"
    "| 3 | running thing | IN PROGRESS 29 |"
    "| 4 | another waiting thing | TODO |"
    "| 5 | held thing | BLOCKED waiting on Greg |"
) | Set-Content -Path $fixture -Encoding utf8

Assert-True ((Get-QueueTodoCount $fixture) -eq 2) `
    "exactly the TODO rows are counted, not DONE / IN PROGRESS / BLOCKED (got $(Get-QueueTodoCount $fixture))"

# The 2026-08-26 fault, reproduced: a row whose status cell cannot be read.
# It must be REPORTED, and reported ONCE per distinct broken row.
$broken = Join-Path $env:TEMP "relay-selftest-queue-broken.md"
@(
    "| 1 | done thing | DONE 4 |"
    "| 2 | a row whose status nobody can read | ?????? |"
    "| 3 | waiting thing | TODO |"
) | Set-Content -Path $broken -Encoding utf8

$badRows = @(Get-QueueRows $broken | Where-Object { -not $_.Parsed })
Assert-True ($badRows.Count -eq 1) `
    "an unreadable row is found and kept, never silently dropped (found $($badRows.Count))"
Assert-True ($badRows[0].Number -eq "2") `
    "the alert can say WHICH row is broken - that is exactly what bit us (got row $($badRows[0].Number))"

Assert-True ((Register-BadRowAlert "row-2-version-a") -eq $true) `
    "a newly broken row is reported"
Assert-True ((Register-BadRowAlert "row-2-version-a") -eq $false) `
    "the same broken row is not reported again on every retry"
Assert-True ((Register-BadRowAlert "row-2-version-b") -eq $true) `
    "but a DIFFERENT broken row is reported, so a second fault is never masked"

Remove-Item $fixture -Force -ErrorAction SilentlyContinue
Remove-Item $broken  -Force -ErrorAction SilentlyContinue

# ===========================================================================
# 7. A FINDING HANDED ON IN A LOG REACHES QUEUE.md
#
# Twice, a cycle wrote down that it owed the queue a row and then exited without
# writing one - cycle 50 ("I'm queueing it as a new row") and cycle 52 ("two
# things for you rather than for me"). Both findings then existed only inside a
# log, and nothing downstream reads old logs. Cycle 52 lost its entire
# reconnaissance re-deriving the first one.
#
# The unit behaviour is covered by relay/unmirrored-finding.test.ts in CI. What
# THIS section adds is the composition the watcher's loop actually performs -
# take the row numbers, judge the log, carry the words, read the queue back -
# run on the real machine, against the real relay-watch.ps1, at every start.
#
# It also replays the REAL cycle-050.md, so the detector is held against true
# history rather than against a fixture written to make it pass.
# ===========================================================================

Write-Host ""
Write-Host "7. A finding a cycle handed on is carried into QUEUE.md"

$handoffQueue = Join-Path $env:TEMP "relay-selftest-handoff-queue.md"
@(
    "| # | Item | Status |"
    "|---|---|---|"
    "| 1 | a finished thing | DONE 4 |"
    "| 2 | a waiting thing | TODO |"
    "| 3 | a held thing | BLOCKED waiting on Greg |"
) | Set-Content -Path $handoffQueue -Encoding utf8

$rowsBefore = @(@(Get-QueueRows $handoffQueue) | ForEach-Object { [string]$_.Number })
Assert-True ($rowsBefore.Count -eq 3) `
    "the fixture queue is read before the cycle, so the comparison is not vacuous (got $($rowsBefore.Count) rows)"

# The shape of a real cycle log: a heading, then the cycle's own words.
$handoffLog = "# Cycle 99 - finished`n`n## What it did`n`nShipped the thing.`n`nSeparate finding - not this item. I'm queueing it as a new row.`n"

# BOTH cycles that failed this way DID write to QUEUE.md - each stamped its own
# row DONE. So the same row numbers before and after is the real-world case, and
# a check on "did the file change" would have caught neither.
$verdict = Get-UnmirroredFindingVerdict -LogText $handoffLog -RowNumbersBefore $rowsBefore -RowNumbersAfter $rowsBefore
Assert-True ($verdict.ShouldRecord -eq $true) `
    "a cycle that hands a finding on and adds no new row is caught"
Assert-True (@($verdict.Passages).Count -gt 0) `
    "the cycle's own sentence is captured, so the queue row can quote it (got $(@($verdict.Passages).Count))"

$mirrored = Get-UnmirroredFindingVerdict -LogText $handoffLog -RowNumbersBefore $rowsBefore -RowNumbersAfter (@($rowsBefore) + @("4"))
Assert-True ($mirrored.ShouldRecord -eq $false) `
    "a cycle that DID add a queue row is left alone, so doing the right thing is never punished"

$quiet = Get-UnmirroredFindingVerdict -LogText "# Cycle 98 - finished`n`n## What it did`n`nRan the gates. All green." -RowNumbersBefore $rowsBefore -RowNumbersAfter $rowsBefore
Assert-True ($quiet.ShouldRecord -eq $false) `
    "an ordinary cycle raises nothing - a gate that cries wolf gets ignored"

# The real log, from git, not a fixture built to pass.
$realLog = Join-Path $PSScriptRoot ".bidlow\relay\log\cycle-050.md"
if (Test-Path $realLog) {
    $realPassages = @(Get-CycleHandoffPassages ([string](Get-Content $realLog -Raw -Encoding UTF8)))
    Assert-True ($realPassages.Count -gt 0) `
        "the real cycle-050.md - the log whose finding cost cycle 52 its reconnaissance - is detected (got $($realPassages.Count) passages)"
} else {
    Assert-True $false "cycle-050.md is missing, so the detector could not be replayed against real history"
}

$carried = Add-QueueRowForHandoff -Cycle 99 -Passages $verdict.Passages -LogPath ".bidlow/relay/log/cycle-099.md" -Path $handoffQueue
Assert-True ($carried.Added -eq $true) `
    "the finding is written into the queue file ($($carried.Reason))"

# Read it back through the picker's own parser. A row the relay cannot read
# would STOP THE WHOLE QUEUE - the seventh-word failure, caused by the relay.
$afterRows = @(Get-QueueRows $handoffQueue)
$newRow    = $afterRows | Where-Object { $_.Number -eq $carried.Number } | Select-Object -First 1
Assert-True ($null -ne $newRow -and $newRow.Parsed) `
    "the row the relay wrote is readable by Get-QueueRows, so it cannot stall the queue"
Assert-True ($null -ne $newRow -and $newRow.Status -match '^TODO') `
    "it comes back as TODO, so the picker will actually take it"
Assert-True ($null -ne $newRow -and $newRow.Item -match 'queueing it as a new row') `
    "it carries the cycle's own words, not the relay's summary of them"

# Above the BLOCKED row, or the picker idles the moment it reaches it and the
# new finding is buried behind a permanent stop.
$orderedNumbers = @($afterRows | ForEach-Object { [string]$_.Number })
Assert-True (($orderedNumbers -join ",") -eq "1,2,$($carried.Number),3") `
    "it is placed ABOVE the BLOCKED row, so the picker still reaches it (order was $($orderedNumbers -join ','))"

Remove-Item $handoffQueue -Force -ErrorAction SilentlyContinue

# ===========================================================================
# 8. A TIMED-OUT ROW WHOSE WORK IS ALREADY MERGED IS REOPENED WITH A WARNING,
#    NOT A BARE TODO
#
# Row 103. Observed 30 August: cycle 125 finished row 101 in full and its PR
# merged as #420, but the 45-minute kill fired before it could write DONE 125
# into the status cell. Both orphan-reopen paths in relay-watch.ps1 - the one
# at startup and the one around the mid-run 45-minute timeout - wrote a bare
# "TODO (reopened...)", which told cycle 126 nothing about the work already on
# main. A human caught it by hand and amended the brief; that catch will not
# happen when nobody is watching.
#
# The orphan reopen is right - a stranded row must go back to the picker or it
# is skipped for ever. The bug is that it reopened BLIND. Test-RowMergedOnMain
# is split into a pure matcher (this section) and an I/O wrapper that runs
# `git log`, exactly as Get-EvidenceVerdict is split from Get-RepoEvidence
# above - so this drives the matching logic directly, against real commit
# subjects from this repository's own history, without needing a git checkout.
# ===========================================================================

Write-Host ""
Write-Host "8. A timed-out row whose work is already merged is reopened with a warning"

# Real commit subjects from this repository's own `git log`, not a fixture
# written to make the test pass.
$mainLogWithMergedRows = @"
3b3fcb0 docs(state): record cycle 127 - row 102 reply-matcher measurement
b6c57e7 docs(relay): row 102 - measure reply-matcher mis-filing, fix prefix gap
3cd6fd1 docs(relay): row 101 - verify and close CR-10 engineering half (cycle 126) (#421)
8b2370f fix(mailbox): canonicalize plus-alias recipients in reply matching (row 100) (#419)
"@

Assert-True ((Test-RowNumberMergedInLog $mainLogWithMergedRows "101") -eq $true) `
    "row 101's merge commit ('row 101 - verify and close...') is recognised in main's history"
Assert-True ((Test-RowNumberMergedInLog $mainLogWithMergedRows "100") -eq $true) `
    "row 100's merge commit ('...matching (row 100) (#419)') is recognised in main's history"
Assert-True ((Test-RowNumberMergedInLog $mainLogWithMergedRows "10") -eq $false) `
    "row 10 is NOT falsely matched inside 'row 100' or 'row 101' - the word-boundary check holds"
Assert-True ((Test-RowNumberMergedInLog $mainLogWithMergedRows "103") -eq $false) `
    "a row with no commit at all (this row, 103, before this fix lands) is correctly reported as not merged"

# The behaviour that actually matters: a timed-out row whose number IS in
# main's history comes back as PARTIAL with the verify-first warning, not TODO.
$mergedStatus = Get-OrphanReopenStatus -CycleNumber "125" `
    -ReasonSuffix "reopened - cycle 125 was killed at the 45 minute deadline and did not finish this" `
    -MergedOnMain $true
Assert-True ($mergedStatus -match '^PARTIAL 125 - work may already be merged, VERIFY main BEFORE redoing') `
    "a merged, timed-out row is reopened as PARTIAL with the verify-first warning, not a bare TODO (got: $mergedStatus)"
Assert-True ($mergedStatus -match 'reopened - cycle 125 was killed at the 45 minute deadline') `
    "the original reopen reason is still carried in full - nothing the old behaviour recorded is lost (got: $mergedStatus)"

$unmergedStatus = Get-OrphanReopenStatus -CycleNumber "41" `
    -ReasonSuffix "reopened - cycle 41 was killed at the 45 minute deadline and did not finish this" `
    -MergedOnMain $false
Assert-True ($unmergedStatus -match '^TODO \(reopened') `
    "a row with nothing found on main is still reopened as a plain TODO, exactly as before this fix (got: $unmergedStatus)"
Assert-True ($unmergedStatus -notmatch 'PARTIAL') `
    "the PARTIAL warning is never applied when nothing was found on main - a false alarm here would train Greg to ignore it"

# ===========================================================================
# 9. A STALE .git/index.lock IS CLEARED AT CYCLE START, BUT ONE HELD BY A LIVE
#    GIT PROCESS IS LEFT ALONE
#
# Row 120. Cycles 146 and 147 were killed at the 45-minute deadline while git
# held the index lock; the kill left the lock file on disk, and every commit
# from every cycle that followed failed against it until a human noticed and
# renamed it away by hand. Twice.
#
# A scratch repo, not the real one, so this test can plant and remove a lock
# file without ever touching this repository's own git state.
# ===========================================================================

Write-Host ""
Write-Host "9. A stale .git/index.lock is cleared; one a live git process holds is left alone"

$scratchRepo = Join-Path $env:TEMP ("relay-selftest-lockrepo-" + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path (Join-Path $scratchRepo ".git") -Force | Out-Null
$scratchLock = Join-Path $scratchRepo ".git\index.lock"

# No lock at all - the ordinary case, every cycle, forever. Must do nothing.
$noLock = Clear-StaleIndexLock -RepoPath $scratchRepo -Now (Get-Date)
Assert-True ($noLock.Found -eq $false -and $noLock.Removed -eq $false) `
    "no lock present means nothing is found and nothing is touched"

# Plant a lock and back-date it, exactly as a killed git process would leave
# one - then say a live git process is holding it. This must be LEFT ALONE.
Set-Content -Path $scratchLock -Value "" -Encoding ascii
(Get-Item $scratchLock).LastWriteTime = (Get-Date).AddMinutes(-90)

$fakeLiveGit = [pscustomobject]@{ Id = 424242 }
$held = Clear-StaleIndexLock -RepoPath $scratchRepo -Now (Get-Date) -GitProcessCheck { $fakeLiveGit }
Assert-True ($held.Found -eq $true -and $held.Held -eq $true -and $held.Removed -eq $false) `
    "a lock held by a live git process is detected but NOT removed"
Assert-True (Test-Path $scratchLock) `
    "the lock file is still on disk - it must survive being held"
Assert-True ($held.Note -match '424242') `
    "the log line names the PID holding it, so a human can check it (got: $($held.Note))"

# Same lock, same age, but now no git process holds it - the case that cost
# cycles 148 and 149 a night's work. This must be REMOVED, and the removal
# must be LOGGED PLAINLY, including how old the lock was.
$stale = Clear-StaleIndexLock -RepoPath $scratchRepo -Now (Get-Date) -GitProcessCheck { $null }
Assert-True ($stale.Found -eq $true -and $stale.Removed -eq $true -and $stale.Held -eq $false) `
    "a stale lock with no live git process holding it is cleared"
Assert-True (-not (Test-Path $scratchLock)) `
    "the lock file is actually gone from disk, not just reported as gone"
Assert-True ($stale.Note -match '(?i)stale' -and $stale.Note -match '\.git.index\.lock') `
    "the action is logged plainly, naming the lock (got: $($stale.Note))"
Assert-True ($stale.Note -match '9\d(\.\d+)? minutes old') `
    "the log line states how old the lock was, per the brief's own wording (got: $($stale.Note))"

# The watcher's real call site passes no -GitProcessCheck at all, so the
# default must genuinely ask the OS, not merely accept whatever is handed to
# it - a check that always "sees no git" would clear a lock a real commit is
# using and corrupt the index.
$defaultParam = (Get-Command Clear-StaleIndexLock).Parameters['GitProcessCheck']
Assert-True ($null -ne $defaultParam) `
    "Clear-StaleIndexLock exposes a GitProcessCheck parameter for the real call site to rely on"

Remove-Item -Path $scratchRepo -Recurse -Force -ErrorAction SilentlyContinue

# ===========================================================================
# 10. A DONE THAT NEVER MERGED IS REWRITTEN TO PARTIAL, AND AN "IN PROGRESS"
#     ROW ABANDONED BY A CLEANLY-ENDED CYCLE IS NO LONGER INVISIBLE FOR EVER
#
# Row 121, the mirror of row 103 above. Cycle 148 wrote `DONE 148` describing a
# full passing spec while its own log said it was blocked and could not
# commit; `origin/main` never moved. Separately, cycle 150 ended cleanly
# (exit code 0) having run out of time waiting on a rebuild and never wrote a
# status word for row 117 at all - the mid-run reopen above only fired for
# timed-out / failed / failed-to-run, so a clean exit left the row invisible
# to the picker for good.
# ===========================================================================

Write-Host ""
Write-Host "10. A DONE with no merge behind it is rewritten to PARTIAL; a cleanly-ended cycle still gives its row back"

# --- 10a. The text scan: does this row's OWN brief demand a merge? ---------

$mergeRequiredBrief = @"
**THE WORK:** build the thing red-first.
**DEFINITION OF DONE:** the check in place, both tests passing and failing red
without the change, lint 0, typecheck 0, full suite green, and the merge
commit hash on origin/main quoted in your log.
"@
Assert-True ((Test-RowDefinitionOfDoneDemandsMerge $mergeRequiredBrief) -eq $true) `
    "a brief whose Definition of Done unconditionally asks for a merge commit hash demands a merge"

$artefactOnlyBrief = @"
**THE WORK:** measure it, read-only, and say what is actually wrong.
**DEFINITION OF DONE:** a dated artefact naming the finding, with the probe
output quoted; any fix red-first with the failure quoted; lint 0, typecheck 0,
full suite green, merged to main. If the honest answer is that only a human
can clear it, say so plainly - that is a complete and valuable outcome.
"@
Assert-True ((Test-RowDefinitionOfDoneDemandsMerge $artefactOnlyBrief) -eq $false) `
    "a brief whose Definition of Done allows 'that is a complete and valuable outcome' does not demand a merge"

Assert-True ((Test-RowDefinitionOfDoneDemandsMerge "") -eq $true) `
    "a row with no brief text at all defaults to demanding a merge - the safe direction, since most rows do"

# --- 10b. The pure decision: rewrite only when a merge was demanded and none was found ---

$rewritten = Get-DoneWithoutMergeStatus -CurrentStatus "DONE 148 - spec written, tests pass" `
    -DemandsMerge $true -MergedOnMain $false -RowNumber "117" -CycleNumber "148"
Assert-True ($rewritten -match '^PARTIAL 148 - closed DONE but no commit naming row 117 was found on main') `
    "a row that demanded a merge and has none is rewritten to PARTIAL (got: $rewritten)"
Assert-True ($rewritten -match 'DONE 148 - spec written, tests pass') `
    "the cycle's own original DONE text is carried in full, not discarded (got: $rewritten)"

$leftAloneMerged = Get-DoneWithoutMergeStatus -CurrentStatus "DONE 125 - merged as #420" `
    -DemandsMerge $true -MergedOnMain $true -RowNumber "101" -CycleNumber "125"
Assert-True ($leftAloneMerged -eq "DONE 125 - merged as #420") `
    "a row that demanded a merge and HAS one is left exactly as the cycle wrote it"

$leftAloneNoDemand = Get-DoneWithoutMergeStatus -CurrentStatus "DONE 151 - investigation only, category (b)" `
    -DemandsMerge $false -MergedOnMain $false -RowNumber "118" -CycleNumber "151"
Assert-True ($leftAloneNoDemand -eq "DONE 151 - investigation only, category (b)") `
    "a row whose brief never demanded a merge is left alone even with nothing found on main"

# --- 10c. The full check, end to end, against real Get-QueueRows parsing:
#          closes a fake row DONE with no merge behind it, and an
#          artefact-only row DONE the same way. Get-QueueRows IS parameterised
#          by path (unlike Set-QueueRowStatus, which always targets the real
#          QUEUE.md - the real call site never needs anything else, since it
#          only ever acts on the file the watcher itself is running against),
#          so this drives the row-reading half against a real fixture file and
#          the decision half through the exact functions the call site uses. ---

$doneQueue = Join-Path $env:TEMP "relay-selftest-done-queue.md"
$mergeRequiredFlat  = $mergeRequiredBrief  -replace "[\r\n]+", ' '
$artefactOnlyFlat   = $artefactOnlyBrief   -replace "[\r\n]+", ' '
@(
    "| # | Item | Status |"
    "|---|---|---|"
    "| 200 | $mergeRequiredFlat | DONE 148 - spec written, tests pass, lint 0, typecheck 0 |"
    "| 201 | $artefactOnlyFlat | DONE 151 - investigation only, no fix needed, category (b) |"
) | Set-Content -Path $doneQueue -Encoding utf8

$queueRows = Get-QueueRows $doneQueue
$fakeRow      = $queueRows | Where-Object { $_.Number -eq "200" } | Select-Object -First 1
$artefactRow  = $queueRows | Where-Object { $_.Number -eq "201" } | Select-Object -First 1
Assert-True ($fakeRow.Parsed -and $artefactRow.Parsed) `
    "both fixture rows are readable before the check runs"

# No commit anywhere names row 200 or row 201 - the exact shape of cycle 148's
# failure, where origin/main never moved at all.
$noMergeLog = "3b3fcb0 docs(relay): row 118 - something else entirely`n"

$fakeDemands   = Test-RowDefinitionOfDoneDemandsMerge $fakeRow.Item
$fakeMerged    = Test-RowNumberMergedInLog $noMergeLog $fakeRow.Number
$fakeNewStatus = Get-DoneWithoutMergeStatus -CurrentStatus $fakeRow.Status `
    -DemandsMerge $fakeDemands -MergedOnMain $fakeMerged -RowNumber $fakeRow.Number -CycleNumber "148"
Assert-True ($fakeNewStatus -match '^PARTIAL 148 - closed DONE but no commit naming row 200 was found on main') `
    "the fake row, DONE with no merge behind it and read back through the real Get-QueueRows parser, is rewritten to PARTIAL (got: $fakeNewStatus)"

$artefactDemands   = Test-RowDefinitionOfDoneDemandsMerge $artefactRow.Item
$artefactMerged    = Test-RowNumberMergedInLog $noMergeLog $artefactRow.Number
$artefactNewStatus = Get-DoneWithoutMergeStatus -CurrentStatus $artefactRow.Status `
    -DemandsMerge $artefactDemands -MergedOnMain $artefactMerged -RowNumber $artefactRow.Number -CycleNumber "151"
Assert-True ($artefactNewStatus -eq $artefactRow.Status) `
    "the artefact-only row, DONE with no merge behind it and read back the same way, is left alone because its own brief never demanded one (got: $artefactNewStatus)"

Remove-Item $doneQueue -Force -ErrorAction SilentlyContinue

# --- 10d. The mid-run reopen fires for EVERY outcome, not just the three bad ones ---

$orphanQueue = @(
    [pscustomobject]@{ Number = "117"; Item = "irrelevant"; Status = "IN PROGRESS 150"; Parsed = $true }
    [pscustomobject]@{ Number = "9";   Item = "irrelevant"; Status = "IN PROGRESS 41";  Parsed = $true }
    [pscustomobject]@{ Number = "5";   Item = "irrelevant"; Status = "DONE 40";         Parsed = $true }
)
$neverMerged = { param($n) $false }

# The case row 121 exists to fix: outcome "finished" (a clean exit), which the
# old code never even looked at.
$finishedActions = Get-StrandedRowActions -QueueRows $orphanQueue -CycleNumber "150" `
    -Outcome "finished" -CycleTimeoutMinutes 45 -MergeCheck $neverMerged
Assert-True ($finishedActions.Count -eq 1 -and $finishedActions[0].RowNumber -eq "117") `
    "a row left IN PROGRESS by a cycle that exited cleanly (outcome 'finished') is still reopened (got $($finishedActions.Count) action(s))"
Assert-True ($finishedActions[0].NewStatus -match '^TODO \(reopened - cycle 150 ended \(outcome: finished\) without writing a status word') `
    "the reopen note says the cycle ended without writing a status word, not a fabricated timeout reason (got: $($finishedActions[0].NewStatus))"

# outcome "no-change" - the other clean-exit case - must fire too.
$noChangeActions = Get-StrandedRowActions -QueueRows $orphanQueue -CycleNumber "150" `
    -Outcome "no-change" -CycleTimeoutMinutes 45 -MergeCheck $neverMerged
Assert-True ($noChangeActions.Count -eq 1 -and $noChangeActions[0].RowNumber -eq "117") `
    "a row left IN PROGRESS by a cycle that ended with no changes at all is still reopened"

# Regression guard: the original timed-out wording must still read exactly as
# it did before this row, and a row held by a DIFFERENT cycle must never move.
$timedOutActions = Get-StrandedRowActions -QueueRows $orphanQueue -CycleNumber "41" `
    -Outcome "timed-out" -CycleTimeoutMinutes 45 -MergeCheck $neverMerged
Assert-True ($timedOutActions.Count -eq 1 -and $timedOutActions[0].RowNumber -eq "9") `
    "a timed-out cycle still reopens only its OWN row (got $($timedOutActions.Count) action(s))"
Assert-True ($timedOutActions[0].NewStatus -match 'was killed at the 45 minute deadline') `
    "the timed-out wording is unchanged by this row (got: $($timedOutActions[0].NewStatus))"

$doneUntouched = Get-StrandedRowActions -QueueRows $orphanQueue -CycleNumber "40" `
    -Outcome "finished" -CycleTimeoutMinutes 45 -MergeCheck $neverMerged
Assert-True ($doneUntouched.Count -eq 0) `
    "a row already closed DONE is never touched by the stranded-row reopen"

# ===========================================================================
# 11. A DONE ROW SITTING ON A PUSHED, UNMERGED BRANCH IS REOPENED AS PARTIAL
#     NAMING THE BRANCH - EVEN WHEN THE ROW'S OWN BRIEF NEVER DEMANDED A MERGE
#
# Row 122. Cycle 154 committed and pushed the Tuesday readiness verdict,
# wrote DONE 154 into row 114, and ended waiting on CI - nothing survived the
# cycle to finish the merge. Row 114's own brief asked for a dated artefact,
# not a merge commit hash, so section 10's Get-DoneWithoutMergeStatus alone
# would never have looked here. This is a second, narrower question: not "did
# this row's brief demand a merge" but "is there a pushed branch, ahead of
# main, that actually names this row".
# ===========================================================================

Write-Host ""
Write-Host "11. A DONE with a pushed, unmerged branch behind it is reopened as PARTIAL naming the branch; a clean row with no pushed branch is left alone"

# --- 11a. The pure decision -------------------------------------------------

$branchStatus = Get-DoneWithUnmergedBranchStatus -CurrentStatus "DONE 154 - Tuesday readiness verdict written, waiting on CI" `
    -RowNumber "114" -CycleNumber "154" -UnmergedBranch "fix/tuesday-readiness-verdict-row114"
Assert-True ($branchStatus -match "^PARTIAL 154 - closed DONE but branch 'fix/tuesday-readiness-verdict-row114' is pushed ahead of origin/main and was never merged") `
    "a DONE row with a pushed, unmerged branch behind it is rewritten to PARTIAL naming the branch (got: $branchStatus)"
Assert-True ($branchStatus -match 'DONE 154 - Tuesday readiness verdict written, waiting on CI') `
    "the cycle's own original DONE text is carried in full, not discarded (got: $branchStatus)"

$leftAloneNoBranch = Get-DoneWithUnmergedBranchStatus -CurrentStatus "DONE 151 - investigation only, category (b)" `
    -RowNumber "118" -CycleNumber "151" -UnmergedBranch $null
Assert-True ($leftAloneNoBranch -eq "DONE 151 - investigation only, category (b)") `
    "a clean artefact-only row with no pushed branch found is left exactly as the cycle wrote it (got: $leftAloneNoBranch)"

# --- 11b. The real git-walking half, against a scratch repo with a real
#          bare 'origin' remote - not the real repository, and not a mock.
#          Proves Find-UnmergedPushedBranchForRow actually walks git and
#          finds a branch that is genuinely pushed and genuinely ahead of
#          main, then stops finding it the moment that branch actually merges
#          - the exact moment row 121's own carve-out must take back over. ---

$bareRemote    = Join-Path $env:TEMP ("relay-selftest-row122-remote-" + [guid]::NewGuid().ToString('N') + ".git")
$scratchRow122 = Join-Path $env:TEMP ("relay-selftest-row122-repo-" + [guid]::NewGuid().ToString('N'))

& git init --bare $bareRemote *> $null
& git init $scratchRow122 *> $null
& git -C $scratchRow122 config user.email "relay-selftest@example.com" *> $null
& git -C $scratchRow122 config user.name "relay selftest" *> $null
& git -C $scratchRow122 remote add origin $bareRemote *> $null
Set-Content -Path (Join-Path $scratchRow122 "seed.txt") -Value "seed" -Encoding ascii
& git -C $scratchRow122 add seed.txt *> $null
& git -C $scratchRow122 commit -m "seed" *> $null
& git -C $scratchRow122 branch -M main *> $null
& git -C $scratchRow122 push origin main *> $null 2>&1

& git -C $scratchRow122 checkout -b fix/row122-partial-merge-guard *> $null
Set-Content -Path (Join-Path $scratchRow122 "fix.txt") -Value "fix" -Encoding ascii
& git -C $scratchRow122 add fix.txt *> $null
& git -C $scratchRow122 commit -m "row 122 - reopen unmerged DONE rows as PARTIAL" *> $null
& git -C $scratchRow122 push origin fix/row122-partial-merge-guard *> $null 2>&1
& git -C $scratchRow122 checkout main *> $null

$foundBranch = Find-UnmergedPushedBranchForRow -RowNumber "122" -RepoPath $scratchRow122
Assert-True ($foundBranch -eq "fix/row122-partial-merge-guard") `
    "a real branch pushed to origin, ahead of main, whose own commit names row 122, is actually found by walking git (got: $foundBranch)"

$notFoundBranch = Find-UnmergedPushedBranchForRow -RowNumber "999" -RepoPath $scratchRow122
Assert-True ($null -eq $notFoundBranch) `
    "a row number the pushed branch does not mention is correctly reported as not found (got: $notFoundBranch)"

# Merge it and push - the branch is no longer AHEAD of main, so it must stop
# being found. This is the moment row 121's own carve-out must take back
# over: once the work actually lands on main, this check gets out of the way.
& git -C $scratchRow122 merge fix/row122-partial-merge-guard -m "merge row 122 fix" *> $null
& git -C $scratchRow122 push origin main *> $null 2>&1
$mergedBranch = Find-UnmergedPushedBranchForRow -RowNumber "122" -RepoPath $scratchRow122
Assert-True ($null -eq $mergedBranch) `
    "once the branch actually merges into main it is no longer reported as an unmerged, pushed branch (got: $mergedBranch)"

Remove-Item -Path $scratchRow122 -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item -Path $bareRemote -Recurse -Force -ErrorAction SilentlyContinue

# ===========================================================================

Write-Host ""
if ($script:Failures.Count -eq 0) {
    Write-Host "SELF-TEST PASSED - $($script:Passes) checks." -ForegroundColor Green
    exit 0
}

Write-Host "SELF-TEST FAILED - $($script:Failures.Count) of $($script:Passes + $script:Failures.Count) checks:" -ForegroundColor Red
foreach ($f in $script:Failures) { Write-Host "  - $f" -ForegroundColor Red }
exit 1
