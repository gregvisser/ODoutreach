$ErrorActionPreference = "Stop"
. (Join-Path (Split-Path $PSScriptRoot -Parent | Split-Path -Parent) "relay-watch.ps1") -LoadOnly

$promptFile = Join-Path $env:TEMP "relay-real-agent-proof.txt"
[System.IO.File]::WriteAllText(
    $promptFile,
    "Reply with exactly one word and nothing else: RELAYPATHOK",
    (New-Object System.Text.UTF8Encoding($false)))

$exe = (Get-Command claude).Source
Write-Host "Running the REAL agent through Invoke-CycleAgent: $exe"

$r = Invoke-CycleAgent -PromptPath $promptFile -TimeoutSeconds 300 -Exe $exe -ExeArgs @("-p")

Write-Host "Started  : $($r.Started)"
Write-Host "TimedOut : $($r.TimedOut)"
Write-Host "ExitCode : $($r.ExitCode)"
Write-Host "Seconds  : $($r.Seconds)"
Write-Host "Output   : $($r.Output.Trim())"

Remove-Item $promptFile -Force -ErrorAction SilentlyContinue

if ($r.Started -and (-not $r.TimedOut) -and $r.ExitCode -eq 0 -and $r.Output -match "RELAYPATHOK") {
    Write-Host "PROVEN: the real agent reads the brief from a file and its output and exit code come back."
    exit 0
}
Write-Host "FAILED: the real agent did not come back cleanly through the new path."
exit 1
