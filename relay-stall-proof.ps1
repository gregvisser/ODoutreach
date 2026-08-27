# relay-stall-proof.ps1 - deliberately stall the relay and watch it shout.
#
#   Run it:  .\relay-stall-proof.ps1
#   Takes about three minutes. It SENDS A REAL EMAIL. That is the point.
#
# ---------------------------------------------------------------------------
# WHY THIS EXISTS SEPARATELY FROM relay-selftest.ps1
#
# The self-test proves the DECISION: given twenty idle minutes and a queue with
# work in it, the relay decides to shout. That is necessary and it is not
# sufficient. QUEUE.md records eight instances this week of something built,
# wired, reporting success, and never firing - and every one of them would have
# passed a test of its own decision layer.
#
# The gap between "decides to alert" and "Greg's phone buzzes" contains: the gh
# CLI, a login that expires, a workflow file that has to exist ON MAIN, a
# repository secret, and Resend. None of that is exercised by a unit test, and
# all of it has failed before somewhere in this estate.
#
# So this stalls the REAL relay-watch.ps1 - not a copy of its logic, not a
# re-implementation - and then goes and checks GitHub that a run appeared. It is
# kept out of the startup gate because it sends: an alert that arrives every
# time the relay starts is one Greg learns to delete unread.
#
# ---------------------------------------------------------------------------
# HOW IT STALLS THE RELAY WITHOUT TOUCHING THE LIVE ONE
#
# The watcher takes its paths from $PSScriptRoot, so a copy of the script in a
# temporary folder reads and writes ONLY that folder. The live relay's QUEUE.md,
# STATUS.json and NEXT.md are never opened. A proof that had to interfere with
# the running relay to prove anything would not be worth running.
#
# The stall itself reproduces 2026-08-26 exactly: the first unfinished row is
# BLOCKED, so the relay correctly refuses to take it and will not skip past it,
# while three TODO rows sit waiting behind it. That is a relay that is alive,
# behaving correctly, and getting nothing done - the precise failure that is
# invisible from the outside.
# ---------------------------------------------------------------------------
#
# THIS FILE IS DELIBERATELY PLAIN ASCII - see the note at the top of
# relay-watch.ps1. Typographic punctuation makes PowerShell unable to parse it.

$ErrorActionPreference = "Stop"

$StallMinutes  = 1
$WaitSeconds   = 240

Write-Host ""
Write-Host "Relay stall proof - stalling the real watcher on purpose."
Write-Host "This SENDS A REAL EMAIL to the configured alert address."
Write-Host ""

# ---------------------------------------------------------------------------
# Count the alert runs BEFORE, so "a run appeared" is a measurement and not an
# assumption. The relay has sent alerts tonight already; finding one in the list
# afterwards proves nothing unless we know what was there to begin with.
# ---------------------------------------------------------------------------
function Get-LatestAlertRunId {
    $previous = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try {
        $out = & gh run list --workflow relay-alert.yml --limit 1 --json databaseId 2>&1 | Out-String
        if ($LASTEXITCODE -ne 0) { return $null }
        $parsed = $out | ConvertFrom-Json
        if ($parsed.Count -lt 1) { return "none" }
        return [string]$parsed[0].databaseId
    } catch {
        return $null
    } finally {
        $ErrorActionPreference = $previous
    }
}

$before = Get-LatestAlertRunId
if ($null -eq $before) {
    Write-Host "FAILED: could not ask GitHub what the latest alert run is." -ForegroundColor Red
    Write-Host "Without that, a new run cannot be told from an old one, so nothing here would be proof."
    exit 1
}
Write-Host "Latest relay-alert run before the stall: $before"

# ---------------------------------------------------------------------------
# Build the sandbox.
# ---------------------------------------------------------------------------
$sandbox = Join-Path $env:TEMP ("relay-stall-proof-" + [guid]::NewGuid().ToString('N').Substring(0, 8))
$relayDir = Join-Path $sandbox ".bidlow\relay"
New-Item -ItemType Directory -Force -Path $relayDir | Out-Null

Copy-Item (Join-Path $PSScriptRoot "relay-watch.ps1")    (Join-Path $sandbox "relay-watch.ps1")
Copy-Item (Join-Path $PSScriptRoot "relay-selftest.ps1") (Join-Path $sandbox "relay-selftest.ps1")

# The watcher checks that relay-alert.yml is present before it will dispatch.
$sandboxWorkflows = Join-Path $sandbox ".github\workflows"
New-Item -ItemType Directory -Force -Path $sandboxWorkflows | Out-Null
Copy-Item (Join-Path $PSScriptRoot ".github\workflows\relay-alert.yml") (Join-Path $sandboxWorkflows "relay-alert.yml")

# The stall: BLOCKED at the front, real work stacked up behind it.
@(
    "# Sandbox queue - relay-stall-proof.ps1. Not the real queue."
    ""
    "| # | Item | Status |"
    "|---|------|--------|"
    "| 1 | something already finished | DONE 1 |"
    "| 2 | held up on purpose, so the relay refuses and idles | BLOCKED this row exists to stall the relay |"
    "| 3 | waiting job one | TODO |"
    "| 4 | waiting job two | TODO |"
    "| 5 | waiting job three | TODO |"
) | Set-Content -Path (Join-Path $relayDir "QUEUE.md") -Encoding utf8

