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

# -LoadOnly loads the functions below WITHOUT starting the loop, so the
# self-test can exercise them.
#
# 2026-08-26: this guard is not a convenience. Before it existed, dot-sourcing
# this file to get at one function STARTED THE RELAY - PowerShell runs a script
# it is asked to dot-source, and a script with no param() block silently
# swallows the switch that was meant to prevent exactly that. It self-queued the
# next item, overwrote CURRENT.md and launched a live cycle before anyone
# noticed. Removing this param block re-arms that trap.
param(
    [switch]$LoadOnly
)

$ErrorActionPreference = "Stop"

# Read the agent's output as UTF-8, and write files as UTF-8.
#
# Without this, every em-dash in a cycle log arrives as three garbage letters.
# That is the UTF-8 byte sequence for an em-dash (E2 80 94) being decoded with
# the console's OEM code page. `claude -p` emits UTF-8; PowerShell read it as
# CP850. (The garbled form is not reproduced here on purpose - this file is
# plain ASCII, and pasting the corruption in would have broken that rule.)
#
# It matters more than it looks. The plain-English cycle log is the whole point
# of the evidence work - it is what Greg actually reads - and a corrupted log is
# a log nobody trusts. Setting this at the source fixes every future cycle.
# (Repairing the EXISTING corrupted logs is queue item 11, and is separate.)
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
$PSDefaultParameterValues['Set-Content:Encoding'] = 'utf8'
$PSDefaultParameterValues['Add-Content:Encoding'] = 'utf8'
$PSDefaultParameterValues['Out-File:Encoding']    = 'utf8'

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

# How long to wait before re-reading QUEUE.md after the relay REFUSED to take an
# item (a malformed row, a BLOCKED row, an exhausted queue).
#
# A refusal used to be permanent: the code set $lastSelfQueued = $cycle, which
# made the guard `$lastSelfQueued -ge $cycle` true forever, and because that
# number is persisted to STATUS.json, restarting the relay INHERITED the
# deadlock. The relay looked alive - it logged, it self-tested, it slept - and
# could never take another item. Seventh instance of the house defect.
#
# A refusal is temporary. The usual cause is a human fixing the queue row
# moments later. So: back off, then look again.
$RefusalRetryMins = 5

# How long one cycle may take before it is killed.
#
# Before this existed, a hung `claude -p` blocked the watcher forever and only a
# human closing the window could clear it - which is the whole difference
# between a relay that runs overnight and a window Greg has to watch.
#
# 45 minutes is well above any cycle this repository has recorded (the longest
# so far is about 20) and well below "Greg is asleep", so a hang costs one item
# rather than the night.
$CycleTimeoutMinutes = 45

# The workflow that does the actual emailing. See Send-RelayAlert.
$AlertWorkflow = "relay-alert.yml"
$AlertRef      = "main"

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
        if ($null -eq $s.PSObject.Properties['refusedAt']) {
            $s | Add-Member -NotePropertyName refusedAt -NotePropertyValue $null -Force
        }
        return $s
    }
    catch { return [pscustomobject]@{ cycle = 0; lastOutcome = "status file unreadable"; updated = $null; lastSelfQueued = -1 } }
}

function Save-Status($cycle, $outcome, $lastSelfQueued, $refusedAt) {
    # $refusedAt is deliberately the LAST parameter and deliberately optional.
    # Every call site that does not pass it clears it, which is what we want:
    # any call that records real progress means the refusal is over.
    $status = [pscustomobject]@{
        cycle          = $cycle
        lastOutcome    = $outcome
        updated        = (Get-Date -Format "o")
        lastSelfQueued = $lastSelfQueued
        refusedAt      = $refusedAt
    }
    $status | ConvertTo-Json | Set-Content -Path $StatusFile -Encoding utf8
}

