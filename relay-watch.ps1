# relay-watch.ps1 - the loop that lets Claude keep working while Greg sleeps.
#
# Start it once. It looks for a new instruction every 60 seconds, runs it, writes
# down what happened in plain English, and stops itself if anything looks wrong.
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

$ErrorActionPreference = "Stop"

$RepoRoot   = $PSScriptRoot
$RelayDir   = Join-Path $RepoRoot ".bidlow\relay"
$NextFile   = Join-Path $RelayDir "NEXT.md"
$CurrentFile= Join-Path $RelayDir "CURRENT.md"
$HaltFile   = Join-Path $RelayDir "HALT"
$StatusFile = Join-Path $RelayDir "STATUS.json"
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

New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

function Write-Line($text) {
    $stamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    Write-Host "[$stamp] $text"
}

function Read-Status {
    if (-not (Test-Path $StatusFile)) {
        return [pscustomobject]@{ cycle = 0; lastOutcome = "never run"; updated = $null }
    }
    try   { return Get-Content $StatusFile -Raw | ConvertFrom-Json }
    catch { return [pscustomobject]@{ cycle = 0; lastOutcome = "status file unreadable"; updated = $null } }
}

function Save-Status($cycle, $outcome) {
    $status = [pscustomobject]@{
        cycle       = $cycle
        lastOutcome = $outcome
        updated     = (Get-Date -Format "o")
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
# That is the same defect this project has now found five times in a week:
# something reporting activity that is not happening.
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

        Save-Status $cycle "interrupted"
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

    $status = Read-Status
    $cycle  = [int]$status.cycle

    if ($cycle -ge $MaxCycles) {
        Stop-Relay "Reached the $MaxCycles cycle limit. A loop that will not end must end itself."
        exit 0
    }

    if (-not (Test-Path $NextFile)) {
        Start-Sleep -Seconds $SleepSecs
        continue
    }

    # There is work. Check the gate BEFORE touching it.
    if (-not (Test-SafetyGateLive)) {
        Stop-Relay "The safety gate is not live, so no work was run. Nothing was sent or changed."
        exit 0
    }

    $cycle = $cycle + 1
    Write-Line "Cycle $cycle of $MaxCycles starting."

    Move-Item -Path $NextFile -Destination $CurrentFile -Force
    Save-Status $cycle "running"

    $logFile = Join-Path $LogDir ("cycle-{0:d3}.md" -f $cycle)
    $started = Get-Date

    $prompt = Get-Content $CurrentFile -Raw

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
        # Write/Edit and gate-ship.mjs still guards Bash. The Bidlow-only send rule
        # is enforced in production code, not here.
        $output = $prompt | claude -p --permission-mode dontAsk --allowedTools "Write,Edit,Read,Glob,Grep,Bash" 2>&1 | Out-String
        $outcome = "finished"
    } catch {
        $output  = $_.Exception.Message
        $outcome = "failed to run"
    }

    $minutes = [math]::Round(((Get-Date) - $started).TotalMinutes, 1)

    @(
        "# Cycle $cycle - $outcome"
        ""
        "Started $($started.ToString('yyyy-MM-dd HH:mm:ss')), took about $minutes minutes."
        ""
        "## What it was asked to do"
        ""
        $prompt
        ""
        "## What it did"
        ""
        $output
    ) | Set-Content -Path $logFile -Encoding utf8

    Save-Status $cycle $outcome
    Write-Line "Cycle $cycle $outcome. Written to $logFile"

    Start-Sleep -Seconds $SleepSecs
}
