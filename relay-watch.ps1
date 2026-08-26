# relay-watch.ps1 - the loop that lets Claude keep working while Greg sleeps.
#
# Start it once. It looks for work, runs it, works out from EVIDENCE whether the
# work actually happened, writes that down in plain English, then takes the next
# item off the queue by itself and goes again.
#
#   Start it:  .\relay-watch.ps1
#   Stop it:   create a file called HALT in .bidlow\relay\  (or close the window)
#
# It stops ON ITS OWN if any of these are true:
#   * the HALT file exists
#   * it has already run 40 cycles
#   * the live site says the safety gate is switched off
#
# That last one is the important one. The gate is what stops an agent sending
# email for anyone except Bidlow. If the gate is off, this refuses to run at all
# rather than run without it.
#
# ---------------------------------------------------------------------------
# THIS FILE IS DELIBERATELY PLAIN ASCII.
# An earlier version used em-dashes. PowerShell could not parse it, so the
# watcher could never have run at all - and nothing said so. That is one of the
# six recorded instances in QUEUE.md of something built, wired, reporting
# success, and never firing. Do not paste typographic punctuation in here.
# ---------------------------------------------------------------------------

$ErrorActionPreference = "Stop"

$RepoRoot   = $PSScriptRoot
$RelayDir   = Join-Path $RepoRoot ".bidlow\relay"
$NextFile   = Join-Path $RelayDir "NEXT.md"
$CurrentFile= Join-Path $RelayDir "CURRENT.md"
$QueueFile  = Join-Path $RelayDir "QUEUE.md"
$HaltFile   = Join-Path $RelayDir "HALT"
$StatusFile = Join-Path $RelayDir "STATUS.json"
$NoteFile   = Join-Path $RelayDir "SELF-QUEUE-NOTE.md"
$LogDir     = Join-Path $RelayDir "log"

$MaxCycles  = 40
$SleepSecs  = 60

# The DIRECT App Service URL, deliberately NOT the custom domain.
#
# 2026-08-26: this check read https://opensdoors.bidlow.co.uk/api/health, which
# is CDN-cached. The gate had been switched on and was live, and the cached
# custom domain still answered "active: false" - so the relay refused to start
# for a reason that was no longer true.
#
# The blocking direction was harmless. The OTHER direction is not: if the gate
# were switched OFF, a cached "active: true" would let the relay run cycles with
# no protection at all. A safety check that can answer from a cache is not a
# safety check.
#
# This repository already recorded the same lesson for deploy verification -
# compare the running commit against the DIRECT App Service URL, never the
# CDN-cached custom domain. The safety check was pointed at the cached one.
$HealthUrl  = "https://app-opensdoors-outreach-prod.azurewebsites.net/api/health"

# The one rule, restated here because it must appear in EVERY prompt including
# the ones this script writes for itself.
$HardRule = @"
THE HARD RULE, and it is not negotiable:
Real email may be sent, and data deleted, ONLY for the ``bidlowai`` client.
Every other client may be built on, tested and measured. Nothing leaves the
building for them. This is enforced in ``autonomous-actor-guard.ts``, not by
your good intentions. If a task seems to need a real send for anyone else,
that task is wrong - stop and write down why.
"@

New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
Set-Location $RepoRoot

function Write-Line($text) {
    $stamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    Write-Host "[$stamp] $text"
}

function Read-Status {
    if (-not (Test-Path $StatusFile)) {
        return [pscustomobject]@{ cycle = 0; lastOutcome = "never run"; updated = $null; lastSelfQueued = -1 }
    }
    try {
        $s = Get-Content $StatusFile -Raw | ConvertFrom-Json
        if ($null -eq $s.lastSelfQueued) {
            $s | Add-Member -NotePropertyName lastSelfQueued -NotePropertyValue -1 -Force
        }
        return $s
    }
    catch { return [pscustomobject]@{ cycle = 0; lastOutcome = "status file unreadable"; updated = $null; lastSelfQueued = -1 } }
}