# ===========================================================================
# TELLING GREG - from his inbox, not from a window
#
# The relay is only autonomous if its death reaches him without him looking.
# The alerting he already has works exactly this way: a job fails, an email
# arrives. This is the same idea pointed at the relay itself.
#
# WHY IT GOES THROUGH GITHUB ACTIONS RATHER THAN CALLING RESEND DIRECTLY
#
# The queue item said to use "the same Resend key and ALERT_TO_EMAIL the job
# alerting already uses". Both of those are GitHub SECRETS. Neither is on this
# laptop - `.env` has no RESEND_API_KEY, and `.env.example` has never carried
# ALERT_TO_EMAIL at all.
#
# So the choice was: copy a production secret onto a laptop, or send from the
# place that already holds it. Sending from Actions uses the identical key and
# the identical recipient, puts no secret on disk, and has one property a local
# call does not: every alert leaves a run in the history, so "did it actually
# send?" is a question with an answer.
#
# The cost is honest and worth stating: if GitHub is unreachable, or the `gh`
# login expires, the alert does not send. That is why the self-test checks the
# login on every start, and why a failure to dispatch is shouted rather than
# swallowed - a silent alerting layer produces the same silence as a healthy
# relay, which is the one thing it must never do.
# ===========================================================================

function Test-AlertPathArmed {
    if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
        return [pscustomobject]@{ Ok = $false; Detail = "the GitHub CLI (gh) is not installed, so nothing can be emailed" }
    }
    $workflow = Join-Path $RepoRoot ".github\workflows\$AlertWorkflow"
    if (-not (Test-Path $workflow)) {
        return [pscustomobject]@{ Ok = $false; Detail = "$AlertWorkflow is missing, so there is nothing to dispatch" }
    }

    $previous = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try {
        $null = & gh auth status 2>&1
        $authed = ($LASTEXITCODE -eq 0)
    } catch {
        $authed = $false
    } finally {
        $ErrorActionPreference = $previous
    }

    if (-not $authed) {
        return [pscustomobject]@{ Ok = $false; Detail = "gh is installed but not signed in, so a dispatch would be rejected" }
    }
    return [pscustomobject]@{ Ok = $true; Detail = "gh is signed in and $AlertWorkflow is present" }
}

function Send-RelayAlert($subject, $body) {
    $armed = Test-AlertPathArmed
    if (-not $armed.Ok) {
        Write-Line "COULD NOT EMAIL GREG: $($armed.Detail). The alert was: $subject"
        return $false
    }

    # workflow_dispatch inputs are not a place to put a whole cycle log. The
    # email is a nudge to go and look, so it carries the headline and says where
    # the detail is.
    $trimmed = $body
    if ($trimmed.Length -gt 1500) {
        $trimmed = $trimmed.Substring(0, 1500) + "`n`n[cut short here - the whole story is in the cycle log]"
    }

    $previous = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try {
        $out = & gh workflow run $AlertWorkflow --ref $AlertRef -f "subject=$subject" -f "body=$trimmed" 2>&1 | Out-String
        $ok  = ($LASTEXITCODE -eq 0)
    } catch {
        $out = $_.Exception.Message
        $ok  = $false
    } finally {
        $ErrorActionPreference = $previous
    }

    if ($ok) {
        Write-Line "Emailed Greg: $subject"
    } else {
        Write-Line "COULD NOT EMAIL GREG. gh refused the dispatch: $($out.Trim())"
    }
    return $ok
}

