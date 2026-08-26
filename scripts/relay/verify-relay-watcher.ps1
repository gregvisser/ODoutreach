# Prove the watcher's new logic actually works.
#
#   pwsh -NoProfile -File scripts/relay/verify-relay-watcher.ps1
#
# Two things get proven here, and both are things a parse check cannot see:
#
#   1. THE EVIDENCE VERDICT. An outcome must come from what changed on disk, not
#      from an exit code. Cycle 1 exited 0, did nothing, and was recorded as
#      "finished" - the same defect class the relay exists to find, sitting in
#      the relay's own reporting layer.
#
#   2. SELF-QUEUEING. The watcher takes the first TODO off QUEUE.md in order,
#      writes a real brief, marks the row, and REFUSES when the next item is
#      blocked, needs Greg, or the queue is empty.
#
# It works by loading the real relay-watch.ps1 up to (but not including) its
# MAIN section, so the functions under test are the actual shipped ones and not
# a copy that can drift.

$ErrorActionPreference = "Stop"

$RealScript = Join-Path $PSScriptRoot "..\..\relay-watch.ps1"
$RealScript = (Resolve-Path $RealScript).Path

$pass = 0
$fail = 0

function Check($name, $condition, $detail) {
    if ($condition) {
        Write-Host "ok    $name"
        $script:pass++
    } else {
        Write-Host "FAIL  $name"
        if ($detail) { Write-Host "        $detail" }
        $script:fail++
    }
}

# --- build a throwaway repo that looks like the real one -------------------
$Sandbox = Join-Path ([System.IO.Path]::GetTempPath()) ("relay-verify-" + [guid]::NewGuid().ToString("N").Substring(0, 8))
New-Item -ItemType Directory -Force -Path (Join-Path $Sandbox ".bidlow\relay\log") | Out-Null

# A FIXTURE queue, not a copy of the live one.
#
# The first version of this script copied the real QUEUE.md. That felt more
# realistic and was actually a bug: the moment cycle 4 marked item 2 as DONE,
# four checks went red - not because the watcher broke, but because the plan
# had moved on. A test that fails whenever real work progresses is worse than
# no test, because the fix is to weaken it.
#
# The ORDERING logic is what needs proving, and that needs a queue whose
# contents are known. The real QUEUE.md is still checked at the end, but only
# for FORMAT - that it parses and its statuses are recognisable.
@(
    "| # | Item | Status |"
    "|---|---|---|"
    "| 1 | An item that is already finished | DONE 3 |"
    "| 2 | Load speed - MEASURE first. loadClientWorkspaceBundle is a suspect, not a cause. | TODO |"
    "| 3 | Load speed - fix what the measurement actually found | TODO |"
    "| 4 | A later item that must not be jumped to | TODO |"
) | Set-Content -Path (Join-Path $Sandbox ".bidlow\relay\QUEUE.md") -Encoding utf8

# Load the real script's functions, stopping before the main loop.
$lines = Get-Content $RealScript
$mainAt = ($lines | Select-String -Pattern '^# MAIN$' | Select-Object -First 1).LineNumber
if (-not $mainAt) { Write-Host "FAIL  could not find the MAIN marker in relay-watch.ps1"; exit 1 }
$functionsOnly = $lines[0..($mainAt - 3)]
$Shim = Join-Path $Sandbox "relay-watch.ps1"
Set-Content -Path $Shim -Value $functionsOnly -Encoding utf8

. $Shim

Write-Host ""
Write-Host "=== The evidence verdict: an outcome must be earned ==="

$noFiles = New-Object System.Collections.Generic.List[string]
$same = [pscustomobject]@{ refs = "refA"; tree = ""; files = @{} }

$v = Get-EvidenceVerdict $same $same $noFiles
Check "a cycle that changes nothing is NOT 'finished'" (-not $v.didSomething) "this is cycle 1, the worked example"

