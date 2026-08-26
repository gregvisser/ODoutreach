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
$HealthUrl  = "https://opensdoors.bidlow.co.uk/api/health"

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

# Is the safety gate actually live on the deployed site? If we cannot tell,
# we assume it is NOT and refuse - never the other way round.
function Test-SafetyGateLive {
    try {
        $r = Invoke-RestMethod -Uri $HealthUrl -TimeoutSec 20 -Method Get
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
        $output = $prompt | claude -p 2>&1 | Out-String
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