Write-Host "Sandbox: $sandbox"
Write-Host "Queue: row 2 is BLOCKED, 3 TODO jobs waiting behind it."
Write-Host "Stall threshold forced to $StallMinutes minute(s) so this finishes tonight."
Write-Host ""
Write-Host "Starting the real watcher, stalled. Waiting up to $WaitSeconds seconds..."

$watcherOut = Join-Path $sandbox "watcher.out"
$watcherErr = Join-Path $sandbox "watcher.err"

$env:RELAY_STALL_MINUTES = "$StallMinutes"

# The sandbox is deliberately not a git checkout, so the watcher cannot work out
# the repository from a remote. It is told, using the repository THIS script is
# sitting in - so the alert still lands in the real Actions history, which is
# where the proof has to be visible.
$env:RELAY_ALERT_REPO = (& git -C $PSScriptRoot remote get-url origin) -replace '^.*github\.com[:/]+', '' -replace '\.git\s*$', ''
Write-Host "Alerts will be dispatched to: $env:RELAY_ALERT_REPO"

$proc = Start-Process -FilePath "powershell.exe" `
    -ArgumentList @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", (Join-Path $sandbox "relay-watch.ps1")) `
    -RedirectStandardOutput $watcherOut `
    -RedirectStandardError  $watcherErr `
    -NoNewWindow -PassThru
$null = $proc.Handle

# ---------------------------------------------------------------------------
# Watch for the relay saying it has stalled.
# ---------------------------------------------------------------------------
$sawStall   = $false
$sawEmail   = $false
$deadline   = (Get-Date).AddSeconds($WaitSeconds)

while ((Get-Date) -lt $deadline) {
    Start-Sleep -Seconds 5
    $text = ""
    if (Test-Path $watcherOut) {
        try { $text = Get-Content $watcherOut -Raw -ErrorAction SilentlyContinue } catch { $text = "" }
    }
    if ($text -match "STALLED:") { $sawStall = $true }
    if ($text -match "Emailed Greg: ODoutreach relay STALLED") { $sawEmail = $true }
    if ($sawStall -and $sawEmail) { break }
    if ($proc.HasExited) { break }
}

# Stop the sandbox watcher however this turned out. A proof that leaves a second
# relay running on the machine has caused a worse problem than it solved.
Set-Content -Path (Join-Path $relayDir "HALT") -Value "stall proof finished" -Encoding ascii
$previous = $ErrorActionPreference
$ErrorActionPreference = "Continue"
try { & taskkill.exe /T /F /PID $proc.Id 2>&1 | Out-Null } catch {}
$ErrorActionPreference = $previous
Remove-Item Env:\RELAY_STALL_MINUTES -ErrorAction SilentlyContinue
Remove-Item Env:\RELAY_ALERT_REPO    -ErrorAction SilentlyContinue

$watcherText = ""
if (Test-Path $watcherOut) { try { $watcherText = Get-Content $watcherOut -Raw } catch {} }

Write-Host ""
Write-Host "--- what the stalled relay said -------------------------------"
Write-Host $watcherText.Trim()
Write-Host "---------------------------------------------------------------"
Write-Host ""

# ---------------------------------------------------------------------------
# Did a NEW run actually appear on GitHub? This is the half a unit test cannot
# reach, and the half that has historically been the broken one.
# ---------------------------------------------------------------------------
$after = $null
for ($i = 0; $i -lt 12; $i++) {
    $after = Get-LatestAlertRunId
    if ($null -ne $after -and $after -ne $before) { break }
    Start-Sleep -Seconds 5
}

$newRun = ($null -ne $after -and $after -ne $before)

$failures = New-Object System.Collections.Generic.List[string]
if (-not $sawStall) { $failures.Add("the relay never noticed it was idle with work waiting") }
if (-not $sawEmail) { $failures.Add("the relay noticed, but never reported dispatching an email") }
if (-not $newRun)   { $failures.Add("no NEW relay-alert run appeared on GitHub (before=$before, after=$after)") }

if ($failures.Count -eq 0) {
    Write-Host "STALL PROOF PASSED." -ForegroundColor Green
    Write-Host "  - the relay detected its own silence with 3 jobs waiting"
    Write-Host "  - it dispatched the alert by itself, with no human involved"
    Write-Host "  - GitHub run $after is new (was $before) - a real email was sent"
    Remove-Item $sandbox -Recurse -Force -ErrorAction SilentlyContinue
    exit 0
}

Write-Host "STALL PROOF FAILED:" -ForegroundColor Red
foreach ($f in $failures) { Write-Host "  - $f" -ForegroundColor Red }
Write-Host ""
Write-Host "The sandbox has been LEFT IN PLACE so it can be read: $sandbox"
exit 1