$movedRef = [pscustomobject]@{ refs = "refB"; tree = ""; files = @{} }
$v = Get-EvidenceVerdict $same $movedRef $noFiles
Check "a commit on any branch counts as work" ($v.didSomething) $null

$dirtyTree = [pscustomobject]@{ refs = "refA"; tree = " M src/thing.ts"; files = @{} }
$v = Get-EvidenceVerdict $same $dirtyTree $noFiles
Check "an uncommitted edit counts as work" ($v.didSomething) $null

$named = New-Object System.Collections.Generic.List[string]
$named.Add("src/app/page.tsx")
$beforeF = [pscustomobject]@{ refs = "refA"; tree = ""; files = @{ "src/app/page.tsx" = "absent" } }
$afterF  = [pscustomobject]@{ refs = "refA"; tree = ""; files = @{ "src/app/page.tsx" = "HASH123" } }
$v = Get-EvidenceVerdict $beforeF $afterF $named
Check "a file named in the brief appearing counts as work" ($v.didSomething) $null
Check "the log can say WHICH file changed" ($v.reasons -join " ") -match "src/app/page.tsx"

Write-Host ""
Write-Host "=== Reading the queue ==="

$rows = Get-QueueRows
Check "reads every row of the table" ($rows.Count -eq 4) "got $($rows.Count)"
$item1 = $rows | Where-Object { $_.Number -eq "1" }
$item2 = $rows | Where-Object { $_.Number -eq "2" }
Check "reads a DONE status" ($item1.Status -match '^DONE') "got '$($item1.Status)'"
Check "reads a TODO status" ($item2.Status -eq "TODO") "got '$($item2.Status)'"

Write-Host ""
Write-Host "=== Self-queueing ==="

$queued = Invoke-SelfQueue 5
Check "takes an item when one is ready" ($queued -eq $true) $null
Check "wrote a brief to NEXT.md" (Test-Path $NextFile) $null

$brief = Get-Content $NextFile -Raw
Check "took item 2, the FIRST todo, not a later one" ($brief -match 'queue item 2') $null
Check "the brief carries the item text verbatim" ($brief -match 'loadClientWorkspaceBundle') $null
Check "the brief restates the bidlowai-only hard rule" ($brief -match 'bidlowai') "it must appear in every prompt, including self-written ones"
Check "the brief demands a red-first test" ($brief -match 'red-first test') $null
Check "the brief demands the files be named" ($brief -match 'files you are going to change') $null
Check "the brief says what must NOT be touched" ($brief -match 'must NOT touch') $null
Check "the brief forbids the agent self-queueing" ($brief -match 'Do NOT write the next NEXT.md') $null
Check "the brief names the direct App Service URL for deploy checks" ($brief -match 'azurewebsites\.net') $null

$rows = Get-QueueRows
$item2 = $rows | Where-Object { $_.Number -eq "2" }
Check "marked the row IN PROGRESS with the cycle number" ($item2.Status -eq "IN PROGRESS 5") "got '$($item2.Status)'"

# Order matters: with 2 taken, the next one taken must be 3.
Remove-Item $NextFile -Force
$queued = Invoke-SelfQueue 6
$brief = Get-Content $NextFile -Raw
Check "goes in ORDER - next time it takes item 3, not a reorder" ($brief -match 'queue item 3') $null

Write-Host ""
Write-Host "=== Refusing, which is the half that keeps it safe ==="

# BLOCKED
Set-QueueRowStatus "3" "TODO" | Out-Null
Set-QueueRowStatus "2" "BLOCKED - waiting on the client" | Out-Null
Remove-Item $NextFile -Force
$queued = Invoke-SelfQueue 7
Check "refuses when the next item is BLOCKED" ($queued -eq $false) $null
Check "does not skip past it to a later item" (-not (Test-Path $NextFile)) "the order is the plan"
Check "writes a note saying which item and why" ((Get-Content $NoteFile -Raw) -match 'BLOCKED') $null

