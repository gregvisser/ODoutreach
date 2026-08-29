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

Write-Host ""
if ($script:Failures.Count -eq 0) {
    Write-Host "SELF-TEST PASSED - $($script:Passes) checks." -ForegroundColor Green
    exit 0
}

Write-Host "SELF-TEST FAILED - $($script:Failures.Count) of $($script:Passes + $script:Failures.Count) checks:" -ForegroundColor Red
foreach ($f in $script:Failures) { Write-Host "  - $f" -ForegroundColor Red }
exit 1