function Stop-Relay($why) {
    Set-Content -Path $HaltFile -Value $why -Encoding utf8
    Write-Line "STOPPED: $why"
    Write-Line "The HALT file now exists. Delete it before starting again."
    # The relay stopping IS the news. Waiting for him to notice a closed window
    # is the failure this cycle exists to remove.
    Send-RelayAlert "ODoutreach relay STOPPED" @"
The relay has stopped and will not pick up any more work until it is started again.

Why it stopped:
$why

To restart it: run relay-start.cmd in the repository folder. It clears the HALT
file for you. If it stopped because the safety gate was off, check that first -
it will simply stop again otherwise.
"@ | Out-Null
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

# ===========================================================================
# RUNNING ONE CYCLE, WITH A DEADLINE
#
# The old version was `$prompt | claude -p ... | Out-String`. It was correct
# right up until the agent hung, at which point the watcher blocked on the pipe
# with no handle on the process and no way out except a human.
#
# This runs the same command with a deadline and, crucially, kills the whole
# PROCESS TREE. `claude.exe` is a launcher: killing it and leaving its children
# alive would look identical in the log to a clean recovery, while the machine
# quietly filled up with dead cycles. The self-test asserts the descendants are
# gone, not just the parent.
#
# Exe/ExeArgs are parameters rather than hard-coded so the self-test can point
# this at a process that is guaranteed to hang. Testing a 45-minute timeout by
# waiting 45 minutes is not a test anyone runs twice.
# ===========================================================================

# Every process descended from $rootPid, parent first.
#
# Windows reuses PIDs, so an old PID could name an unrelated process that is
# now somebody else's. Only processes started at or after the root are counted,
# which cannot happen for a genuine descendant and rules out killing a stranger.
function Get-ProcessTreePids([int]$rootPid, [datetime]$startedNoEarlierThan) {
    $found = New-Object System.Collections.Generic.List[int]
    $found.Add($rootPid)

    $byParent = @{}
    try {
        foreach ($p in Get-CimInstance Win32_Process -Property ProcessId, ParentProcessId, CreationDate) {
            if ($null -ne $p.CreationDate -and $p.CreationDate -lt $startedNoEarlierThan) { continue }
            $parent = [int]$p.ParentProcessId
            if (-not $byParent.ContainsKey($parent)) {
                $byParent[$parent] = New-Object System.Collections.Generic.List[int]
            }
            $byParent[$parent].Add([int]$p.ProcessId)
        }
    } catch {
        # Cannot enumerate - fall back to the one PID we know for certain.
        return $found
    }

    $stack = New-Object System.Collections.Generic.Stack[int]
    $stack.Push($rootPid)
    while ($stack.Count -gt 0) {
        $current = $stack.Pop()
        if ($byParent.ContainsKey($current)) {
            foreach ($child in $byParent[$current]) {
                if (-not $found.Contains($child)) {
                    $found.Add($child)
                    $stack.Push($child)
                }
            }
        }
    }
    return $found
}

function Invoke-CycleAgent {
    param(
        [Parameter(Mandatory = $true)][string]$PromptPath,
        [Parameter(Mandatory = $true)][int]$TimeoutSeconds,
        [Parameter(Mandatory = $true)][string]$Exe,
        [string[]]$ExeArgs = @()
    )

    $stamp   = [guid]::NewGuid().ToString('N')
    $outFile = Join-Path $env:TEMP "relay-agent-$stamp.out"
    $errFile = Join-Path $env:TEMP "relay-agent-$stamp.err"

    $startArgs = @{
        FilePath               = $Exe
        RedirectStandardInput  = $PromptPath
        RedirectStandardOutput = $outFile
        RedirectStandardError  = $errFile
        NoNewWindow            = $true
        PassThru               = $true
    }
    if ($ExeArgs.Count -gt 0) { $startArgs['ArgumentList'] = $ExeArgs }

    $launchedAt = Get-Date
    try {
        $proc = Start-Process @startArgs
        # Touching the handle makes ExitCode readable later. Without it
        # Start-Process -PassThru can hand back a process whose exit code is
        # permanently $null, and a cycle that failed would report nothing.
        $null = $proc.Handle
    } catch {
        return [pscustomobject]@{
            Started  = $false
            TimedOut = $false
            ExitCode = $null
            Output   = "The cycle could not be started at all: $($_.Exception.Message)"
            Pids     = @()
            Seconds  = 0
        }
    }

    $deadline = $launchedAt.AddSeconds($TimeoutSeconds)
    $timedOut = $false
    while (-not $proc.HasExited) {
        if ((Get-Date) -ge $deadline) { $timedOut = $true; break }
        Start-Sleep -Milliseconds 500
    }

    $treePids = @()
    if ($timedOut) {
        # Take the census BEFORE killing, or there is nothing left to name.
        $treePids = Get-ProcessTreePids $proc.Id $launchedAt

        $previous = $ErrorActionPreference
        $ErrorActionPreference = "Continue"
        try {
            $null = & taskkill.exe /T /F /PID $proc.Id 2>&1
        } catch {
            # taskkill missing or refused - at least take the parent down.
            try { Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue } catch {}
        } finally {
            $ErrorActionPreference = $previous
        }

        # Killing is asynchronous. Do not report a kill until the processes are
        # actually gone, because "we asked it to die" is not the same sentence.
        $killDeadline = (Get-Date).AddSeconds(20)
        while ((Get-Date) -lt $killDeadline) {
            $alive = @($treePids | Where-Object { Get-Process -Id $_ -ErrorAction SilentlyContinue })
            if ($alive.Count -eq 0) { break }
            foreach ($stubborn in $alive) {
                try { Stop-Process -Id $stubborn -Force -ErrorAction SilentlyContinue } catch {}
            }
            Start-Sleep -Milliseconds 300
        }
    }

    $exitCode = $null
    if (-not $timedOut) {
        try {
            $proc.WaitForExit()
            $exitCode = $proc.ExitCode
        } catch { $exitCode = $null }
    }

    $output = ""
    foreach ($file in @($outFile, $errFile)) {
        if (-not (Test-Path $file)) { continue }
        try {
            $text = Get-Content $file -Raw -Encoding UTF8
            if (-not [string]::IsNullOrWhiteSpace($text)) { $output += $text }
        } catch {
            $output += "`n[could not read $file]`n"
        }
        Remove-Item $file -Force -ErrorAction SilentlyContinue
    }

    return [pscustomobject]@{
        Started  = $true
        TimedOut = $timedOut
        ExitCode = $exitCode
        Output   = $output
        Pids     = $treePids
        Seconds  = [math]::Round(((Get-Date) - $launchedAt).TotalSeconds, 1)
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
#
# ---------------------------------------------------------------------------
# WHY THIS IS A REGEX AND NOT A SPLIT ON "|"
#
# It used to be `-split '\|'` with the status read as `$parts[$parts.Count - 2]`.
# That is the status ONLY when the row contains exactly four pipes.
#
# 2026-08-26: item 31's status text quoted the Azure runtime string
# "NODE|20-lts". That fifth pipe shifted every column, the status came back as
# the fragment starting "20-lts", no branch recognised it, and the watcher wrote
# a note saying the next item had an unrecognised status and idled for the rest
# of the evening - with a fully green queue behind it. One cycle lost, silently.
#
# `Set-QueueRowStatus` had the same defect and was worse: it WROTE to that index,
# so it would have overwritten the wrong half of the row.
#
# The cure is to stop counting fields. The id is anchored to the front of the
# row and the status to the LAST cell boundary that is followed by a status the
# relay actually recognises, so an inner pipe - in the item text or in the status
# text - cannot move either one.
#
# Honest limit: a status cell that itself contained the literal text "| TODO"
# would still be ambiguous, because at that point the row genuinely is. Nothing
# short of escaping the delimiter fixes that, and no row has ever done it.
# ---------------------------------------------------------------------------
$QueueStatusKeywords = 'TODO|DONE|BLOCKED|PARTIAL|IN PROGRESS|WONTFIX'

# Groups, identical in both patterns below:
#   1 = "| id |" prefix, 2 = id, 3 = item cell, 4 = the boundary pipe,
#   5 = status cell, 6 = the closing pipe and any trailing space.
# Group 3 is greedy on purpose: that is what makes group 4 the LAST viable
# boundary rather than the first.
#
# The leading "**" is matched but NOT captured. Rows in this queue are routinely
# written with the status in markdown bold - "| **PARTIAL 17 - ...** |" - and
# item 27 was exactly that. Capturing it would put "**" in front of the keyword
# and break every `-match '^DONE'` test downstream, so the emphasis is stepped
# over and group 5 always begins at the keyword itself. Leaving it out of the
# capture also means Set-QueueRowStatus drops it cleanly on rewrite.
#
# ---------------------------------------------------------------------------
# WHY THERE ARE TWO PATTERNS AND THE STRICT ONE IS TRIED FIRST
#
# "Last boundary followed by a status keyword" is not enough on its own, and this
# cycle proved it the hard way. The status written for item 32 quoted the parser's
# own keyword list - "TODO|DONE|BLOCKED|PARTIAL|IN PROGRESS|WONTFIX" - so the row
# contained a pipe sitting immediately in front of the word WONTFIX. The loose
# pattern anchored there, read the status as "WONTFIX), so an inner pipe...", and
# the relay would have re-taken an item it had just finished.
#
# The discriminator is whitespace. A real cell boundary in this table is always
# written " | " with a space on each side. The pipes that cause trouble never are:
# "NODE|20-lts", "a|b", "TODO|DONE" are all written tight. So the STRICT pattern
# requires whitespace on both sides of the boundary, which excludes every inline
# pipe seen so far, and the LOOSE pattern is kept only as a fallback for a row
# written compactly as "|32|item|TODO|".
#
# Honest limit: a status cell containing the literal text " | TODO " - spaces and
# all - would still be ambiguous, because at that point the row genuinely is.
# Nothing short of escaping the delimiter fixes that.
# ---------------------------------------------------------------------------
$QueueRowPatternStrict =
    "^(\s*\|\s*(\d+)\s*\|)(.*\s)(\|)\s+(?:\*{1,2}|_{1,2})?\s*((?:$QueueStatusKeywords)\b.*?)\s*(\|\s*)$"

$QueueRowPatternLoose =
    "^(\s*\|\s*(\d+)\s*\|)(.*)(\|)\s*(?:\*{1,2}|_{1,2})?\s*((?:$QueueStatusKeywords)\b.*?)\s*(\|\s*)$"

# One reader, so Get-QueueRows and Set-QueueRowStatus can never disagree about
# where a row's columns are. They did once, and it wrote to the wrong half.
function Get-QueueRowMatch([string]$line) {
    $m = [regex]::Match($line, $QueueRowPatternStrict)
    if ($m.Success) { return $m }
    return [regex]::Match($line, $QueueRowPatternLoose)
}

# Anything that is shaped like a numbered row, whether or not its status parses.
# Used to tell "this row is broken" apart from "this line is not a row at all" -
# the distinction the lost cycle needed and did not have.
$QueueRowShapePattern = '^\s*\|\s*(\d+)\s*\|.*\|\s*$'

function Get-QueueRows {
    if (-not (Test-Path $QueueFile)) { return @() }
    $rows = New-Object System.Collections.Generic.List[object]
    $lines = Get-Content $QueueFile
    for ($i = 0; $i -lt $lines.Count; $i++) {
        # [string] strips the PSPath / PSDrive / PSProvider NoteProperties that
        # Windows PowerShell 5.1 - the host relay-start.cmd actually uses - hangs
        # off every line Get-Content returns. Without it, `Raw` below carries the
        # whole filesystem-provider object graph, and anything that serialises a
        # row balloons to hundreds of kilobytes. PowerShell 7 does not decorate
        # its strings, so this is invisible until it runs on the real host.
        $line = [string]$lines[$i]

        $m = Get-QueueRowMatch $line
        if ($m.Success) {
            $rows.Add([pscustomobject]@{
                Number    = $m.Groups[2].Value.Trim()
                Item      = $m.Groups[3].Value.Trim()
                Status    = $m.Groups[5].Value.Trim()
                LineIndex = $i
                Raw       = [string]$line
                Parsed    = $true
            })
            continue
        }

        # Shaped like a row, but carrying no status the relay knows. It is
        # RETURNED, flagged - never dropped. A dropped row reads downstream as
        # "the queue ran out of work", which is the lie that cost the cycle.
        $shape = [regex]::Match($line, $QueueRowShapePattern)
        if ($shape.Success) {
            $rows.Add([pscustomobject]@{
                Number    = $shape.Groups[1].Value.Trim()
                Item      = ""
                Status    = $null
                LineIndex = $i
                Raw       = [string]$line
                Parsed    = $false
            })
        }
    }
    return $rows
}

function Set-QueueRowStatus($number, $newStatus) {
    $lines = Get-Content $QueueFile
    for ($i = 0; $i -lt $lines.Count; $i++) {
        $m = Get-QueueRowMatch ([string]$lines[$i])
        if (-not $m.Success) { continue }
        if ($m.Groups[2].Value.Trim() -ne $number) { continue }

        # Rebuild from the SAME anchor the reader used: everything up to and
        # including the boundary pipe is kept byte for byte, only the status cell
        # is replaced. A row this function cannot parse is a row it refuses to
        # touch - guessing at the columns is how the old version corrupted them.
        $lines[$i] = $m.Groups[1].Value + $m.Groups[3].Value + $m.Groups[4].Value +
                     " $newStatus " + $m.Groups[6].Value
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
    # Do not reorder, do not skip, do not invent. A row that would not parse
    # counts as "not finished" and stops the queue here, deliberately - skipping
    # past it would hide the fault and run the wrong item.
    $next = $rows | Where-Object {
        (-not $_.Parsed) -or ($_.Status -notmatch '^DONE' -and $_.Status -notmatch '^IN PROGRESS')
    } | Select-Object -First 1

    if ($null -eq $next) {
        Write-SelfQueueNote "Every item in QUEUE.md is DONE or IN PROGRESS. The queue is exhausted, so the relay is idling rather than inventing work. Greg needs to add the next item."
        return $false
    }

    # The guard that makes a formatting fault LOUD.
    #
    # The lost cycle of 2026-08-26 read a mangled status, did not recognise it,
    # and wrote a note that read like an ordinary exhausted queue. Nobody could
    # tell from the note that the queue was fine and the PARSER was wrong. So
    # when the relay cannot read a row, it now prints the row.
    if (-not $next.Parsed) {
        Write-SelfQueueNote @"
The next row in order is #$($next.Number), and the relay could not read it.

It is shaped like a queue row, but its status cell does not start with any status
the relay recognises. Those are: TODO, DONE, BLOCKED, PARTIAL, IN PROGRESS, WONTFIX.

This is the row exactly as it appears in QUEUE.md, line $($next.LineIndex + 1):

    $($next.Raw)

THE QUEUE IS NOT EMPTY - this is a formatting fault in one row, and there may be
perfectly good work behind it. Fix that row's status cell and the relay will pick
up again on its own within $RefusalRetryMins minutes. Nothing has been skipped and
nothing has been changed.
"@
        return $false
    }

    # ANCHORED, and that anchor is load-bearing.
    #
    # This was `-match 'BLOCKED'`. PowerShell's -match is an unanchored,
    # CASE-INSENSITIVE substring test, so a status that merely mentioned the word
    # in passing halted the relay. Found by replaying the 2026-08-26 queue through
    # the fixed parser: row 27's status read "PARTIAL 17 - ... (3) blocked on
    # tooling ...", and the relay stopped dead on a row that was not blocked at
    # all. Same defect class as the pipe - a status cell read by guesswork.
    if ($next.Status -match '^BLOCKED') {
        Write-SelfQueueNote "The next item in order is #$($next.Number), and it is BLOCKED:`n`n> $($next.Item)`n`nThe relay does not skip past a blocked item, because the order is the plan. Idling until Greg unblocks it or reorders the queue."
        return $false
    }

    if ($next.Item -match 'needs Greg|Greg must|ask Greg|Greg''s call|Greg decides|awaiting Greg|requires Greg|Greg picks') {
        Write-SelfQueueNote "The next item in order is #$($next.Number), and it says it needs Greg:`n`n> $($next.Item)`n`nThe relay will not decide something that was explicitly reserved for him. Idling."
        return $false
    }

    if ($next.Status -notmatch '^TODO') {
        # The row parsed cleanly - this is a real status the relay simply does
        # not take automatically. The raw row goes in anyway, because the one
        # thing the lost cycle proved is that a status quoted out of context is
        # not enough to tell a deliberate hold from a broken cell.
        Write-SelfQueueNote @"
The next item in order is #$($next.Number), and its status is '$($next.Status)'.

Only TODO is taken automatically, so the relay is idling rather than deciding for
itself that this counts as ready.

The row as it appears in QUEUE.md, line $($next.LineIndex + 1):

    $($next.Raw)
"@
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

# Everything above is definitions. Everything below DOES something, so this is
# where -LoadOnly stops. Nothing that changes a file, moves the working
# directory or starts a cycle may go above this line.
if ($LoadOnly) { return }

New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
Set-Location $RepoRoot

Write-Line "Relay watcher started. Repo: $RepoRoot"
Write-Line "Checking for work every $SleepSecs seconds. Stop it by creating: $HaltFile"
Write-Line "A cycle that runs longer than $CycleTimeoutMinutes minutes will be killed and the next item taken."

# Before anything else, and BEFORE the HALT check - a stale "running" is a lie
# whether or not this watcher goes on to do any work.
Resolve-InterruptedCycle

if (Test-Path $HaltFile) {
    Write-Line "HALT already exists, so there is nothing to do. Delete it first if you want to run."
    exit 0
}

$claudeCommand = Get-Command claude -ErrorAction SilentlyContinue
if (-not $claudeCommand) {
    Write-Line "Cannot find the 'claude' command, so no work could be run. Nothing started."
    exit 1
}
$ClaudeExe = $claudeCommand.Source

# ---------------------------------------------------------------------------
# THE STARTUP GATE
#
# The timeout and the alerting only matter on the night something goes wrong,
# which is exactly the shape of a thing that rots unnoticed. So they are proven
# on every single start, against the real code on the real machine, and the
# relay refuses to run if the proof fails. A relay with a broken timeout is the
# thing this cycle set out to abolish.
# ---------------------------------------------------------------------------
$selfTestScript = Join-Path $RepoRoot "relay-selftest.ps1"
$selfTestFailed = Join-Path $RelayDir "SELFTEST-FAILED.md"
if (Test-Path $selfTestFailed) { Remove-Item $selfTestFailed -Force -ErrorAction SilentlyContinue }

if (-not (Test-Path $selfTestScript)) {
    Write-Line "relay-selftest.ps1 is missing. Refusing to run unproven. Nothing started."
    exit 1
}

Write-Line "Proving the timeout and the alert path before taking any work..."
try {
    $host_exe = [System.Diagnostics.Process]::GetCurrentProcess().MainModule.FileName
} catch {
    $host_exe = "powershell.exe"
}
$selfTestOutput = & $host_exe -NoProfile -ExecutionPolicy Bypass -File $selfTestScript 2>&1 | Out-String
Write-Host $selfTestOutput
if ($LASTEXITCODE -ne 0) {
    @(
        "# The relay refused to start"
        ""
        "Written $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')."
        ""
        "Its own safety machinery failed its self-test, so it did not take any work."
        "Nothing was run and nothing was changed."
        ""
        "``````"
        $selfTestOutput.Trim()
        "``````"
    ) | Set-Content -Path $selfTestFailed -Encoding utf8

    Send-RelayAlert "ODoutreach relay REFUSED TO START" @"
The relay did not start. Its own self-test failed, which means the timeout that
kills a hung cycle, or the path that sends you this email, is not working.

Nothing was run and nothing was changed.

$($selfTestOutput.Trim())
"@ | Out-Null

    Write-Line "Self-test FAILED. Refusing to run. Details written to $selfTestFailed"
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

        # Did we refuse recently? If so, wait $RefusalRetryMins before looking
        # at QUEUE.md again, so we do not rewrite the same note every minute.
        # This is a COOLDOWN, not a stop. It always expires.
        if ($status.refusedAt) {
            $since = $null
            try { $since = ((Get-Date) - [datetime]::Parse($status.refusedAt)).TotalMinutes } catch { $since = $null }
            if ($null -ne $since -and $since -lt $RefusalRetryMins) {
                Start-Sleep -Seconds $SleepSecs
                continue
            }
            if ($null -ne $since) {
                Write-Line ("Refusal cooldown of {0} min has expired. Re-reading QUEUE.md." -f $RefusalRetryMins)
            }
        }

        if (Invoke-SelfQueue ($cycle + 1)) {
            $lastSelfQueued = $cycle
            # No $refusedAt argument: taking an item clears any refusal.
            Save-Status $cycle $status.lastOutcome $lastSelfQueued
        } else {
            # Refused, and the note says why.
            #
            # DO NOT set $lastSelfQueued here. That is what deadlocked the relay
            # permanently and survived restarts. Stamp the time instead and let
            # the cooldown above expire on its own.
            Write-Line ("Refused to take an item. Will re-read QUEUE.md in {0} min. See SELF-QUEUE-NOTE.md." -f $RefusalRetryMins)
            Save-Status $cycle $status.lastOutcome $lastSelfQueued (Get-Date -Format "o")
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

    # The prompt goes in as a FILE rather than down a pipe, because a redirected
    # pipe gives no handle on the child and therefore no way to kill it.
    #
    # It is written without a byte-order mark on purpose: CURRENT.md carries one
    # (PowerShell 5.1 adds it), and those three bytes would arrive as the first
    # characters of the brief.
    $stdinPath = Join-Path $RelayDir "CURRENT.stdin.txt"
    [System.IO.File]::WriteAllText($stdinPath, $prompt, (New-Object System.Text.UTF8Encoding($false)))

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
    $run = Invoke-CycleAgent `
        -PromptPath     $stdinPath `
        -TimeoutSeconds ($CycleTimeoutMinutes * 60) `
        -Exe            $ClaudeExe `
        -ExeArgs        @("-p", "--permission-mode", "dontAsk", "--allowedTools", "Write,Edit,Read,Glob,Grep,Bash")

    Remove-Item $stdinPath -Force -ErrorAction SilentlyContinue

    $output = $run.Output

    $after   = Get-RepoEvidence $namedFiles
    $verdict = Get-EvidenceVerdict $before $after $namedFiles

    # The outcome comes from the evidence, not from the exit code - EXCEPT for
    # the three ways a cycle can end badly, which the evidence cannot see.
    # A cycle that was killed may well have changed files on its way down; that
    # is not the same as having finished, and must never be logged as though it
    # were.
    $alertSubject = $null
    $alertBody    = $null

    if (-not $run.Started) {
        $outcome  = "failed to run"
        $headline = "The cycle never started. $($run.Output)"
        $alertSubject = "ODoutreach relay: cycle $cycle could not start"
        $alertBody    = "Cycle $cycle never got as far as running.`n`n$($run.Output)`n`nThe relay is still going and has moved on to the next item."
    } elseif ($run.TimedOut) {
        $outcome  = "timed-out"
        $headline = @"
KILLED. This cycle was still running after $CycleTimeoutMinutes minutes, so it
was stopped, along with every process it had started ($($run.Pids.Count) in
total). The relay did NOT wait for it and has carried on to the next item.

Anything it had already written to disk is still there - a kill does not undo
work - so read the evidence below before assuming this item is untouched.
"@
        $alertSubject = "ODoutreach relay: cycle $cycle timed out"
        $alertBody    = @"
Cycle $cycle ran for more than $CycleTimeoutMinutes minutes and was killed.
$($run.Pids.Count) process(es) were stopped.

The relay is STILL RUNNING and has moved on to the next item by itself - you do
not need to do anything tonight.

What it was working on:
$(($prompt -split "`n" | Select-Object -First 3) -join "`n")

The full record is in .bidlow\relay\log\cycle-$('{0:d3}' -f $cycle).md
"@
    } elseif ($null -ne $run.ExitCode -and $run.ExitCode -ne 0) {
        $outcome  = "failed"
        $headline = "The cycle ran but ended badly (exit code $($run.ExitCode)). Anything below is partial. The relay has carried on to the next item."
        $alertSubject = "ODoutreach relay: cycle $cycle failed"
        $alertBody    = @"
Cycle $cycle ended with exit code $($run.ExitCode) after $($run.Seconds) seconds.

The relay is STILL RUNNING and has moved on to the next item by itself.

The full record is in .bidlow\relay\log\cycle-$('{0:d3}' -f $cycle).md
"@
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
        "How it ended: $(if (-not $run.Started) { 'it never started' } elseif ($run.TimedOut) { "killed at the $CycleTimeoutMinutes minute deadline" } else { "exit code $($run.ExitCode)" })."
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

    # Tell Greg AFTER the log exists, so the email can point at something that
    # is already there to read.
    if ($alertSubject) {
        Send-RelayAlert $alertSubject $alertBody | Out-Null
    }

    Start-Sleep -Seconds $SleepSecs
}