# Needs Greg
Set-QueueRowStatus "2" "TODO" | Out-Null
$q = Get-Content $QueueFile
for ($i = 0; $i -lt $q.Count; $i++) {
    $parts = $q[$i] -split '\|'
    if ($parts.Count -ge 4 -and $parts[1].Trim() -eq "2") {
        $parts[2] = " Something that Greg must decide himself "
        $q[$i] = ($parts -join '|')
    }
}
Set-Content -Path $QueueFile -Value $q -Encoding utf8
$queued = Invoke-SelfQueue 8
Check "refuses an item that says it needs Greg" ($queued -eq $false) $null
Check "the note explains it was reserved for him" ((Get-Content $NoteFile -Raw) -match 'needs Greg') $null

# Exhausted
$q = Get-Content $QueueFile
for ($i = 0; $i -lt $q.Count; $i++) {
    $parts = $q[$i] -split '\|'
    if ($parts.Count -ge 4 -and $parts[1].Trim() -match '^\d+$') {
        $parts[$parts.Count - 2] = " DONE 1 "
        $q[$i] = ($parts -join '|')
    }
}
Set-Content -Path $QueueFile -Value $q -Encoding utf8
$queued = Invoke-SelfQueue 9
Check "refuses when the queue is exhausted" ($queued -eq $false) $null
Check "says so rather than inventing work" ((Get-Content $NoteFile -Raw) -match 'exhausted') $null

Write-Host ""
Write-Host "=== Pulling file names out of a brief ==="

$files = Get-NamedFiles "Change ``src/server/queries/client-workspace.ts`` and add a test in src/lib/thing.test.ts. See https://opensdoors.bidlow.co.uk for context."
Check "finds a backticked path" ($files -contains "src/server/queries/client-workspace.ts") "got: $($files -join ', ')"
Check "finds a bare path" ($files -contains "src/lib/thing.test.ts") "got: $($files -join ', ')"
Check "does not mistake a hostname for a file" (-not ($files -contains "opensdoors.bidlow.co.uk")) "got: $($files -join ', ')"

Write-Host ""
Write-Host "=== The REAL QUEUE.md - format only, never specific content ==="

# Content checks belong on the fixture above. This only proves the live file is
# still SHAPED like something the watcher can read, so a formatting mistake in
# the queue is caught here rather than at 3am by a watcher that silently idles.
$QueueFile = (Resolve-Path (Join-Path $PSScriptRoot "..\..\.bidlow\relay\QUEUE.md")).Path
$realRows = Get-QueueRows
Check "the live queue parses at all" ($realRows.Count -ge 1) "got $($realRows.Count) rows"
Check "the live queue has more than a couple of items" ($realRows.Count -ge 5) "got $($realRows.Count)"

$unreadable = $realRows | Where-Object {
    $_.Status -notmatch '^(TODO|DONE|IN PROGRESS|BLOCKED)'
}
Check "every status is one the watcher recognises" ($unreadable.Count -eq 0) `
    "unrecognised: $((($unreadable | ForEach-Object { "#$($_.Number)='$($_.Status)'" }) -join ', '))"

$actionable = $realRows | Where-Object { $_.Status -notmatch '^DONE' -and $_.Status -notmatch '^IN PROGRESS' } | Select-Object -First 1
if ($actionable) {
    Write-Host "      next item the relay would take: #$($actionable.Number) [$($actionable.Status)]"
} else {
    Write-Host "      the live queue is exhausted; the relay would idle and say so"
}

# --- tidy up ---------------------------------------------------------------
Set-Location $PSScriptRoot
Remove-Item $Sandbox -Recurse -Force -ErrorAction SilentlyContinue

Write-Host ""
if ($fail -eq 0) {
    Write-Host "ALL PASS - $pass checks. The watcher's outcome and self-queueing logic work."
    exit 0
}
Write-Host "$fail of $($pass + $fail) checks FAILED."
exit 1