function Save-Status($cycle, $outcome, $lastSelfQueued) {
    $status = [pscustomobject]@{
        cycle          = $cycle
        lastOutcome    = $outcome
        updated        = (Get-Date -Format "o")
        lastSelfQueued = $lastSelfQueued
    }
    $status | ConvertTo-Json | Set-Content -Path $StatusFile -Encoding utf8
}

function Stop-Relay($why) {
    Set-Content -Path $HaltFile -Value $why -Encoding utf8
    Write-Line "STOPPED: $why"
    Write-Line "The HALT file now exists. Delete it before starting again."
}

# 2026-08-26: a cycle that DIES leaves STATUS.json reading "running" forever.
# The status is written before the work starts and rewritten after it ends, so a
# cycle killed in between - window closed, machine slept, watcher restarted -
# never reaches the second write. Nothing else ever corrects it. The relay then
# claims it is working when no process exists, and the cycle leaves no log file
# at all, so there is not even a record that it was interrupted.
#
# On startup, "running" can only be a corpse. This process has not started a
# cycle yet, so whatever wrote "running" is gone.
function Resolve-InterruptedCycle {
    try {
        $status = Read-Status
        if ($status.lastOutcome -ne "running") { return }

        $cycle = [int]$status.cycle
        Write-Line "Cycle $cycle was still marked 'running' when this watcher started, so it never finished. Recording it as interrupted."

        $logFile = Join-Path $LogDir ("cycle-{0:d3}.md" -f $cycle)
        if (-not (Test-Path $logFile)) {
            Set-Content -Path $logFile -Value "# Cycle $cycle - interrupted" -Encoding utf8
        }
        @(
            ""
            "## Interrupted"
            ""
            "This cycle was still marked 'running' when the watcher started again at $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), so it was stopped part-way through."
            ""
            "Whatever it had already done on disk is done; whatever it had not is not. This note records that the cycle ended without finishing - it does NOT undo anything."
        ) | Add-Content -Path $logFile -Encoding utf8

        Save-Status $cycle "interrupted" ([int]$status.lastSelfQueued)
    } catch {
        # Correcting the record must never be the thing that stops the relay.
        Write-Line "Could not record the interrupted cycle: $($_.Exception.Message)"
    }
}

# Is the safety gate actually live on the deployed site? If we cannot tell,
# we assume it is NOT and refuse - never the other way round.
function Test-SafetyGateLive {
    try {
        $r = Invoke-RestMethod -Uri "$HealthUrl`?nocache=$([guid]::NewGuid().ToString('N'))" -TimeoutSec 20 -Method Get -Headers @{ "Cache-Control" = "no-cache" }
    } catch {
        Write-Line "Could not reach the site to check the safety gate: $($_.Exception.Message)"
        return $false
    }
    if (-not $r.autonomousRelay) {
        Write-Line "The site did not report a safety gate at all. It may be running an older build."
        return $false
    }
    if (-not $r.autonomousRelay.active) {
        Write-Line "The safety gate is switched OFF on the live site."
        return $false
    }
    if ($r.autonomousRelay.allowlistedClients -lt 1) {
        Write-Line "The safety gate is on but no client is allowlisted, so everything would be refused."
        return $false
    }
    return $true
}

# ===========================================================================
# EVIDENCE - what makes an outcome true
#
# 2026-08-26, cycle 1: the relay ran the whole loop correctly, the agent did
# NOTHING because it could not answer a permission prompt, and the cycle was
# recorded as "finished" because `claude -p` exited 0. The relay had no notion
# of whether the work was done. That is the same defect class the relay was
# built to find, sitting in the relay's own reporting layer.
#
# So an outcome is now derived from what changed on disk, never from an exit
# code:
#   * did any git ref move (a commit on any branch, local or remote)
#   * did the working tree change (files edited but not yet committed)
#   * did any file NAMED IN THE PROMPT change
#
# If none of those, the outcome is `no-change`. That is not a failure - some
# cycles legitimately conclude "measured, nothing to change" - but it must
# never again be indistinguishable from work.
# ===========================================================================

# Pull anything that looks like a file path out of the brief. Crude on purpose:
# a false positive costs nothing (an unchanged file is just not evidence), while
# a miss would let a real change go unrecorded.
function Get-NamedFiles($prompt) {
    $found = New-Object System.Collections.Generic.List[string]
    foreach ($m in [regex]::Matches($prompt, '[A-Za-z0-9_\-\./\\]+\.[A-Za-z0-9]{1,10}')) {
        $candidate = $m.Value.Trim('.', '/', '\')
        if ([string]::IsNullOrWhiteSpace($candidate)) { continue }
        # Skip things that are plainly hostnames rather than paths.
        if ($candidate -match '\.(co\.uk|com|net|org|io|dev)$' -and $candidate -notmatch '[\\/]') { continue }
        $full = Join-Path $RepoRoot $candidate
        if ((Test-Path $full) -or ($candidate -match '[\\/]')) {
            if (-not $found.Contains($candidate)) { $found.Add($candidate) }
        }
    }
    return $found
}

function Get-RepoEvidence($namedFiles) {
    $refs = ""
    $tree = ""
    try { $refs = (& git for-each-ref --format="%(refname) %(objectname)" refs/heads refs/remotes 2>$null) -join "`n" } catch { $refs = "git-unavailable" }
    try { $tree = (& git status --porcelain 2>$null) -join "`n" } catch { $tree = "git-unavailable" }

    $files = @{}
    foreach ($f in $namedFiles) {
        $full = Join-Path $RepoRoot $f
        if (Test-Path $full -PathType Leaf) {
            try { $files[$f] = (Get-FileHash $full -Algorithm SHA256).Hash } catch { $files[$f] = "unreadable" }
        } else {
            $files[$f] = "absent"
        }
    }

    return [pscustomobject]@{ refs = $refs; tree = $tree; files = $files }
}

function Get-EvidenceVerdict($before, $after, $namedFiles) {
    $gitMoved  = ($before.refs -ne $after.refs)
    $treeMoved = ($before.tree -ne $after.tree)

    $changedFiles = New-Object System.Collections.Generic.List[string]
    foreach ($f in $namedFiles) {
        if ($before.files[$f] -ne $after.files[$f]) { $changedFiles.Add($f) }
    }

    $didSomething = $gitMoved -or $treeMoved -or ($changedFiles.Count -gt 0)

    $reasons = New-Object System.Collections.Generic.List[string]
    if ($gitMoved)  { $reasons.Add("a git ref moved, so something was committed") }
    if ($treeMoved) { $reasons.Add("the working tree changed, so files were edited") }
    if ($changedFiles.Count -gt 0) {
        $reasons.Add("these files named in the brief changed on disk: " + ($changedFiles -join ", "))
    }

    return [pscustomobject]@{
        didSomething = $didSomething
        reasons      = $reasons
        checked      = $namedFiles
    }
}

# ===========================================================================
# SELF-QUEUEING - taking Greg off the critical path
#
# Greg wakes once an hour; that is a hard platform floor. If the relay waits for
# him to write the next brief, it idles for most of every hour and HE is the
# bottleneck. So when a cycle ends and no NEXT.md exists, the watcher takes the
# first TODO item off QUEUE.md itself.
#
# It refuses to do that, and idles instead, if the next item is BLOCKED, says it
# needs Greg, or the queue is exhausted. It also refuses to self-queue twice in
# a row without a completed cycle in between, so a broken item cannot spin.
# ===========================================================================

# Rows look like: | 2 | Item text | TODO |
function Get-QueueRows {
    if (-not (Test-Path $QueueFile)) { return @() }
    $rows = New-Object System.Collections.Generic.List[object]
    $lines = Get-Content $QueueFile
    for ($i = 0; $i -lt $lines.Count; $i++) {
        $parts = $lines[$i] -split '\|'
        if ($parts.Count -lt 4) { continue }
        $number = $parts[1].Trim()
        if ($number -notmatch '^\d+$') { continue }
        $status = $parts[$parts.Count - 2].Trim()
        $item   = ($parts[2..($parts.Count - 3)] -join '|').Trim()
        $rows.Add([pscustomobject]@{ Number = $number; Item = $item; Status = $status; LineIndex = $i })
    }
    return $rows
}

function Set-QueueRowStatus($number, $newStatus) {
    $lines = Get-Content $QueueFile
    for ($i = 0; $i -lt $lines.Count; $i++) {
        $parts = $lines[$i] -split '\|'
        if ($parts.Count -lt 4) { continue }
        if ($parts[1].Trim() -ne $number) { continue }
        $parts[$parts.Count - 2] = " $newStatus "
        $lines[$i] = ($parts -join '|')
        Set-Content -Path $QueueFile -Value $lines -Encoding utf8
        return $true
    }
    return $false
}

function Write-SelfQueueNote($text) {
    @(
        "# The relay did not queue anything"
        ""
        "Written $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')."
        ""
        $text
    ) | Set-Content -Path $NoteFile -Encoding utf8
    Write-Line "Did not self-queue. Note written to $NoteFile"
}

function Invoke-SelfQueue($nextCycle) {
    $rows = Get-QueueRows
    if ($rows.Count -eq 0) {
        Write-SelfQueueNote "QUEUE.md has no readable rows, so there was nothing to take. Check the table formatting."
        return $false
    }

    # "In order" means: the first row that is not already finished or running.
    # Do not reorder, do not skip, do not invent.
    $next = $rows | Where-Object { $_.Status -notmatch '^DONE' -and $_.Status -notmatch '^IN PROGRESS' } | Select-Object -First 1

    if ($null -eq $next) {
        Write-SelfQueueNote "Every item in QUEUE.md is DONE or IN PROGRESS. The queue is exhausted, so the relay is idling rather than inventing work. Greg needs to add the next item."
        return $false
    }

    if ($next.Status -match 'BLOCKED') {
        Write-SelfQueueNote "The next item in order is #$($next.Number), and it is BLOCKED:`n`n> $($next.Item)`n`nThe relay does not skip past a blocked item, because the order is the plan. Idling until Greg unblocks it or reorders the queue."
        return $false
    }

    if ($next.Item -match 'needs Greg|Greg must|ask Greg|Greg''s call|Greg decides|awaiting Greg|requires Greg|Greg picks') {
        Write-SelfQueueNote "The next item in order is #$($next.Number), and it says it needs Greg:`n`n> $($next.Item)`n`nThe relay will not decide something that was explicitly reserved for him. Idling."
        return $false
    }

    if ($next.Status -notmatch '^TODO') {
        Write-SelfQueueNote "The next item in order is #$($next.Number) with status '$($next.Status)', which the relay does not recognise as ready. Only TODO is taken automatically. Idling."
        return $false
    }

    # Write the brief. The watcher cannot know which files item 7 touches, so it
    # does not pretend to - it REQUIRES the agent to name them before touching
    # them, and to say so in the log.
    $brief = @"
# Cycle $nextCycle - queue item $($next.Number)

This brief was written by the relay itself, off the top of QUEUE.md. Greg has
not read it. If it is wrong, say so in your log rather than working around it,
and correct QUEUE.md.

## The item, verbatim from the queue

> $($next.Item)

## The one rule

$HardRule

## Before you touch anything, write these four things down

1. **The files you are going to change.** Name them. If you cannot yet, your
   first job is to find out, and that reconnaissance IS the cycle.
2. **The red-first test.** Name the test file and what it asserts. Watch it FAIL
   before you make it pass. If the behaviour cannot go red first, say why, and
   prove the test is capable of failing by deliberately breaking the code and
   showing the red - that is this repository's established substitute.
3. **What "done" looks like** for this item, in one sentence a non-coder can check.
4. **What you must NOT touch.** Anything outside the files in (1).

## The rules that apply to every cycle

* Do not stall on a question. Decide, record the decision and why, and continue.
  If the decision is genuinely Greg's - money, a client relationship, an
  irreversible one-way door - stop and write down the question instead.
* Gates before you claim anything: ``npm run lint``, ``npm run typecheck``,
  ``npm test``. Show the real output. A gate you did not run is not met.
* Commit and push when confident. Branch protection is ON, so it is
  branch -> PR -> green CI -> merge. Never push straight to ``main``.
* If you deploy, verify the running commit by HASH against the DIRECT App
  Service URL (``app-opensdoors-outreach-prod.azurewebsites.net``), never the
  CDN-cached custom domain, and never liveness alone.
* Production migrations are real. ``PRODUCTION_PRISMA_MIGRATE`` is true, so
  merging a migration applies it to the live client database.
* When you finish, update this item's row in ``.bidlow/relay/QUEUE.md`` to
  ``DONE $nextCycle``, or back to ``TODO`` with a note if you could not do it.
* Do NOT write the next NEXT.md. The watcher does that. One cycle, one item.

## Assume the seventh exists

QUEUE.md records six instances this week of something built, wired, reporting
success, and never firing. It is the defect this project is worst at by a wide
margin. Whatever you build this cycle, prove it FIRES - not that it exists.
"@

    Set-Content -Path $NextFile -Value $brief -Encoding utf8

    if (Set-QueueRowStatus $next.Number "IN PROGRESS $nextCycle") {
        Write-Line "Self-queued item #$($next.Number) as cycle $nextCycle, and marked it IN PROGRESS."
    } else {
        Write-Line "Self-queued item #$($next.Number) as cycle $nextCycle, but could not update its row in QUEUE.md."
    }

    if (Test-Path $NoteFile) { Remove-Item $NoteFile -Force }
    return $true
}

# ===========================================================================
# MAIN
# ===========================================================================

Write-Line "Relay watcher started. Repo: $RepoRoot"
Write-Line "Checking for work every $SleepSecs seconds. Stop it by creating: $HaltFile"

# Before anything else, and BEFORE the HALT check - a stale "running" is a lie
# whether or not this watcher goes on to do any work.
Resolve-InterruptedCycle

if (Test-Path $HaltFile) {
    Write-Line "HALT already exists, so there is nothing to do. Delete it first if you want to run."
    exit 0
}

if (-not (Get-Command claude -ErrorAction SilentlyContinue)) {
    Write-Line "Cannot find the 'claude' command, so no work could be run. Nothing started."
    exit 1
}

while ($true) {

    if (Test-Path $HaltFile) {
        Write-Line "HALT file found. Stopping cleanly."
        exit 0
    }

    $status         = Read-Status
    $cycle          = [int]$status.cycle
    $lastSelfQueued = [int]$status.lastSelfQueued

    if ($cycle -ge $MaxCycles) {
        Stop-Relay "Reached the $MaxCycles cycle limit. A loop that will not end must end itself."
        exit 0
    }

    if (-not (Test-Path $NextFile)) {
        # No brief from Greg. Take the next item ourselves - but only once per
        # completed cycle, so a failing item cannot spin the relay.
        if ($lastSelfQueued -ge $cycle) {
            Start-Sleep -Seconds $SleepSecs
            continue
        }

        if (Invoke-SelfQueue ($cycle + 1)) {
            $lastSelfQueued = $cycle
            Save-Status $cycle $status.lastOutcome $lastSelfQueued
        } else {
            # Refused, and the note says why. Record the attempt so we do not
            # rewrite the same note every 60 seconds.
            $lastSelfQueued = $cycle
            Save-Status $cycle $status.lastOutcome $lastSelfQueued
            Start-Sleep -Seconds $SleepSecs
            continue
        }
    }

    # There is work. Check the gate BEFORE touching it.
    if (-not (Test-SafetyGateLive)) {
        Stop-Relay "The safety gate is not live, so no work was run. Nothing was sent or changed."
        exit 0
    }

    $cycle = $cycle + 1
    Write-Line "Cycle $cycle of $MaxCycles starting."

    Move-Item -Path $NextFile -Destination $CurrentFile -Force
    Save-Status $cycle "running" $lastSelfQueued

    $logFile = Join-Path $LogDir ("cycle-{0:d3}.md" -f $cycle)
    $started = Get-Date

    $prompt     = Get-Content $CurrentFile -Raw
    $namedFiles = Get-NamedFiles $prompt
    $before     = Get-RepoEvidence $namedFiles

    try {
        # 2026-08-26: cycle 1 ran the whole loop correctly and did NO work, because a
        # non-interactive `claude -p` cannot answer a permission prompt. It refused
        # every Write and reported honestly that it could not ask.
        #
        # `dontAsk` auto-DENIES anything not on the list, rather than allowing
        # everything. Deliberately narrower than --dangerously-skip-permissions.
        #
        # This does NOT weaken the operating system's own gates. PreToolUse hooks
        # fire in every permission mode, before permission rules are evaluated, and
        # a hook exiting 2 blocks the call outright. gate-build.mjs still guards
        # Write/Edit, gate-ship.mjs still guards Bash, and deny-irreversible-hook.mjs
        # refuses anything that cannot be undone. The Bidlow-only send rule is
        # enforced in production code, not here.
        $output = $prompt | claude -p --permission-mode dontAsk --allowedTools "Write,Edit,Read,Glob,Grep,Bash" 2>&1 | Out-String
        $ranClean = $true
    } catch {
        $output   = $_.Exception.Message
        $ranClean = $false
    }

    $after   = Get-RepoEvidence $namedFiles
    $verdict = Get-EvidenceVerdict $before $after $namedFiles

    # The outcome comes from the evidence, not from the exit code.
    if (-not $ranClean) {
        $outcome = "failed to run"
        $headline = "The cycle did not run to completion. It threw before finishing, so treat anything below as partial."
    } elseif ($verdict.didSomething) {
        $outcome = "finished"
        $headline = "Work happened. Evidence: " + ($verdict.reasons -join "; ") + "."
    } else {
        $outcome = "no-change"
        $headline = @"
NOTHING CHANGED. This cycle ran to completion and left no trace on disk: no git
ref moved, the working tree is identical, and none of the files named in the
brief changed.

That is not automatically a failure - a cycle that measures something and
concludes "nothing to change here" is a legitimate result, and so is one that
correctly refused. But it is NOT the same as work, and it must never again be
recorded as though it were. Read what it actually did below before assuming
either way.
"@
    }

    $minutes = [math]::Round(((Get-Date) - $started).TotalMinutes, 1)

    $checkedList = if ($namedFiles.Count -gt 0) { $namedFiles -join ", " } else { "none were named in the brief" }

    @(
        "# Cycle $cycle - $outcome"
        ""
        $headline
        ""
        "Started $($started.ToString('yyyy-MM-dd HH:mm:ss')), took about $minutes minutes."
        ""
        "Evidence checked: git refs on every branch, the working tree, and these"
        "files named in the brief: $checkedList"
        ""
        "## What it was asked to do"
        ""
        $prompt
        ""
        "## What it did"
        ""
        $output
    ) | Set-Content -Path $logFile -Encoding utf8

    Save-Status $cycle $outcome $lastSelfQueued
    Write-Line "Cycle $cycle $outcome. Written to $logFile"

    Start-Sleep -Seconds $SleepSecs
}
