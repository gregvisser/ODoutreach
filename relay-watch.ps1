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

# Row 137: the shared cross-project deck. ODoutreach's checkout is always
# three levels below C:\Bidlowprojects (BidlowClients\<Client>\<Repo>), so the
# projects root is derived from THIS repo's own location rather than
# hard-coded - the deck script itself defaults --root the same hard-coded way,
# and that default is exactly what the brief says to stop relying on.
# $DeckScriptPath / $DeckOutputPath point at the one named exception to "no
# cycle writes outside its own repository" - see Invoke-DeckRegeneration below.
#
# THIS MUST NEVER THROW AT LOAD TIME. relay-selftest.ps1's own harnesses (see
# relay/stale-watcher-visible.test.ts) dot-source a COPY of this file from a
# shallow scratch directory that has no three real parents, so Split-Path
# legitimately runs out and returns "" - and Join-Path refuses an empty Path
# under $ErrorActionPreference = "Stop", which used to crash the ENTIRE script
# load, not just deck regeneration, breaking every test that loads this file.
# Falling back to $RepoRoot itself keeps the load safe in that shape; the
# fallback deck paths simply will not exist there, and
# Invoke-DeckRegeneration's own Test-Path guard already turns "does not
# exist" into a normal, logged no-op rather than a crash.
$ProjectsRoot = try {
    $walked = Split-Path (Split-Path (Split-Path $RepoRoot -Parent) -Parent) -Parent
    if ([string]::IsNullOrEmpty($walked)) { $RepoRoot } else { $walked }
} catch {
    $RepoRoot
}
$DeckScriptPath = Join-Path $ProjectsRoot "_standards\bidlow-deck.mjs"
$DeckOutputPath = Join-Path $ProjectsRoot "bidlow-deck.html"

# ===========================================================================
# WHICH VERSION OF THIS SCRIPT IS THIS PROCESS ACTUALLY RUNNING?
#
# Captured HERE, at module scope, because that is the only moment it is
# knowable. PowerShell reads a script once, at launch, and then runs from
# memory; nothing later can ask "what was I started from?" once the file on
# disk has moved on. So the hash is taken at the instant of loading and kept.
#
# WHY THIS EXISTS AT ALL. Queue row 52 cost about ten cycles, none of them on a
# hard problem. The fix for the log-destroying writer was merged as `3d7fef6`
# and then did NOTHING for four more cycles, because the watcher process
# already running still held the pre-fix code. Cycles 64, 65, 70 and 71 each
# rediscovered that from scratch by noticing a clobbered log in `git status`.
# Not one of them could see which version was loaded, because nothing recorded
# it. This single line is what makes that visible; `Get-StaleWatcherNote`
# below turns it into a sentence in every cycle log.
#
# $null when the hash cannot be taken, and that stays $null rather than
# becoming a guess - the note reports "could not check", never a false
# all-clear.
$script:LoadedScriptHash = try {
    if ($PSCommandPath) { (Get-FileHash -Path $PSCommandPath -Algorithm SHA256).Hash } else { $null }
} catch {
    $null
}
# ===========================================================================

# The runaway guard. It counts cycles run by THIS watcher process, NOT the
# absolute cycle number in STATUS.json - and the difference is not cosmetic.
#
# Against the absolute number this guard bricks itself. On 2026-08-27 the relay
# reached cycle 39 of an absolute limit of 40. One more cycle and it would have
# halted; and because a restart reads the cycle number back OUT of STATUS.json,
# every restart after that would have re-read 40, tripped the same test before
# taking any work, and stopped again. Greg would have had a relay that emailed
# him, accepted a restart, and never ran another item - with no way out but
# editing this file.
#
# Counting per run keeps what the guard is actually for - a loop inside one
# session that will not end must end itself - while making a restart always a
# real recovery instead of a re-trip.
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

# WHICH repository that workflow lives in, named explicitly.
#
# 2026-08-27: `gh workflow run` works out the repository from the CURRENT
# DIRECTORY's git remote. That is an invisible dependency on the working
# directory, and the stall proof tripped over it on its first run: the relay
# detected its own silence perfectly, then could not report it, because gh had
# been started somewhere that was not a git checkout.
#
# In normal operation the watcher does Set-Location $RepoRoot first, so this has
# never bitten the live relay. But an alarm whose delivery depends on where it
# was launched from is an alarm with a hidden way to fail, and the entire point
# of this machinery is that the failure of last resort must still get through.
#
# Resolved ONCE, from this script's own folder, so the answer does not change
# with the working directory.
function Resolve-AlertRepo {
    # An explicit override wins, which is what lets relay-stall-proof.ps1 run the
    # real watcher from a sandbox that is deliberately not a git checkout.
    if ($env:RELAY_ALERT_REPO) { return $env:RELAY_ALERT_REPO }

    $previous = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try {
        $url = (& git -C $PSScriptRoot remote get-url origin 2>$null | Out-String).Trim()
    } catch {
        $url = ""
    } finally {
        $ErrorActionPreference = $previous
    }

    if ([string]::IsNullOrWhiteSpace($url)) { return "" }

    # Handles both https://github.com/owner/repo.git and git@github.com:owner/repo
    $m = [regex]::Match($url, 'github\.com[:/]+([^/\s]+/[^/\s]+?)(?:\.git)?\s*$')
    if ($m.Success) { return $m.Groups[1].Value }
    return ""
}

$AlertRepo = Resolve-AlertRepo

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
        $s = Get-Content $StatusFile -Raw -Encoding UTF8 | ConvertFrom-Json
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
    if ([string]::IsNullOrWhiteSpace($AlertRepo)) {
        return [pscustomobject]@{ Ok = $false; Detail = "the GitHub repository could not be worked out, so gh would not know where to send the alert" }
    }
    return [pscustomobject]@{ Ok = $true; Detail = "gh is signed in, $AlertWorkflow is present, and the repo is $AlertRepo" }
}

function Send-RelayAlert($subject, $body) {
    # ---------------------------------------------------------------------
    # THE TEST-SUITE MUTE, AND WHY IT CANNOT BE USED TO BUY SILENCE
    #
    # 2026-08-27: adding the unparseable-row alert made `npm test` send two real
    # emails, because relay/queue-parser.test.ts dot-sources this very file and
    # drives Invoke-SelfQueue across a deliberately broken row. A test suite that
    # emails a human is a test suite people stop running.
    #
    # The obvious fix - an env var that switches alerting off - is also the
    # obvious way to defeat the entire point of this machinery. So it is paired
    # with a check in relay-selftest.ps1 that REFUSES TO START THE RELAY while
    # this variable is set. The mute therefore cannot be applied to the process
    # that matters: setting it stops the relay loudly rather than letting it run
    # deaf. The only thing it can silence is a test harness.
    # ---------------------------------------------------------------------
    if ($env:RELAY_ALERT_SUPPRESS) {
        Write-Line "ALERT SUPPRESSED because RELAY_ALERT_SUPPRESS is set (test harness only). Would have sent: $subject"
        return $false
    }

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
        $out = & gh workflow run $AlertWorkflow --repo $AlertRepo --ref $AlertRef -f "subject=$subject" -f "body=$trimmed" 2>&1 | Out-String
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
    #
    # The subject carries the count of waiting jobs because on a phone it may be
    # the only part he sees, and "STOPPED" alone does not say whether the night
    # still has work in it. This is the path the 40-cycle cap arrives on.
    $waiting = 0
    try { $waiting = Get-QueueTodoCount } catch { $waiting = 0 }
    $stopSubject = if ($waiting -gt 0) {
        "ODoutreach relay STOPPED - $waiting jobs still waiting, restart it"
    } else {
        "ODoutreach relay STOPPED - queue empty, nothing left waiting"
    }

    Send-RelayAlert $stopSubject @"
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

# ===========================================================================
# A STALE .git/index.lock SILENTLY DISABLES EVERY COMMIT THAT FOLLOWS IT
#
# Cycles 146 and 147 were killed at the 45-minute deadline while git held the
# index lock. The kill removes the process but leaves the lock file on disk -
# git itself refuses every future `git add` / `git commit` against a repo with
# an index.lock present, whether or not anything still holds it. Cycle 148 then
# did the whole of row 117 correctly and could not commit a single byte because
# of exactly this, and still reported the row DONE - the work was nearly lost.
#
# Runs at the START of every cycle, before the brief is handed to Claude Code,
# so a lock left behind by the PREVIOUS cycle's kill never blocks the next one.
#
# A lock that IS held by a live git process must be left alone - removing it
# out from under a running git command corrupts the index. -GitProcessCheck is
# a parameter, not a hard-coded `Get-Process -Name git`, so the self-test can
# simulate "held" and "not held" without needing a real git process to exist at
# the moment the test runs.
# ===========================================================================
function Clear-StaleIndexLock {
    param(
        [Parameter(Mandatory = $true)][string]$RepoPath,
        [Parameter(Mandatory = $true)][datetime]$Now,
        [scriptblock]$GitProcessCheck = { Get-Process -Name "git" -ErrorAction SilentlyContinue }
    )

    $lockPath = Join-Path $RepoPath ".git\index.lock"

    if (-not (Test-Path $lockPath -PathType Leaf)) {
        return [pscustomobject]@{ Found = $false; Removed = $false; Held = $false; Note = $null }
    }

    $liveGit = & $GitProcessCheck
    if ($liveGit) {
        $pid0 = @($liveGit)[0].Id
        return [pscustomobject]@{
            Found   = $true
            Removed = $false
            Held    = $true
            Note    = "Found .git/index.lock, but a live git process (PID $pid0) holds it - left alone."
        }
    }

    $ageMinutes = $null
    try {
        $ageMinutes = [math]::Round(($Now - (Get-Item -Path $lockPath).LastWriteTime).TotalMinutes, 1)
    } catch {
        $ageMinutes = $null
    }
    $ageText = if ($null -ne $ageMinutes) { "$ageMinutes minutes old" } else { "age unknown" }

    try {
        Remove-Item -Path $lockPath -Force
        return [pscustomobject]@{
            Found   = $true
            Removed = $true
            Held    = $false
            Note    = "Cleared a stale .git/index.lock ($ageText). No live git process held it."
        }
    } catch {
        return [pscustomobject]@{
            Found   = $true
            Removed = $false
            Held    = $false
            Note    = "Found a stale .git/index.lock ($ageText) but could not remove it: $($_.Exception.Message)"
        }
    }
}

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
# WRITING THE LOG WITHOUT DESTROYING THE ONE THAT IS ALREADY THERE
#
# This function exists because the line it replaced was
# `... | Set-Content -Path $logFile`, and Set-Content TRUNCATES.
#
# TWO WRITERS, ONE FILENAME. The watcher picks $logFile at the START of a cycle
# and writes it at the END. But a cycle also writes its own account of itself to
# that exact path while it runs - that is what Greg actually reads, and the last
# nine of them run to 130-230 lines. So the watcher's final Set-Content landed on
# top of a file the agent had already written, and truncation is not a merge:
# the agent's log was gone.
#
# WHAT SURVIVED WAS NOT A COPY OF IT. The replacement is this function's own
# boilerplate, the brief, and $output - which is only the agent's LAST message on
# stdout, not the file it wrote. When that last message was short the whole
# record collapsed to 101 lines reading "Work happened. Evidence: a git ref
# moved, so something was committed." A log that says "Work happened" cannot be
# told apart from a cycle that did nothing.
#
# IT WAS NOT A NEAR MISS. `cycle-056.md` on `main` IS the stub; the real
# 145-line log survives only on the unmerged branch `feat/privacy-terms-pages`.
# Cycle 56 is the cycle that FOUND this bug - it caught 054 and 055 being
# clobbered, rescued both, and lost its own log to the same defect on the way
# out. And the loss was not passive: `relay/cycle-log-reaches-git.test.ts` makes
# cycle N+1 commit whatever is on disk for cycle N, so the stub is actively
# pushed into git by a green test.
#
# WHY THIS APPENDS RATHER THAN SKIPPING THE WRITE. The watcher's record is the
# only part nobody can fake - exit code, timing, and an evidence verdict derived
# from what moved on disk rather than from what the agent claims. Dropping it to
# protect the agent's log would trade one silent loss for another. So neither is
# preferred and neither is discarded: the cycle's own words are kept byte for
# byte, and the watcher's evidence goes underneath them.
#
# The rule is the whole point, so it is stated plainly: THIS FUNCTION NEVER
# SHORTENS A FILE. If the target has content, the only permitted operation is to
# add to the end of it.
#
# `relay/cycle-log-preserved.test.ts` drives this function directly and fails if
# a single byte of pre-existing content stops coming back.
# ===========================================================================
function Write-CycleLog {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        # [AllowEmptyString()] is load-bearing, not tidiness. A MANDATORY
        # [string[]] parameter applies ValidateNotNullOrEmpty to each ELEMENT, so
        # PowerShell refuses to bind an array containing "" with "Cannot bind
        # argument to parameter 'Lines' because it is an empty string". The real
        # call site passes blank lines as paragraph breaks, so without this the
        # watcher throws instead of writing any log at all - a worse version of
        # the very bug this function exists to fix. Caught by
        # cycle-log-preserved.test.ts on its first run, under both hosts.
        [Parameter(Mandatory = $true)][AllowEmptyString()][string[]]$Lines
    )

    $body = $Lines -join "`n"

    # Read BEFORE deciding. A file that cannot be read is treated as though it
    # HAS content, because the alternative is to overwrite something unreadable
    # rather than merely unread - and this whole function exists to stop that.
    $existing = ""
    $unreadable = $false
    if (Test-Path $Path -PathType Leaf) {
        try {
            $existing = [string](Get-Content $Path -Raw -Encoding UTF8)
            if ($null -eq $existing) { $existing = "" }
        } catch {
            $unreadable = $true
        }
    }

    if (-not $unreadable -and [string]::IsNullOrWhiteSpace($existing)) {
        Set-Content -Path $Path -Value $body -Encoding utf8
        return [pscustomobject]@{ Preserved = $false; Bytes = 0 }
    }

    $note = if ($unreadable) {
        "The file already here could not be read, so it was left completely untouched and this record was added after it."
    } else {
        "Everything ABOVE this line was written by the cycle itself, and is kept exactly as the cycle left it. Nothing above was edited, shortened or reordered."
    }

    $preamble = @(
        ""
        ""
        "---"
        ""
        "## The watcher's own record of this cycle"
        ""
        $note
        ""
        "This section is written by ``relay-watch.ps1`` after the cycle's process has"
        "exited. It is the independent half of the record: the cycle above says what it"
        "meant to do, and this says what actually moved on disk, how long it took, and"
        "how the process ended. Where the two disagree, this half is the evidence."
        ""
    ) -join "`n"

    Add-Content -Path $Path -Value ($preamble + $body) -Encoding utf8
    return [pscustomobject]@{ Preserved = $true; Bytes = $existing.Length }
}

# ===========================================================================
# SAY, IN EVERY CYCLE LOG, WHETHER THIS PROCESS IS RUNNING CURRENT CODE.
#
# This is the answer to the question queue row 52 could not answer for ten
# cycles: "the fix is merged, so why is the old behaviour still happening?"
# The answer was always "because the running process never reloaded", and it
# took four cycles of clobbered logs to work that out because NOTHING SAID SO.
#
# Pure on purpose - it takes both hashes as parameters and touches no disk - so
# `relay/stale-watcher-visible.test.ts` can drive every branch, including the
# stale one, which is otherwise reproducible only by editing the script while
# the relay is mid-cycle.
#
# The three outcomes are deliberately NOT two:
#
#   same      -> stamp the version. Quiet, one line, no alarm. The stamp is the
#                point: a reader can compare it with `git log` in one glance.
#   different -> say RESTART REQUIRED in as many words, show BOTH hashes, and
#                state that merged changes are INERT - because "I merged it" is
#                exactly the false conclusion that cost row 52 its ten cycles.
#   unknown   -> say the check could not run. An unreadable hash is NOT a
#                difference, and raising a restart alarm on every failed read
#                is how a real alarm gets ignored.
#
# It cannot make a stale watcher run new code. Nothing can except a restart.
# It makes staleness visible in the artefact Greg already reads.
# ===========================================================================
function Get-StaleWatcherNote {
    param(
        # AllowNull/AllowEmptyString are load-bearing: the whole "unknown" branch
        # exists to be reachable, and a MANDATORY [string] would reject $null
        # before the function could report it. Same trap as Write-CycleLog's
        # -Lines, which threw instead of writing any log at all.
        [Parameter(Mandatory = $true)][AllowNull()][AllowEmptyString()][string]$LoadedHash,
        [Parameter(Mandatory = $true)][AllowNull()][AllowEmptyString()][string]$CurrentHash
    )

    $short = {
        param($h)
        if ([string]::IsNullOrWhiteSpace($h)) { "unknown" } else { $h.Substring(0, [Math]::Min(12, $h.Length)) }
    }

    if ([string]::IsNullOrWhiteSpace($LoadedHash) -or [string]::IsNullOrWhiteSpace($CurrentHash)) {
        return @(
            "Watcher script: the staleness check could not run, so this log cannot say"
            "whether the process is running the current code. (Loaded: $(& $short $LoadedHash); on disk now: $(& $short $CurrentHash).)"
        )
    }

    if ($LoadedHash -eq $CurrentHash) {
        return @(
            "Watcher script: $(& $short $LoadedHash) - the file on disk is identical, so this process is running the current code."
        )
    }

    return @(
        "**RESTART REQUIRED - this watcher is running a STALE copy of its own script.**"
        ""
        "  Loaded at launch: $(& $short $LoadedHash)"
        "  On disk now:      $(& $short $CurrentHash)"
        ""
        "PowerShell reads a script once, at launch, and then runs from memory. Every"
        "change merged to relay-watch.ps1 since this process started is INERT - merging"
        "it again will not help. Stop this watcher and run relay-start.cmd, which clears"
        "HALT and reads the cycle number back out of STATUS.json."
        ""
        "This is queue row 52's defect. It cost about ten cycles precisely because"
        "nothing said this out loud."
    )
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

# ===========================================================================
# TWO ROWS, ONE NUMBER
#
# 2026-08-27, proven against the shipped watcher rather than reasoned about.
# QUEUE.md carried #69 twice: a finished row already stamped DONE 62 at line
# 359, and further down at line 380 the row the picker actually took, still
# TODO. Every writer below walks the file and stops at the FIRST row carrying
# the number, so the write landed on line 359 - overwriting a real, earned
# DONE 62 with DONE 71 - while the row being worked on stayed TODO and would
# have been re-issued for ever. A record destroyed and a loop started, silently,
# by one repeated number.
#
# `relay/queue-file-integrity.test.ts` keeps duplicates out of the committed
# file, and that is worth having, but it only runs in CI. The watcher rewrites
# QUEUE.md locally between cycles, all night, where no test is watching - so the
# guard has to be here, in the code that does the writing.
#
# WHY THIS COUNTS SHAPED ROWS AND NOT PARSED ONES. The hazard is "two rows in
# this file claim to be number N", and that is true whether or not either of
# them has a status the parser recognises. Shape is the superset: anything
# Get-QueueRowMatch matches, this matches too. So one count serves both writers.
#
# WHY IT REFUSES RATHER THAN PICKING ONE. It cannot know which row is meant -
# that IS the fault - and this file's standing rule is that a row it cannot
# resolve is a row it will not touch. Refusing is strictly better than today:
# every caller already handles a false return by logging that it could not
# update the row, so the failure becomes loud instead of destroying a record.
# ===========================================================================
function Get-QueueRowNumberLineIndexes($lines, $number) {
    $hits = New-Object System.Collections.Generic.List[int]
    for ($i = 0; $i -lt $lines.Count; $i++) {
        $shape = [regex]::Match([string]$lines[$i], $QueueRowShapePattern)
        if (-not $shape.Success) { continue }
        # Compared as whole trimmed strings, never as a substring: rows 7, 17 and
        # 70 are three different rows, and a guard that confused them would stop
        # the relay on an ordinary queue - a worse fault than the one being fixed.
        if ($shape.Groups[1].Value.Trim() -ne "$number") { continue }
        $hits.Add($i)
    }
    # A plain array, deliberately NOT comma-wrapped. Comma-wrapping hands the
    # List back as ONE object, so the caller's @() sees a single element and the
    # count is always 1 - the guard would have loaded green and never fired,
    # which is this repository's house defect. Every caller wraps in @() so that
    # zero hits arrive as an empty array rather than $null on PowerShell 5.1.
    return $hits.ToArray()
}

# The human-readable line numbers, for a message a person has to act on.
function Format-QueueRowLineNumbers($indexes) {
    return (($indexes | ForEach-Object { $_ + 1 }) -join ', ')
}

# ===========================================================================
# THE SEVENTH WORD
#
# 2026-08-28. It cost seventy minutes with eleven jobs behind it. Cycle 59
# built, merged and DEPLOYED half of row 40 - genuinely good work, verified by
# commit hash - and then wrote its status as "PARTLY DONE 59". Two words; one of
# them is not one of the six the parser knows. The row stopped parsing, the
# picker met it first, and the relay took nothing at all until a human fixed one
# word by hand. Row 38 had done the same the day before with "SUPERSEDED".
#
# Refusing to GUESS at an unreadable row is correct and it stays. What follows is
# a much narrower permission: the relay may repair the ONE row it set to
# "IN PROGRESS <this cycle>" ITSELF, because it knows precisely which row that
# was and it knows a cycle has just written to it.
#
# It interprets NOTHING. Every character the cycle wrote is kept, in order, after
# the marker. All the relay does is put a readable status word in FRONT and give
# the row back as TODO. TODO is the fail-safe reading: in the worst case the next
# cycle reads "already shipped and live" in the preserved text and closes the row
# in two minutes. A stall costs hours; a redundant cycle costs one.
# ===========================================================================
$QueueRepairMarker   = '[relay repaired the status word]'
$script:LastTakenRow = $null

# $Path is a parameter, defaulting to the real queue, ONLY so the self-test can
# point the parser at a fixture. The loop never passes it. A parser that can only
# be run against the live file is a parser that never gets tested until the night
# it matters, which is how the malformed row of 2026-08-26 reached production.
function Get-QueueRows([string]$Path = $QueueFile) {
    if (-not (Test-Path $Path)) { return @() }
    $rows = New-Object System.Collections.Generic.List[object]
    # -Encoding UTF8 is NOT decoration. Windows PowerShell 5.1 - the host
    # relay-start.cmd actually uses - defaults Get-Content to the system ANSI
    # codepage, so a UTF-8 file comes back as cp1252 gibberish. Paired with the
    # Set-Content in Set-QueueRowStatus, which writes UTF-8, that is a
    # read-as-1252 / write-as-UTF-8 round trip over the WHOLE queue on EVERY
    # status update, and it adds one more layer of corruption per cycle, for
    # ever. It is why the heading of QUEUE.md now reads "queue a EUR ..." where
    # an em dash used to be. Do not remove it.
    $lines = Get-Content $Path -Encoding UTF8
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
    # See Get-QueueRows. This is the write half of the same round trip, and the
    # more damaging half, because this one rewrites the file.
    $lines = Get-Content $QueueFile -Encoding UTF8

    # COUNT BEFORE WRITING. See "TWO ROWS, ONE NUMBER" above. This is the same
    # licence as the refusal below - a row this function cannot resolve is a row
    # it refuses to touch - applied one step earlier, to a row it cannot even
    # identify.
    $claimants = @(Get-QueueRowNumberLineIndexes $lines $number)
    if ($claimants.Count -gt 1) {
        Write-Line "REFUSED to set row #$number to '$newStatus': $($claimants.Count) rows in QUEUE.md carry that number, on lines $(Format-QueueRowLineNumbers $claimants). The relay cannot tell which one it is working on, so it changed NEITHER. Give one of them a number of its own."
        return $false
    }

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

# See "THE SEVENTH WORD" above. Set-QueueRowStatus deliberately refuses to touch
# a row it cannot parse; this is the one exception, and it is why it is a
# separate function rather than a flag on that one.
function Repair-UnreadableQueueRow($number, $cycle) {
    $lines = Get-Content $QueueFile -Encoding UTF8

    # The identical guard, because this is the identical hazard in the one
    # function permitted to rewrite a row the parser cannot read - and here it
    # is worse. This walks the file for the first UNREADABLE row carrying the
    # number, so with a duplicate it would rewrite a record a human had parked
    # by hand and leave the cycle's own row still unreadable: a record destroyed
    # AND the queue still stopped. See "TWO ROWS, ONE NUMBER" above.
    $claimants = @(Get-QueueRowNumberLineIndexes $lines $number)
    if ($claimants.Count -gt 1) {
        return [pscustomobject]@{
            Repaired  = $false
            Duplicate = $true
            Count     = $claimants.Count
            Lines     = (Format-QueueRowLineNumbers $claimants)
        }
    }

    for ($i = 0; $i -lt $lines.Count; $i++) {
        $line = [string]$lines[$i]
        if ((Get-QueueRowMatch $line).Success) { continue }
        $shape = [regex]::Match($line, $QueueRowShapePattern)
        if (-not $shape.Success) { continue }
        if ($shape.Groups[1].Value.Trim() -ne "$number") { continue }

        # The status cell of a shaped row is everything after the LAST " | ".
        # Same anchor the reader uses, so an inner pipe in the item text cannot
        # move it. If the line does not have that shape, nothing is touched.
        $trimmed = $line.TrimEnd()
        if (-not $trimmed.EndsWith('|')) { return $null }
        $body = $trimmed.Substring(0, $trimmed.Length - 1)
        $cut  = $body.LastIndexOf(' | ')
        if ($cut -lt 0) { return $null }
        $head = $body.Substring(0, $cut + 2)
        $cell = $body.Substring($cut + 3).Trim()
        if ($cell.Length -eq 0) { return $null }

        # Bounded on purpose. A row already carrying two repairs is not repaired
        # a third time - at that point the LOOP is the fault, and that is Greg's
        # to see rather than the relay's to paper over.
        $prior = ([regex]::Matches($cell, [regex]::Escape($QueueRepairMarker))).Count
        if ($prior -ge 2) {
            return [pscustomobject]@{ Repaired = $false; Duplicate = $false; Cell = $cell; Prior = $prior }
        }

        $new = "TODO $QueueRepairMarker - cycle $cycle wrote a status word this queue does not have, so the relay put a readable one in front of it and gave the row back. Not one character of the cycle's own wording was changed; it follows here in full. >>> $cell"
        $lines[$i] = $head + ' ' + $new + ' |'
        Set-Content -Path $QueueFile -Value $lines -Encoding utf8
        return [pscustomobject]@{ Repaired = $true; Duplicate = $false; Cell = $cell; Prior = $prior }
    }
    return $null
}

# ===========================================================================
# AN ORPHAN REOPEN THAT KNOWS THE WORK MIGHT ALREADY BE ON MAIN
#
# Row 103. Observed 30 August: cycle 125 finished row 101 in full and its PR
# merged as #420 (`26559fd`), but the 45-minute kill fired before it could
# write `DONE 125` into the status cell. Both reopen paths below - the startup
# one and the mid-run timeout one - wrote a bare "TODO (reopened...)", which
# told cycle 126 nothing about the work already on `main`. A human caught it
# by hand and amended the brief; cycle 126 then closed the row correctly
# without redoing anything. That catch will not happen when nobody is
# watching.
#
# THE ORPHAN REOPEN IS RIGHT. A stranded row must go back to something the
# picker will take, or it is skipped for ever, silently. The bug is that it
# reopens BLIND. What the watcher already knows at that moment is the cycle
# number and the row number - and this repository's own commit history shows
# every row's landing commit names its row directly, either because the
# branch-naming convention (`fix/reply-matcher-plus-alias-row100`,
# `feat/ai-processor-coverage-gate-row101`) surfaces into the merge subject, or
# because the commit message says so outright ("row 101 - verify and close
# CR-10 engineering half"). A hit here does NOT mean the row is done - only a
# person or the next cycle can judge whether the merged work satisfies the
# brief - so this deliberately never writes DONE. It only decides which
# WARNING a reopened row carries.
#
# Split into a pure matcher (Test-RowNumberMergedInLog) and an I/O wrapper
# (Test-RowMergedOnMain) for the same reason Get-EvidenceVerdict is split from
# Get-RepoEvidence above: relay-selftest.ps1 can drive the matching logic
# directly, against fixed log text, without a live git repository.
# ===========================================================================
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

# The one decision both reopen paths make. $ReasonSuffix is the reopen note
# they already wrote before this fix existed, kept byte for byte either way -
# this only decides what goes in FRONT of it. The status text is the exact
# form the queue item asked for, so a reader scanning QUEUE.md sees the
# warning before anything else.
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

# ===========================================================================
# A DONE THAT NEVER MERGED IS THE MIRROR IMAGE OF THE ORPHAN REOPEN ABOVE
#
# Row 121. Cycle 148 wrote `DONE 148` into row 117's status cell, describing a
# full passing spec, while the closing section of its own log said it was
# blocked and could not commit - the stale `.git/index.lock` row 120 exists to
# fix. Both sentences sat in the same file. `origin/main` never moved and the
# branch it created was zero commits ahead. Only a human reading git caught
# it.
#
# Test-RowMergedOnMain already answers "does main's history mention this row
# number" - built for row 103 to decide what WARNING a reopened row carries.
# This reuses it unchanged for the opposite question: a row the cycle itself
# just closed DONE is allowed to stay that way only if main backs it up.
#
# NOT EVERY DONE ROW PROMISED A MERGE. A measurement or an artefact-only row
# can close DONE correctly having produced nothing origin/main did not already
# carry - row 118 is exactly this shape ("if it is (b), that is a complete
# answer"). So this keys on the row's OWN brief (its "DEFINITION OF DONE"
# clause), never on the cycle's account of itself - trusting a cycle's own
# narrative is the exact failure this check exists to catch. A row whose brief
# never demanded a merge is never made to produce one.
#
# Split the same way as Test-RowMergedOnMain / Get-OrphanReopenStatus above:
# a pure text scan (Test-RowDefinitionOfDoneDemandsMerge) and a pure decision
# (Get-DoneWithoutMergeStatus), so relay-selftest.ps1 can drive both directly
# against fixed text, without a live git repository.
# ===========================================================================
function Test-RowDefinitionOfDoneDemandsMerge([string]$ItemText) {
    # No brief text to read is the conservative default: assume a merge WAS
    # promised, because that is true of nearly every row in this queue, and a
    # false "no merge needed" here is the dangerous direction - it would wave
    # a real DONE-without-merge defect through unexamined.
    if ([string]::IsNullOrWhiteSpace($ItemText)) { return $true }

    $marker = 'DEFINITION OF DONE'
    $idx    = $ItemText.IndexOf($marker, [System.StringComparison]::OrdinalIgnoreCase)
    $clause = if ($idx -ge 0) { $ItemText.Substring($idx) } else { $ItemText }

    # Phrases this queue's own authors already use, verbatim, when a row's
    # brief allows it to close without a code merge - "that is a complete
    # answer" (rows 92, 104, 118), "if the honest answer is" (row 114), and the
    # two ways a resolved investigation says nothing was needed. Narrow and
    # literal on purpose: a false "yes it demands a merge" here only costs a
    # PARTIAL that the next cycle re-verifies in seconds, but a false "no
    # merge needed" hides the exact defect row 121 exists to catch.
    $escapePhrases = @(
        'that is a complete answer',
        'that is a complete and valuable outcome',
        'if the honest answer is',
        'no code change',
        'no source code changed',
        'artefact-only',
        'artefact only',
        'measurement only'
    )
    foreach ($phrase in $escapePhrases) {
        if ($clause -match [regex]::Escape($phrase)) { return $false }
    }
    return $true
}

# The mid-run mirror of the "why is this row still IN PROGRESS" text, and the
# list of rows it applies to - pulled out of the main loop so relay-selftest.ps1
# can drive it directly against a fixture row list and a fixed outcome string,
# without a live git repository or an actual cycle run. $MergeCheck is
# injected for the same reason: the real call site passes Test-RowMergedOnMain,
# a test passes a scriptblock over fixed text.
function Get-StrandedRowActions {
    param(
        [Parameter(Mandatory = $true)][array]$QueueRows,
        [Parameter(Mandatory = $true)][string]$CycleNumber,
        [Parameter(Mandatory = $true)][string]$Outcome,
        [Parameter(Mandatory = $true)][int]$CycleTimeoutMinutes,
        [Parameter(Mandatory = $true)][scriptblock]$MergeCheck
    )
    $stranded = @($QueueRows) | Where-Object {
        $_.Parsed -and $_.Status -match "^IN PROGRESS\s+$CycleNumber\b"
    }
    $actions = New-Object System.Collections.Generic.List[object]
    foreach ($row in $stranded) {
        # ROW 121: this used to gate on $Outcome being one of the three ways
        # the WATCHER can tell a cycle went wrong (timed-out / failed / failed
        # to run). Cycle 150 ended CLEANLY - exit code 0, outcome "finished" -
        # having simply run out of time waiting on a rebuild and never gotten
        # round to writing its own row's status word. A clean exit was never a
        # reason to look, so row 117 sat "IN PROGRESS 150" while the watcher
        # kept running, and cycle 151 stepped straight past it - invisible for
        # good, since the picker only self-queues TODO and PARTIAL. The real
        # invariant has nothing to do with WHY the process ended: this
        # function is only ever called after Invoke-CycleAgent has already
        # returned, so by construction nothing is holding the row any more -
        # every outcome value reaches here, unconditionally.
        $why = if ($Outcome -eq "timed-out") { "was killed at the $CycleTimeoutMinutes minute deadline" }
               elseif ($Outcome -eq "failed to run") { "never started" }
               elseif ($Outcome -eq "failed") { "ended badly" }
               else { "ended (outcome: $Outcome) without writing a status word for its own row" }
        # See "AN ORPHAN REOPEN THAT KNOWS THE WORK MIGHT ALREADY BE ON
        # MAIN" above this cycle's own row 103 fix. This is the exact case
        # that cost cycle 126 a manual rescue: cycle 125 finished row 101
        # and its PR merged, but the 45-minute kill fired first.
        $mergedOnMain = & $MergeCheck $row.Number
        $newStatus = Get-OrphanReopenStatus -CycleNumber $CycleNumber `
            -ReasonSuffix "reopened - cycle $CycleNumber $why and did not finish this" `
            -MergedOnMain $mergedOnMain
        $actions.Add([pscustomobject]@{
            RowNumber    = $row.Number
            NewStatus    = $newStatus
            MergedOnMain = $mergedOnMain
        })
    }
    return $actions
}

function Get-DoneWithoutMergeStatus {
    param(
        [Parameter(Mandatory = $true)][string]$CurrentStatus,
        [Parameter(Mandatory = $true)][bool]$DemandsMerge,
        [Parameter(Mandatory = $true)][bool]$MergedOnMain,
        [Parameter(Mandatory = $true)][string]$RowNumber,
        [Parameter(Mandatory = $true)][string]$CycleNumber
    )
    # Left alone: either the row never promised a merge, or one was found.
    if (-not $DemandsMerge -or $MergedOnMain) { return $CurrentStatus }

    return "PARTIAL $CycleNumber - closed DONE but no commit naming row $RowNumber was found on main, so it is rewritten to PARTIAL rather than trusted - VERIFY before redoing. Original: $CurrentStatus"
}

# ===========================================================================
# A DONE WHOSE OWN BRIEF NEVER DEMANDED A MERGE CAN STILL BE SITTING ON A
# PUSHED, UNMERGED BRANCH - ROW 121's GUARD STANDS DOWN FOR EXACTLY THIS CASE
#
# Row 122. Cycle 154 committed and pushed the Tuesday readiness verdict as
# `c031769` (PR #451), wrote `DONE 154` into row 114, and ended saying it was
# waiting on CI and would merge once green. Nothing survived the cycle to do
# that. Row 114's own "DEFINITION OF DONE" asks for a dated artefact, not a
# merge commit hash - so Test-RowDefinitionOfDoneDemandsMerge correctly
# returns $false for it, and Get-DoneWithoutMergeStatus above correctly never
# fires. That carve-out is right: an artefact-only row that produced no code
# change must not be forced to manufacture a merge. But row 114 was NOT that
# case - it had real committed, pushed work sitting on a branch, unmerged. The
# demands-a-merge question and the is-there-unmerged-work-on-a-branch question
# are different questions, and only one of them was being asked.
#
# This does not replace Get-DoneWithoutMergeStatus - it runs FIRST, beside it,
# and only acts when it finds a pushed branch actually mentioning this row
# number ahead of origin/main. An artefact-only row with no pushed branch at
# all (the case the carve-out exists for) finds nothing here either, and falls
# through to the existing check unchanged.
#
# Split the same way as Test-RowMergedOnMain / Get-DoneWithoutMergeStatus
# above: an I/O wrapper that walks real remote branches
# (Find-UnmergedPushedBranchForRow) and a pure decision
# (Get-DoneWithUnmergedBranchStatus) that relay-selftest.ps1 can drive
# directly against a fixed branch name, without a live git repository.
# ===========================================================================
# ===========================================================================
# ROW 138: "AHEAD OF MAIN BY ANCESTRY" IS THE WRONG QUESTION IN A REPO THAT
# SQUASH-MERGES EVERY PR
#
# `git log origin/main..branch` answers "does main already contain this
# branch's own commit objects". A squash merge writes a BRAND NEW commit onto
# main whose diff equals the branch's diff but whose hash, parent and commit
# message are all different from anything the branch ever pushed - so that
# question stays "no" forever, for every branch this repo ever merges. Row
# 138 lived this for nine straight cycles: the real work merged once (cycle
# 169, commit 5fe6cd3), and every cycle after it re-verified that, closed the
# row, pushed a fresh branch, and had this exact ancestry check call the new
# branch "unmerged" - because by ancestry, it always is.
#
# The question that actually matters is "is this branch's CONTENT already on
# main", and `git patch-id` answers it directly: two diffs that produce the
# same effective change hash to the same patch-id regardless of which commits
# carried them. A squash merge is, by definition, one commit on main whose
# diff is exactly the union of the branch's own diffs since it forked - so
# comparing the patch-id of the branch's WHOLE diff (merge-base..tip) against
# the patch-id of every individual commit main has gained since that same
# fork point catches a squash merge of any number of commits, not just a
# single-commit branch. See relay-selftest.ps1 section 13 for the proof,
# including the branch shape (two commits, squashed to one) several of the
# real row-138-cycle-*-close branches actually had.
# ===========================================================================
function Get-DiffPatchId {
    param(
        [Parameter(Mandatory = $true)][string]$RepoPath,
        [Parameter(Mandatory = $true)][string]$FromRef,
        [Parameter(Mandatory = $true)][string]$ToRef
    )
    $previous = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try {
        $diffText = (& git -C $RepoPath diff $FromRef $ToRef 2>$null | Out-String)
        if ([string]::IsNullOrWhiteSpace($diffText)) { return $null }
        $patchIdLine = ($diffText | & git -C $RepoPath patch-id --stable 2>$null | Out-String)
        if ([string]::IsNullOrWhiteSpace($patchIdLine)) { return $null }
        return ($patchIdLine.Trim() -split '\s+')[0]
    } catch {
        return $null
    } finally {
        $ErrorActionPreference = $previous
    }
}

function Test-BranchSquashMergedIntoMain {
    param(
        [Parameter(Mandatory = $true)][string]$Branch,
        [string]$RepoPath = $RepoRoot,
        [string]$MainRef = "origin/main"
    )
    $previous = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try {
        $mergeBase = (& git -C $RepoPath merge-base $MainRef $Branch 2>$null | Out-String).Trim()
        if ([string]::IsNullOrWhiteSpace($mergeBase)) { return $false }

        $branchPatchId = Get-DiffPatchId -RepoPath $RepoPath -FromRef $mergeBase -ToRef $Branch
        # No diff at all (the branch never changed anything beyond its fork
        # point) is not the squash-merge case this exists to catch - it is
        # left for the plain ancestry check above to sort out either way.
        if ([string]::IsNullOrWhiteSpace($branchPatchId)) { return $false }

        $mainCommits = @(& git -C $RepoPath rev-list "$mergeBase..$MainRef" 2>$null)
        foreach ($commit in $mainCommits) {
            $commit = ([string]$commit).Trim()
            if (-not $commit) { continue }
            $commitPatchId = Get-DiffPatchId -RepoPath $RepoPath -FromRef "$commit^" -ToRef $commit
            if ($commitPatchId -and $commitPatchId -eq $branchPatchId) { return $true }
        }
        return $false
    } catch {
        return $false
    } finally {
        $ErrorActionPreference = $previous
    }
}

function Find-UnmergedPushedBranchForRow {
    param(
        [Parameter(Mandatory = $true)][string]$RowNumber,
        [string]$RepoPath = $RepoRoot
    )
    $previous = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try {
        & git -C $RepoPath fetch origin --prune *> $null 2>&1
        $branchList = @(& git -C $RepoPath for-each-ref --format="%(refname:short)" refs/remotes/origin 2>$null)
    } catch {
        $branchList = @()
    } finally {
        $ErrorActionPreference = $previous
    }

    foreach ($branch in $branchList) {
        $branch = ([string]$branch).Trim()
        if (-not $branch) { continue }
        if ($branch -eq "origin/main" -or $branch -eq "origin/HEAD") { continue }

        $previous = $ErrorActionPreference
        $ErrorActionPreference = "Continue"
        try {
            $ahead = (& git -C $RepoPath log --oneline "origin/main..$branch" 2>$null | Out-String)
        } catch {
            $ahead = ""
        } finally {
            $ErrorActionPreference = $previous
        }
        # Nothing ahead of main on this branch - not the case this row exists
        # to catch, whether or not its name happens to mention the row.
        if ([string]::IsNullOrWhiteSpace($ahead)) { continue }

        $shortName = $branch -replace '^origin/', ''

        # ROW 138: ahead by ancestry is not the same as unmerged in a repo
        # that squash-merges - see the block comment above. A branch whose
        # whole diff already landed on main under a different commit hash is
        # treated exactly like the plain-merge case just above: not found.
        if (Test-BranchSquashMergedIntoMain -Branch $branch -RepoPath $RepoPath) { continue }

        # Checks both the branch NAME (this repo's own convention stamps the
        # row number into it, e.g. `fix/row127-queue-bom`) and its commit
        # subjects (e.g. "row 101 - verify and close CR-10"), reusing the same
        # anchored matcher row 103's orphan-reopen check already relies on so
        # "row 100" can never match while testing for row 10 or row 1001.
        if (Test-RowNumberMergedInLog "$shortName`n$ahead" $RowNumber) {
            return $shortName
        }
    }
    return $null
}

# ===========================================================================
# ROW 138: A GUARD THAT CAN LOOP FOREVER IS WORSE THAN NO GUARD
#
# The patch-id fix above closes the specific hole that caused nine straight
# reopens. It is deliberately NOT trusted to be the last hole this guard will
# ever find - a branch rebased mid-flight, a squash that also picked up an
# unrelated commit, a merge-base git cannot compute cleanly, and this would
# loop again exactly as row 138 did. So this backstop is independent of
# WHY the merge check thinks a branch is unmerged: it only counts how many
# times in a row this guard has already reopened THIS row, and once that
# reaches two, the third attempt is refused - the row is left DONE with a
# plain note instead of being handed back to the queue again.
#
# Counting has to survive across cycles, which run as separate processes, so
# it is persisted to a small JSON file beside QUEUE.md rather than kept in
# memory - the same "write to disk, let the next cycle's commit pick it up"
# pattern QUEUE.md itself already relies on (see the note near the top of
# QUEUE.md about uncommitted watcher writes).
# ===========================================================================
$RowReopenCountsFile = Join-Path $RepoRoot ".bidlow/relay/row-reopen-counts.json"

function Get-RowReopenCounts {
    param([string]$Path = $RowReopenCountsFile)
    $counts = @{}
    if (-not (Test-Path $Path)) { return $counts }
    try {
        $raw = Get-Content -Path $Path -Raw -ErrorAction Stop
        if ([string]::IsNullOrWhiteSpace($raw)) { return $counts }
        $parsed = $raw | ConvertFrom-Json -ErrorAction Stop
        if ($parsed) {
            foreach ($prop in $parsed.PSObject.Properties) {
                $counts[$prop.Name] = [int]$prop.Value
            }
        }
    } catch {
        # An unreadable or corrupt counts file is treated as "no history yet"
        # - the safe direction, since it only costs one extra reopen, never a
        # false loop-breaker firing on a row that was never actually looping.
        return @{}
    }
    return $counts
}

function Set-RowReopenCounts {
    param(
        [Parameter(Mandatory = $true)][hashtable]$Counts,
        [string]$Path = $RowReopenCountsFile
    )
    try {
        $dir = Split-Path -Parent $Path
        if ($dir -and -not (Test-Path $dir)) {
            New-Item -ItemType Directory -Path $dir -Force | Out-Null
        }
        ($Counts | ConvertTo-Json -Compress) | Set-Content -Path $Path -Encoding utf8
    } catch {
        # Best-effort persistence only - a write failure here must never
        # crash the watcher loop. Worst case, the count resets to zero and
        # this row gets two more free reopens before the breaker notices.
    }
}

function Get-DoneWithUnmergedBranchStatus {
    param(
        [Parameter(Mandatory = $true)][string]$CurrentStatus,
        [Parameter(Mandatory = $true)][string]$RowNumber,
        [Parameter(Mandatory = $true)][string]$CycleNumber,
        [AllowNull()][string]$UnmergedBranch,
        [int]$PriorReopenCount = 0
    )
    # Left alone: no pushed branch was found naming this row ahead of main -
    # either there genuinely is none (the artefact-only case row 121's
    # carve-out protects), or the branch already merged (plain or squash) and
    # disappeared from the ancestry gap.
    if ([string]::IsNullOrWhiteSpace($UnmergedBranch)) { return $CurrentStatus }

    # THE LOOP BREAKER. This guard has already reopened this exact row twice
    # over an "unmerged" branch and it is still finding one - reopening a
    # third time repeats row 138's loop rather than fixing it. Give up
    # instead: leave the row DONE, say why in plain words, and name the
    # branch so a person has somewhere to look.
    if ($PriorReopenCount -ge 2) {
        return "DONE $CycleNumber - LOOP BREAKER: the unmerged-branch guard has already reopened row $RowNumber $PriorReopenCount time(s) without the branch it points at ever going away (most recently '$UnmergedBranch'), so rather than reopen it again and risk looping forever, the guard is giving up and leaving this row closed. A person should check whether '$UnmergedBranch' (and any sibling branches naming this row) genuinely still needs merging, or is safe to delete. Original: $CurrentStatus"
    }

    return "PARTIAL $CycleNumber - closed DONE but branch '$UnmergedBranch' is pushed ahead of origin/main and was never merged, so it is rewritten to PARTIAL - the next cycle should finish the merge, not redo the work. Original: $CurrentStatus"
}

# ===========================================================================
# A FINDING THAT EXISTS ONLY IN A CYCLE LOG IS A FINDING NOBODY WILL READ
#
# Cycle 53 made the cycle logs TRACKED, which closed the half of this problem
# where a log could be deleted by a rebase or a `git clean -fd`. It deliberately
# did not claim to fix the other half, and the other half is the expensive one.
#
# The proof that it is real and separate: `cycle-050.md` was NEVER deleted. It
# has been on disk, readable, the whole time. Cycle 52 still spent its entire
# reconnaissance re-deriving the finding inside it, because nothing downstream
# reads fifty old logs. Durability was never the binding constraint; ATTENTION
# was. The one channel every cycle actually reads is QUEUE.md.
#
# Twice, a cycle said out loud that it owed the queue a row and then exited
# without writing one:
#
#   * cycle 50, under a heading called "Separate finding - not this item":
#     "I'm queueing it as a new row rather than folding it into this cycle."
#     No row was ever added. Cycle 52 paid for it.
#   * cycle 52: "Two things for you rather than for me:" - one of which was this
#     very observation. No row was added for either.
#
# WHY THIS IS NOT A RULE IN THE BRIEF. Both cycles already intended to do it.
# Telling the next one again is the mechanism that has now failed twice. So the
# check happens HERE, after the agent's process has exited, where no promise is
# involved - the same reason the orphaned-IN-PROGRESS reopen was moved out of
# QUEUE.md and into code.
#
# WHY "DID QUEUE.md CHANGE" IS THE WRONG TEST, ALTHOUGH IT IS THE OBVIOUS ONE.
# It would have caught NEITHER case. Both cycles wrote to QUEUE.md - each
# stamped its own row DONE on the way out. What neither did was add a NEW row.
# So the signal is the set of row NUMBERS before and after the cycle.
#
# WHAT IT DOES WHEN IT FIRES, AND WHY THAT IS NOT "INVENTING". The relay copies
# the cycle's own sentences into a new TODO row, verbatim, and interprets
# nothing - exactly the licence Repair-UnreadableQueueRow already operates under.
# A note file would not have worked: nobody reads those either, which is the
# whole finding.
#
# THE COST OF CRYING WOLF IS TAKEN SERIOUSLY. Measured over all 78 real cycle
# logs when this was written, the patterns below match FIVE of them. The brief is
# cut out of the log first, because cycle 72's brief - written by a human -
# contains the words "that is a separate finding", and a gate that fires on its
# own instructions is noise on night one. `relay/unmirrored-finding.test.ts`
# holds that rate to a measured ceiling AND a floor.
# ===========================================================================

# The three headings that divide a cycle log. The watcher writes all three, so
# they are stable, and they are what makes "the cycle's own words" separable from
# "the brief the cycle was handed".
$CycleLogWatcherRecordHeading = "## The watcher's own record of this cycle"
$CycleLogBriefHeading         = "## What it was asked to do"
$CycleLogAgentHeading         = "## What it did"

# Deliberately NARROW. Every one of these is a phrase a cycle uses to say "this
# is for somebody else", not merely a phrase that mentions the queue - a cycle
# log talks about rows and statuses constantly, and matching on that vocabulary
# would fire on all 78 logs and be switched off within a week.
$CycleHandoffPatterns = @(
    '\b(?:queue|queuing|queueing|queued)\b[^.\r\n]{0,60}\bnew row\b',
    '\bnew queue row\b',
    '\b(?:write|writing|wrote|add|adding|added|needs|worth)\b[^.\r\n]{0,40}\bqueue rows?\b',
    '\b(?:queueing|queuing) it\b',
    '\bseparate finding\b',
    '\bnot this item\b',
    '\bfor you rather than for me\b',
    '\bfor (?:a|the) (?:later|next|future) cycle\b',
    '\bnext cycle should\b'
)

# The cycle's own words, with the brief and the watcher's own record removed.
#
# A cycle log comes in two shapes and this handles both. Either the agent wrote
# its own log and the watcher appended underneath it, or the agent wrote nothing
# and the watcher's record is the whole file. In both, the agent's stdout sits
# after the LAST "## What it did", and the brief sits between the two headings.
function Get-CycleOwnWords([string]$LogText) {
    if ([string]::IsNullOrEmpty($LogText)) { return "" }

    # Everything before the FIRST of the two watcher-written headings is the
    # agent's own log file, if it wrote one.
    $cut = -1
    foreach ($marker in @($CycleLogWatcherRecordHeading, $CycleLogBriefHeading)) {
        $at = $LogText.IndexOf($marker, [System.StringComparison]::Ordinal)
        if ($at -ge 0 -and ($cut -lt 0 -or $at -lt $cut)) { $cut = $at }
    }
    $head = if ($cut -ge 0) { $LogText.Substring(0, $cut) } else { $LogText }

    # LAST, not first: in the two-shape case the watcher's appended record
    # carries its own copy of both headings, and the agent's stdout follows the
    # later one.
    $last = $LogText.LastIndexOf($CycleLogAgentHeading, [System.StringComparison]::Ordinal)
    $tail = if ($last -ge 0) { $LogText.Substring($last + $CycleLogAgentHeading.Length) } else { "" }

    return ($head + "`n" + $tail)
}

# The lines - whole lines, so the sentence survives - in which a cycle handed
# something on. Capped at six: the row exists to carry the finding to a reader,
# not to reproduce the log inside the queue.
function Get-CycleHandoffPassages([string]$LogText) {
    $found = New-Object System.Collections.Generic.List[string]
    $own   = Get-CycleOwnWords $LogText
    if ([string]::IsNullOrWhiteSpace($own)) { return $found.ToArray() }

    foreach ($rawLine in ($own -split "`r?`n")) {
        $line = ([string]$rawLine).Trim()
        if ($line.Length -eq 0) { continue }
        foreach ($pattern in $CycleHandoffPatterns) {
            if ([regex]::IsMatch($line, $pattern, [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)) {
                $clean = ($line -replace '\s+', ' ').Trim()
                if (-not $found.Contains($clean)) { $found.Add($clean) }
                break
            }
        }
        if ($found.Count -ge 6) { break }
    }
    # NO comma operator here, and that is not a style choice. `return ,$array`
    # was the first version, added out of habit to stop PowerShell unrolling a
    # single result. It made an EMPTY result come back as a one-element array
    # CONTAINING the empty array, so `@(Get-CycleHandoffPassages $x).Count` was 1
    # for every log ever written and the detector fired on all 78 of them. The
    # sweep test in relay/unmirrored-finding.test.ts caught it on its first run,
    # which is the entire argument for holding the fire-rate to a measured
    # ceiling rather than to an opinion.
    return $found.ToArray()
}

# Pure decision, so it can be driven from a test with any pair of row-number
# sets rather than by running a real cycle and hoping.
function Get-UnmirroredFindingVerdict {
    param(
        [Parameter(Mandatory = $true)][AllowEmptyString()][string]$LogText,
        [AllowEmptyCollection()][string[]]$RowNumbersBefore = @(),
        [AllowEmptyCollection()][string[]]$RowNumbersAfter  = @()
    )

    $passages = @(Get-CycleHandoffPassages $LogText)

    $before = @{}
    foreach ($n in $RowNumbersBefore) { $before["$n"] = $true }

    $newRows = New-Object System.Collections.Generic.List[string]
    foreach ($n in $RowNumbersAfter) {
        if (-not $before.ContainsKey("$n")) { $newRows.Add("$n") }
    }

    $reason = if ($passages.Count -eq 0) {
        "the cycle's own words name nothing it was handing on, so there is nothing to carry"
    } elseif ($newRows.Count -gt 0) {
        "the cycle handed something on AND added row(s) " + ($newRows -join ", ") + ", so it mirrored the finding itself"
    } else {
        "the cycle handed something on in its log and added no queue row, so the finding would exist only in the log"
    }

    return [pscustomobject]@{
        ShouldRecord = (($passages.Count -gt 0) -and ($newRows.Count -eq 0))
        Passages     = $passages
        NewRows      = $newRows.ToArray()
        Reason       = $reason
    }
}

# Copy the cycle's own sentences into QUEUE.md as a new TODO row.
#
# WHERE THE ROW GOES IS NOT COSMETIC. Invoke-SelfQueue takes the first row in
# FILE ORDER that is not DONE and not IN PROGRESS, and IDLES when that row is
# BLOCKED - it does not skip past it, because the order is the plan. So a row
# appended below a BLOCKED row at the bottom of the table would be buried behind
# a permanent stop. It goes immediately ABOVE the first BLOCKED or WONTFIX row
# instead, which is also what `relay/queue-file-integrity.test.ts` requires.
#
# $Path defaults to the live queue and is a parameter only so a test can point it
# at a fixture, exactly as Get-QueueRows does.
function Add-QueueRowForHandoff {
    param(
        [Parameter(Mandatory = $true)][int]$Cycle,
        [Parameter(Mandatory = $true)][AllowEmptyCollection()][string[]]$Passages,
        [Parameter(Mandatory = $true)][string]$LogPath,
        [string]$Path = $QueueFile,
        [int]$MaxQuotedChars = 800
    )

    if (-not (Test-Path $Path)) {
        return [pscustomobject]@{
            Added  = $false
            Number = $null
            Reason = "QUEUE.md is not where the relay expected it ($Path), so nothing was written."
        }
    }

    $lines = @(Get-Content $Path -Encoding UTF8)

    $tableIndexes = New-Object System.Collections.Generic.List[int]
    $numbers      = New-Object System.Collections.Generic.List[int]
    $firstHalt    = -1

    for ($i = 0; $i -lt $lines.Count; $i++) {
        $line = [string]$lines[$i]
        $parsedNumber = 0

        $m = Get-QueueRowMatch $line
        if ($m.Success) {
            $tableIndexes.Add($i)
            if ([int]::TryParse($m.Groups[2].Value.Trim(), [ref]$parsedNumber)) { $numbers.Add($parsedNumber) }
            if ($firstHalt -lt 0 -and $m.Groups[5].Value.Trim() -match '^(?:\*{1,2}|_{1,2})?\s*(?:BLOCKED|WONTFIX)') {
                $firstHalt = $i
            }
            continue
        }

        # A row the parser cannot read is still a row, and still part of the
        # table. Dropping it here would let the new row land in the middle of the
        # table's line range and break the one-contiguous-table guarantee.
        $shape = [regex]::Match($line, $QueueRowShapePattern)
        if ($shape.Success) {
            $tableIndexes.Add($i)
            if ([int]::TryParse($shape.Groups[1].Value.Trim(), [ref]$parsedNumber)) { $numbers.Add($parsedNumber) }
        }
    }

    if ($tableIndexes.Count -eq 0 -or $numbers.Count -eq 0) {
        return [pscustomobject]@{
            Added  = $false
            Number = $null
            Reason = "QUEUE.md has no numbered rows to anchor to, so the relay refused to invent a table. The finding is still in $LogPath."
        }
    }

    $newNumber = (($numbers | Measure-Object -Maximum).Maximum) + 1
    $insertAt  = if ($firstHalt -ge 0) { $firstHalt } else { $tableIndexes[$tableIndexes.Count - 1] + 1 }

    # The cell is pipe-delimited and this is arbitrary prose out of a log. A raw
    # pipe here is the "NODE|20-lts" defect again, except written by the relay
    # itself; a newline would split one row into two lines and cut the table in
    # half.
    $quoted = ($Passages -join ' ')
    $quoted = $quoted -replace '[\r\n]+', ' '
    $quoted = $quoted -replace '\|', '/'
    $quoted = ($quoted -replace '\s+', ' ').Trim()
    if ($quoted.Length -gt $MaxQuotedChars) {
        $quoted = $quoted.Substring(0, $MaxQuotedChars).TrimEnd() + " [cut here - the rest is in the log]"
    }
    if ($quoted.Length -eq 0) {
        return [pscustomobject]@{
            Added  = $false
            Number = $null
            Reason = "there was nothing quotable left after the cycle's words were made safe for a table cell"
        }
    }

    $item = "**CARRIED HERE BY THE RELAY - cycle $Cycle handed this up in its log and queued no row for it.** Every word after the arrow is the cycle's own and the relay interpreted none of it. The context is in ``$LogPath``. Either turn this into a real item or close it WONTFIX - it costs one reading either way, which is what a finding stranded in a log costs every cycle that has to re-derive it. >>> $quoted"

    $row = "| $newNumber | $item | TODO |"

    $updated = New-Object System.Collections.Generic.List[string]
    for ($i = 0; $i -lt $lines.Count; $i++) {
        if ($i -eq $insertAt) { $updated.Add($row) }
        $updated.Add([string]$lines[$i])
    }
    if ($insertAt -ge $lines.Count) { $updated.Add($row) }

    Set-Content -Path $Path -Value $updated -Encoding utf8

    # PROVE IT, DO NOT ASSUME IT. A row the relay's own picker cannot read would
    # STOP THE WHOLE QUEUE - the seventh-word failure, caused this time by the
    # relay rather than by a cycle. So the file is read back through the real
    # parser, and anything short of a clean TODO row is rolled straight back.
    $written = @(Get-QueueRows $Path) | Where-Object { $_.Number -eq "$newNumber" } | Select-Object -First 1
    if ($null -eq $written -or -not $written.Parsed -or $written.Status -notmatch '^TODO') {
        Set-Content -Path $Path -Value $lines -Encoding utf8
        return [pscustomobject]@{
            Added  = $false
            Number = $null
            Reason = "the row the relay built could not be read back by its own parser, so QUEUE.md was put back exactly as it was and nothing was changed. The finding is still in $LogPath."
        }
    }

    return [pscustomobject]@{
        Added  = $true
        Number = "$newNumber"
        Reason = "carried the cycle's own words into QUEUE.md as row #$newNumber, above any BLOCKED row so the picker still reaches it"
    }
}

# ===========================================================================
# GOING QUIET IS ITSELF A FAULT
#
# 2026-08-26, twice in one day: the relay went silent with a full queue behind
# it, and both times a human noticed rather than the machine reporting it. Once
# a cycle hung; once a single malformed row made it idle for thirty minutes.
# Overnight, unattended, either one costs the entire night.
#
# The hard part is not detecting it. It is that a stalled relay and a healthy
# relay produce EXACTLY THE SAME OBSERVABLE: nothing. Silence cannot be
# distinguished from success by looking, which is why this has to push.
#
# WHY THE STALL STATE LIVES IN MEMORY AND NOT IN STATUS.json
#
# Save-Status rebuilds the whole status object on every call, and the refusal
# path calls it once a minute. A stall clock stored there would be reset by an
# unrelated write every sixty seconds and could never reach twenty minutes - the
# alert would be built, wired, report success, and never fire. That is the house
# defect, and putting this field in that file would be walking straight into it.
#
# A stall is a property of a RUNNING watcher, so it is held by the running
# watcher. The honest cost: if the watcher process itself dies - window closed,
# machine asleep - nothing here can email, because nothing here is executing.
# That case is NOT covered and must not be claimed as covered.
# ===========================================================================

# How long the loop may go round without starting a cycle before it shouts.
# Twenty minutes is from the queue item. It is comfortably longer than the
# 5-minute refusal cooldown, so an ordinary retry never trips it.
$StallAlertAfterMinutes = 20

# RELAY_STALL_MINUTES exists so the alarm can be PROVEN without waiting twenty
# real minutes for it - relay-stall-proof.ps1 sets it to 1 and stalls the relay
# on purpose. An alarm that is too slow to test is an alarm nobody ever tests.
#
# It is CLAMPED to 1..20, so this knob can only ever make the relay shout
# SOONER. A typo, a stale variable left in a shell, or someone trying to quieten
# it cannot push the alarm out past twenty minutes or switch it off. The one
# thing this must never become is a way to buy silence.
if ($env:RELAY_STALL_MINUTES) {
    $requested = 0
    if ([int]::TryParse($env:RELAY_STALL_MINUTES, [ref]$requested) -and $requested -ge 1 -and $requested -le 20) {
        $StallAlertAfterMinutes = $requested
    }
}

function Get-QueueTodoCount([string]$Path = $QueueFile) {
    # Only rows that parsed AND say TODO. An unreadable row is deliberately not
    # counted here - it gets its own, louder alert that names the row.
    return @(Get-QueueRows $Path | Where-Object { $_.Parsed -and $_.Status -match '^TODO' }).Count
}

# Pure decision, so the self-test can drive it with injected time instead of
# waiting twenty real minutes for an answer.
function Get-StallVerdict {
    param(
        [Parameter(Mandatory = $true)][datetime]$IdleSince,
        [Parameter(Mandatory = $true)][datetime]$Now,
        [Parameter(Mandatory = $true)][int]$ThresholdMinutes,
        [Parameter(Mandatory = $true)][bool]$AlreadyAlerted,
        [Parameter(Mandatory = $true)][int]$TodoCount
    )

    $minutes = [math]::Round(($Now - $IdleSince).TotalMinutes, 1)

    $verdict = [pscustomobject]@{
        ShouldAlert = $false
        Minutes     = $minutes
        Reason      = ""
        Subject     = ""
        Body        = ""
    }

    # An empty queue is not a stall, it is a finished night. Emailing about it
    # would teach Greg that these alerts are noise, and the one that matters
    # would be ignored with the rest.
    if ($TodoCount -lt 1) {
        $verdict.Reason = "idle for $minutes min, but no job is waiting - the relay has run out of work, which is not a fault"
        return $verdict
    }

    if ($minutes -lt $ThresholdMinutes) {
        $verdict.Reason = "idle for $minutes min, which is under the $ThresholdMinutes min threshold - a gap between items is normal"
        return $verdict
    }

    # "Send once per stall, not every 20 minutes" - verbatim from the queue item.
    if ($AlreadyAlerted) {
        $verdict.Reason = "idle for $minutes min with $TodoCount waiting, but Greg has already been told about THIS stall"
        return $verdict
    }

    $jobWord = if ($TodoCount -eq 1) { "job" } else { "jobs" }

    $verdict.ShouldAlert = $true
    $verdict.Reason      = "idle for $minutes min with $TodoCount $jobWord waiting"
    # The subject has to work as a phone notification, where it may be all he
    # ever sees. So it says what happened and how much is at stake, not "alert".
    $verdict.Subject     = "ODoutreach relay STALLED - $TodoCount $jobWord waiting, nothing running"
    $verdict.Body        = @"
The relay has not started a cycle for $minutes minutes, and $TodoCount $jobWord in
QUEUE.md are still waiting. Nothing is running. Nothing will run until this is
cleared, so the rest of the night is being lost while you read this.

WHAT TO DO, in order:

1. Look at the PowerShell window running relay-watch.ps1. The last few lines say
   what it decided and why.
2. Read .bidlow\relay\SELF-QUEUE-NOTE.md. If the relay refused to take an item,
   that file names the item and the reason - most often one row in QUEUE.md whose
   status cell it cannot read.
3. If the window is gone, the watcher itself has died. Run relay-start.cmd in the
   repository folder to bring it back; it clears the HALT file for you.

Nothing has been skipped, nothing has been changed, and no work has been lost.
The queue is exactly where it was.
"@
    return $verdict
}

# True the FIRST time this exact broken row is seen, false on every retry after.
#
# The relay re-reads QUEUE.md every five minutes after a refusal, so without this
# a single bad row would email Greg twelve times an hour and train him to filter
# the alert that was supposed to save the night. Keying on the row's full text
# rather than its number is deliberate: if someone edits the row and it is STILL
# broken, that is a new fault and it gets a new email.
$script:LastBadRowAlerted = $null
function Register-BadRowAlert([string]$rowKey) {
    if ($script:LastBadRowAlerted -eq $rowKey) { return $false }
    $script:LastBadRowAlerted = $rowKey
    return $true
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

        # This is the fault that cost thirty minutes on 2026-08-26, and the note
        # above is exactly what was written that day - into a file nobody was
        # reading, while the relay sat silent. A note is a record, not an alarm.
        # So this one pushes, and it names the row, because "the queue is broken"
        # without saying WHICH row is the message that wasted the evening.
        $rowKey = "$($next.Number)|$($next.Raw)"
        if (Register-BadRowAlert $rowKey) {
            $waiting = Get-QueueTodoCount
            Send-RelayAlert "ODoutreach relay STUCK - QUEUE.md row $($next.Number) cannot be read, $waiting jobs behind it" @"
The relay has stopped taking work because it cannot read one row in QUEUE.md.
It will not skip past it, because the order of the queue is the plan.

THE ROW IS #$($next.Number), on line $($next.LineIndex + 1) of .bidlow\relay\QUEUE.md:

    $($next.Raw)

The status cell - the last column - must START with one of these words:
TODO, DONE, BLOCKED, PARTIAL, IN PROGRESS, WONTFIX.

Fix that one cell and the relay picks up again BY ITSELF within $RefusalRetryMins
minutes. You do not need to restart anything.

$waiting other job(s) are waiting behind this row. Nothing has been skipped,
nothing has been changed, and no work has been lost.
"@ | Out-Null
        }

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

    # PARTIAL IS WORK, AND THE RELAY TAKES IT.
    #
    # This used to be '^TODO' alone, and that made the queue punish a cycle for
    # being honest. PARTIAL means "some of this is done and some of it is not",
    # which is a row with work left in it - refusing to take it is refusing to
    # do the work. Row 59 sat at "PARTIAL 58" with a real, named, unfixed
    # catch-all still in it, and would have stopped the relay dead the moment
    # the picker reached it.
    #
    # BLOCKED and WONTFIX still stop the relay, and should. Those two words mean
    # "not yours to take" - a different thing entirely from "not finished".
    if ($next.Status -notmatch '^(TODO|PARTIAL)') {
        # The row parsed cleanly - this is a real status the relay simply does
        # not take automatically. The raw row goes in anyway, because the one
        # thing the lost cycle proved is that a status quoted out of context is
        # not enough to tell a deliberate hold from a broken cell.
        Write-SelfQueueNote @"
The next item in order is #$($next.Number), and its status is '$($next.Status)'.

Only TODO and PARTIAL are taken automatically, so the relay is idling rather than
deciding for itself that this counts as ready.

The row as it appears in QUEUE.md, line $($next.LineIndex + 1):

    $($next.Raw)
"@
        return $false
    }

    # ---------------------------------------------------------------------
    # STOP AND ALERT, NOT "RUN THE CYCLE ANYWAY".
    #
    # Set-QueueRowStatus refusing a duplicate is necessary but not sufficient.
    # Without this, the caller below wrote the brief, met the false, logged one
    # line into a console nobody was reading, and returned TRUE - so a whole
    # cycle ran against a row that was still TODO, and the next cycle picked the
    # very same row up again. A repeated number would loop for ever, one cycle
    # at a time, each one costing real money and shipping nothing.
    #
    # The check is HERE, before the brief is written, rather than on the false
    # return underneath. That way there is no NEXT.md to un-write: a brief on
    # disk is the thing that makes the watcher run a cycle, so writing one and
    # deleting it again is a race this does not need to have.
    # ---------------------------------------------------------------------
    $twins = @(Get-QueueRowNumberLineIndexes (Get-Content $QueueFile -Encoding UTF8) $next.Number)
    if ($twins.Count -gt 1) {
        $twinLines = Format-QueueRowLineNumbers $twins
        Write-SelfQueueNote @"
The next item in order is #$($next.Number), and the relay will not take it, because
$($twins.Count) different rows in QUEUE.md carry that number. They are on lines $twinLines.

The relay marks a row IN PROGRESS by finding it by number. With the number written
twice it cannot tell which row it would be marking, and it will not guess - guessing
is how a finished row's earned record was overwritten on 2026-08-27, while the row
actually being worked on stayed TODO and was handed out again.

So nothing has been marked, no brief was written, and no cycle was started.

THE FIX IS ONE EDIT: give one of those rows a number no other row is using. The
relay picks up again by itself within $RefusalRetryMins minutes.
"@

        # A note is a record, not an alarm - same finding as the unreadable row
        # above. This one pushes, and it names the number, because the queue is
        # stopped until a human changes one digit. Keyed on the row's full text
        # so an edit that leaves it still duplicated is a new fault.
        if (Register-BadRowAlert "duplicate|$($next.Number)|$($next.Raw)") {
            $waiting = Get-QueueTodoCount
            Send-RelayAlert "ODoutreach relay STUCK - QUEUE.md has $($twins.Count) rows numbered $($next.Number), $waiting jobs behind it" @"
The relay has stopped taking work because $($twins.Count) rows in
.bidlow\relay\QUEUE.md carry the same number, $($next.Number). They are on lines $twinLines.

It marks a row IN PROGRESS by finding it by number, so with the number written
twice it cannot tell which row it is working on. It changed nothing rather than
mark the wrong one - which is what happened on 2026-08-27, when a finished row's
DONE was overwritten and the row actually being worked on was handed out again.

THE FIX IS ONE EDIT: give one of those rows a number no other row is using.
The relay picks up again BY ITSELF within $RefusalRetryMins minutes. You do not
need to restart anything.

$waiting other job(s) are waiting behind this. Nothing has been skipped, nothing
has been changed, and no work has been lost.
"@ | Out-Null
        }

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

## FIRST, BEFORE ANY NEW WORK: CLEAR THE GREEN PULL REQUESTS

Do this at the START of every cycle, before you read the item below. It takes two
minutes and it is the difference between a queue and a landfill.

``gh pr list --state open`` then, for every PR whose checks are GREEN: bring the
branch up to date if branch protection requires it, and MERGE it. Greg counted
SEVENTEEN open on 2026-08-28 and most were green - they had simply been opened and
abandoned.

**Understand WHY this happens, because it is structural and not laziness.** A
cycle finishes its work, opens a PR, and ends. CI takes about five minutes. Nobody
ever comes back. So every cycle adds one and removes none, for ever. The only
place that can be fixed is here, at the start of the NEXT cycle.

Rules for the sweep:
* RED PRs are not yours to force. Read the failure, and either fix it as part of
  this cycle or say in your log why you left it.
* Merge order matters: branch protection requires each branch to be current, so
  every merge invalidates the next one. Take the docs and ``.bidlow`` record PRs
  first - they cannot conflict with code - then the code ones, updating as you go.
* ``gh pr merge --auto`` is better than update-then-race if auto-merge is allowed.
* A DESTRUCTIVE migration is still Greg's. Additive is yours.
* If a PR is genuinely not ready, say so in a comment on it, so the next cycle
  does not have to work that out again.

## Before you touch anything, write these four things down

1. **The files you are going to change.** Name them. If you cannot yet, your
   first job is to find out, and that reconnaissance IS the cycle.
2. **The red-first test.** Name the test file and what it asserts. Watch it FAIL
   before you make it pass. If the behaviour cannot go red first, say why, and
   prove the test is capable of failing by deliberately breaking the code and
   showing the red - that is this repository's established substitute.
3. **What "done" looks like** for this item, in one sentence a non-coder can check.
4. **What you must NOT touch.** Anything outside the files in (1).

## THIS PROJECT'S FOLDER, AND NOTHING OUTSIDE IT

You are working on ONE client system. Greg runs several side by side, and they
share one folder deliberately: ``C:\Bidlowprojects\_standards`` is the METHOD -
the hooks, the gates, the skills, the deck, the checklists - and it applies to
every project at once.

**Do not create, edit, move or delete anything under ``_standards`` unless the
queue row you are working on names that path explicitly.** A change made there
while doing client work does not stay with this client; it silently changes how
every other build is judged, including ones nobody is looking at today. If this
row's work seems to need a change to the method, STOP and write the case for it
into your log as a finding. Somebody will queue it as its own row, against the
standard, where it can be reviewed on its own terms.

The same goes for any sibling project folder - ``BidlowClients\Kepak``,
``BidlowClients\Papaya``, ``BidlowTools\*``. Read them if a row asks you to
compare something. Never write to them.

## The rules that apply to every cycle

* Do not stall on a question. Decide, record the decision and why, and continue.
  If the decision is genuinely Greg's - money, a client relationship, or one of
  the three named below - stop and write down the question instead. Note what
  changed on 2026-08-27: "an irreversible one-way door" used to sit in this list
  and was read as covering any production merge. It does not. Only (a), (b) and
  (c) below stop you now.
* Gates before you claim anything: ``npm run lint``, ``npm run typecheck``,
  ``npm test``. Show the real output. A gate you did not run is not met.
* Commit and push when confident. Branch protection is ON, so it is
  branch -> PR -> green CI -> merge. Never push straight to ``main``.
* **MERGING IS YOURS NOW. Greg decided this on 2026-08-27 and asked to stop being
  the bottleneck.** With green CI, MERGE AND DEPLOY WITHOUT ASKING. Do not park a
  finished, green PR and wait for him - a PR left open ROTS: #231 went from clean
  to 36 commits behind and CONFLICTING in a single day, and cost a whole cycle to
  rescue. Leaving it open is not the safe option, it is the expensive one.
* Three things still stop and ask, and they are the ONLY three:
  (a) a DESTRUCTIVE migration - anything that drops or alters an EXISTING table,
      column or type, or backfills over existing rows. Creating a NEW table, a new
      enum, or adding foreign keys to a new table is ADDITIVE and is yours to merge.
      The test is: does dropping what this adds restore today's behaviour exactly?
  (b) anything that touches or moves real CLIENT data.
  (c) anything that causes an EMAIL TO BE SENT. That one is absolute and it is on
      top of the hard rule about ``bidlowai``, not instead of it.
  If it is none of those three, you do not need him. Merge it.
* If you deploy, verify the running commit by HASH against the DIRECT App
  Service URL (``app-opensdoors-outreach-prod.azurewebsites.net``), never the
  CDN-cached custom domain, and never liveness alone.
* Production migrations are real. ``PRODUCTION_PRISMA_MIGRATE`` is true, so
  merging a migration applies it to the live client database.
* When you finish, update this item's row in ``.bidlow/relay/QUEUE.md`` to
  ``DONE $nextCycle``, or back to ``TODO`` with a note if you could not do it.

## THE STATUS CELL: SIX WORDS, AND ONLY SIX

The status cell of a queue row MUST BEGIN with one of exactly these six:

    TODO    DONE    BLOCKED    PARTIAL    IN PROGRESS    WONTFIX

Markdown bold around it is fine - ``| **DONE $nextCycle - ...** |`` reads correctly.
Anything else does not. The relay reads QUEUE.md with a regex, and a status it
cannot read STOPS THE WHOLE QUEUE, on purpose: refusing to guess is the right
behaviour, and inventing is the one thing this relay will never do.

This is not hypothetical, and it is not pedantry. Cycle 59 built, merged and
DEPLOYED half of row 40 - good work, verified by commit hash - and then wrote its
status as ``PARTLY DONE 59``. Two words, one of them not on the list above. The
row stopped parsing, the picker met it first, and the relay took nothing at all
for seventy minutes while eleven jobs waited behind it. ``SUPERSEDED`` did exactly
the same thing to row 38 the day before.

So, plainly:

* Finished it -> ``DONE $nextCycle - <what you did, and the proof>``
* Did some of it -> ``PARTIAL $nextCycle - <what is done, what is left>``. PARTIAL
  is TAKEN by the relay, so the next cycle picks the row straight back up. This is
  the right answer whenever you shipped part of a row.
* Could not start -> ``TODO - <why>``
* Never invent a seventh word.
* Do NOT write the next NEXT.md. The watcher does that. One cycle, one item.

## Assume the seventh exists

QUEUE.md records six instances this week of something built, wired, reporting
success, and never firing. It is the defect this project is worst at by a wide
margin. Whatever you build this cycle, prove it FIRES - not that it exists.
"@

    Set-Content -Path $NextFile -Value $brief -Encoding utf8

    # Remembered so that, if the cycle hands this row back unreadable, the relay
    # knows WHICH row is its own to repair. See "THE SEVENTH WORD".
    $script:LastTakenRow = $next.Number

    if (Set-QueueRowStatus $next.Number "IN PROGRESS $nextCycle") {
        Write-Line "Self-queued item #$($next.Number) as cycle $nextCycle, and marked it IN PROGRESS."
    } else {
        Write-Line "Self-queued item #$($next.Number) as cycle $nextCycle, but could not update its row in QUEUE.md."
    }

    if (Test-Path $NoteFile) { Remove-Item $NoteFile -Force }
    return $true
}

# ---------------------------------------------------------------------------
# Get-SelfTestStartupDecision - what the startup gate does with the self-test's
# own exit code. Pulled out as a pure function, exactly like the git-matching
# functions above, so relay-selftest.ps1 can drive it directly instead of only
# being able to prove it by actually starting or refusing to start the relay.
#
# Exit code 1 (SELF-TEST FAILED) is a real, proven failure of the safety
# machinery itself - refuse to start, unchanged from before this row.
#
# Exit code 2 (SELF-TEST HARNESS ERROR, see relay-selftest.ps1) means the test
# code crashed before it could finish asking its question - on 31 August this
# was git's own progress text on stderr being turned into a terminating error
# under $ErrorActionPreference = "Stop". That is not evidence the safety
# machinery is broken, so the relay starts anyway - but loudly: the caller
# must still alert and write an artefact, never start silently as if nothing
# happened, or the harness crash rots unnoticed exactly like the six other
# things QUEUE.md already records as built, wired, and never firing.
#
# Exit code 0 is a clean pass - start, no alert needed.
# ---------------------------------------------------------------------------
function Get-SelfTestStartupDecision {
    param([int]$ExitCode)

    if ($ExitCode -eq 0) {
        return [PSCustomObject]@{ ShouldStart = $true;  Severity = "ok";            AlertNeeded = $false }
    }
    if ($ExitCode -eq 2) {
        return [PSCustomObject]@{ ShouldStart = $true;  Severity = "harness-error"; AlertNeeded = $true }
    }
    return [PSCustomObject]@{ ShouldStart = $false; Severity = "failed"; AlertNeeded = $true }
}

# ===========================================================================
# ROW 137: REGENERATE THE CROSS-PROJECT DECK AT THE END OF EACH CYCLE.
#
# On 31 August the deck at C:\Bidlowprojects\bidlow-deck.html was four days
# stale - nothing regenerated it but a human remembering to run
# `node _standards\bidlow-deck.mjs` by hand. The relay is the right home for
# this because it is the thing that actually changes project state: if a
# cycle ran, something may have moved, so the deck is worth refreshing; if the
# relay never ran, nothing changed either.
#
# THE NON-NEGOTIABLE CONSTRAINT: a failure here must NEVER stop or delay the
# relay. Row 122's self-test crashed on a Windows/PowerShell difference and,
# because the self-test GATES startup, stopped the engine dead three times
# before anyone noticed twenty minutes in. A cosmetic reporting step must have
# LESS power than that, not more - so this function never throws. Every
# failure path (missing node, missing script, the script exiting non-zero, a
# locked output file) is caught here and returned as data, not an exception.
#
# WRITTEN ATOMICALLY: the deck script is asked to write to a temp file in the
# SAME directory as the real output, then Move-Item -Force renames it into
# place. A rename within one NTFS volume/directory is atomic, so a reader can
# never see a half-written deck, and two relays racing this function (should
# Kepak or Papaya get one later) each overwrite cleanly rather than
# interleave. On any failure the temp file is removed and the existing
# deck - if any - is left completely untouched.
#
# Parameterised (ProjectsRoot / DeckScript / OutFile / NodeExe) for exactly
# the reason Clear-StaleIndexLock and Invoke-CycleAgent are above:
# relay-selftest.ps1 points these at scratch fixtures instead of the real
# _standards folder and the real bidlow-deck.html, so the two required cases -
# a working regeneration, and a planted failing one - can be proven without
# touching Greg's real deck or depending on every OTHER project's live state.
# ===========================================================================
function Invoke-DeckRegeneration {
    param(
        [Parameter(Mandatory = $true)][string]$ProjectsRoot,
        [Parameter(Mandatory = $true)][string]$DeckScript,
        [Parameter(Mandatory = $true)][string]$OutFile,
        [string]$NodeExe = "node"
    )

    $result = [pscustomobject]@{ Ok = $false; Note = "" }

    try {
        if (-not (Test-Path $DeckScript -PathType Leaf)) {
            $result.Note = "deck script not found at '$DeckScript' - skipped, left the existing deck untouched"
            return $result
        }

        $nodeCmd = Get-Command $NodeExe -ErrorAction SilentlyContinue
        if (-not $nodeCmd) {
            $result.Note = "'$NodeExe' was not found on PATH - deck regeneration skipped, left the existing deck untouched"
            return $result
        }

        $outDir = Split-Path -Parent $OutFile
        $tempFile = Join-Path $outDir (".bidlow-deck-tmp-{0}.html" -f ([guid]::NewGuid().ToString('N')))
        $stdoutFile = Join-Path $outDir (".bidlow-deck-tmp-{0}.stdout.txt" -f ([guid]::NewGuid().ToString('N')))
        $stderrFile = Join-Path $outDir (".bidlow-deck-tmp-{0}.stderr.txt" -f ([guid]::NewGuid().ToString('N')))

        try {
            $proc = Start-Process -FilePath $nodeCmd.Source `
                -ArgumentList @($DeckScript, "--root", $ProjectsRoot, "--out", $tempFile) `
                -NoNewWindow -Wait -PassThru `
                -RedirectStandardOutput $stdoutFile -RedirectStandardError $stderrFile

            if ($proc.ExitCode -ne 0) {
                $stderrText = ""
                if (Test-Path $stderrFile) { $stderrText = [string](Get-Content $stderrFile -Raw -ErrorAction SilentlyContinue) }
                $firstLine = ($stderrText -split "`n" | Where-Object { $_ -ne "" } | Select-Object -First 1)
                $result.Note = "node exited $($proc.ExitCode) generating the deck - left the existing deck untouched. $firstLine".Trim()
                return $result
            }

            if (-not (Test-Path $tempFile -PathType Leaf) -or (Get-Item $tempFile).Length -eq 0) {
                $result.Note = "the deck script ran and exited 0 but produced no (or an empty) output file - left the existing deck untouched"
                return $result
            }

            # The rename is the atomic step: same directory, so this is a
            # single filesystem operation, never a delete-then-write gap.
            Move-Item -Path $tempFile -Destination $OutFile -Force
            $result.Ok = $true
            $result.Note = "regenerated $OutFile"
            return $result
        } finally {
            Remove-Item -Path $tempFile, $stdoutFile, $stderrFile -Force -ErrorAction SilentlyContinue
        }
    } catch {
        # Anything not already caught above - a locked $OutFile that Move-Item
        # cannot replace, Start-Process itself throwing, or anything else
        # unforeseen - lands here instead of escaping to the caller.
        $result.Ok = $false
        $result.Note = "deck regeneration threw and was caught: $(($_.Exception.Message).Trim()) - left the existing deck untouched"
        return $result
    }
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
$selfTestDecision = Get-SelfTestStartupDecision -ExitCode $LASTEXITCODE

if (-not $selfTestDecision.ShouldStart) {
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

if ($selfTestDecision.Severity -eq "harness-error") {
    # The test code itself crashed before it could finish - see
    # relay-selftest.ps1 for why that is kept distinct from a real failure.
    # No check actually failed, so the relay starts anyway, but this must not
    # go by silently: write the same artefact shape used for a real refusal
    # (so it's easy to find) and send a clearly-different-worded alert, so a
    # human still sees it without it costing a stopped morning.
    $selfTestHarnessError = Join-Path $RelayDir "SELFTEST-HARNESS-ERROR.md"
    @(
        "# The relay started, but its self-test harness crashed"
        ""
        "Written $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')."
        ""
        "No check in the self-test failed. The test code itself threw before it"
        "could finish, most likely a platform difference between this machine and"
        "CI. That is not evidence the safety machinery is broken, so the relay"
        "started and took work as normal - but a human should still read this,"
        "because part of the self-test did not run and so proved nothing."
        ""
        "``````"
        $selfTestOutput.Trim()
        "``````"
    ) | Set-Content -Path $selfTestHarnessError -Encoding utf8

    Send-RelayAlert "ODoutreach relay STARTED - self-test harness crashed (not a real failure)" @"
The relay started and is taking work as normal. Its self-test harness crashed
before finishing, but no check actually failed - that is a bug in the test
code, not in the safety machinery it checks, so the relay did not stop for it.

Details are in $selfTestHarnessError on the machine, and below.

$($selfTestOutput.Trim())
"@ | Out-Null

    Write-Line "Self-test harness crashed (no check failed) - starting anyway. Details written to $selfTestHarnessError"
}

# ---------------------------------------------------------------------------
# ORPHANED "IN PROGRESS" ROWS ARE REOPENED AT STARTUP
#
# Only this watcher ever writes "IN PROGRESS", and it writes it at the instant it
# hands an item to a cycle. So at startup, by definition, nothing is running and
# every "IN PROGRESS" row is the corpse of a cycle that was killed, timed out, or
# had its window closed. Left alone that row is not TODO, so the picker walks
# straight past it - for ever, and silently, which is the worst kind.
#
# This has now happened three times (row 27 after cycle 20, row 28 twice), and
# each time a human had to notice. A rule written in QUEUE.md did not stop it
# happening again, so it is repaired in code here instead of being remembered.
#
# This also makes a restart SAFE at any moment: killing a cycle mid-flight now
# costs that cycle's work, not the item.
# ---------------------------------------------------------------------------
$reopened = 0
foreach ($row in (Get-QueueRows)) {
    if (-not $row.Parsed) { continue }
    if ($row.Status -notmatch '^IN PROGRESS') { continue }
    # ANCHORED. This was `-replace '[^0-9]', ''`, which strips every non-digit
    # from the WHOLE status cell and concatenates whatever is left - so a status
    # mentioning PR numbers produced a hundred-digit "cycle id", and that garbage
    # was then WRITTEN BACK INTO QUEUE.md as the reopen note. Observed at
    # 2026-08-28 08:25:52 on row 68. Take only the digits that follow the words
    # IN PROGRESS, which is the one number that means anything here.
    $cycleMatch = [regex]::Match($row.Status, '^IN PROGRESS\s+(\d+)')
    $deadCycle  = if ($cycleMatch.Success) { $cycleMatch.Groups[1].Value } else { 'unknown' }
    # See "AN ORPHAN REOPEN THAT KNOWS THE WORK MIGHT ALREADY BE ON MAIN" above.
    # The row this cycle was holding may already be merged, even though it
    # never wrote DONE - so ask before writing a bare TODO back.
    $mergedOnMain = Test-RowMergedOnMain $row.Number
    # No pipe in the status text - see the standing rule at the top of QUEUE.md.
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
}
if ($reopened -eq 0) { Write-Line "No orphaned IN PROGRESS rows to reopen." }
else { Write-Line "Reopened $reopened orphaned row(s) so the queue does not silently skip them." }

# The stall clock. See "GOING QUIET IS ITSELF A FAULT" above.
#
# It starts at NOW rather than at zero: a watcher that has only just started has
# not been idle for twenty minutes, and an alert on every start is an alert Greg
# learns to delete unread.
# Cycles run by THIS process. See the note on $MaxCycles above.
$cyclesThisRun = 0
$idleSince    = Get-Date
$stallAlerted = $false

while ($true) {

    if (Test-Path $HaltFile) {
        Write-Line "HALT file found. Stopping cleanly."
        exit 0
    }

    # Has the loop gone quiet with work still waiting?
    #
    # This sits at the top, before every branch, on purpose. The two stalls of
    # 2026-08-26 happened in two DIFFERENT idle paths, and a check bolted onto
    # each path individually would have missed the third one nobody predicted.
    # Everything passes through here, so everything is covered.
    $stall = Get-StallVerdict -IdleSince $idleSince -Now (Get-Date) `
        -ThresholdMinutes $StallAlertAfterMinutes `
        -AlreadyAlerted   $stallAlerted `
        -TodoCount        (Get-QueueTodoCount)

    if ($stall.ShouldAlert) {
        Write-Line "STALLED: $($stall.Reason). Emailing Greg."
        Send-RelayAlert $stall.Subject $stall.Body | Out-Null
        # Marked as told even if the dispatch failed. Send-RelayAlert already
        # shouts in the window when it cannot send, and re-trying a broken
        # dispatch every sixty seconds would bury that message under itself.
        $stallAlerted = $true
    }

    $status         = Read-Status
    $cycle          = [int]$status.cycle
    $lastSelfQueued = [int]$status.lastSelfQueued

    # ---------------------------------------------------------------------
    # THE RUNAWAY LIMIT IS A ROLLOVER NOW, NOT A STOP.
    #
    # It used to write a HALT file and email Greg, and he then had to come and
    # press start again - roughly every sixteen hours, including overnight,
    # which is exactly the babysitting this relay exists to remove. On
    # 2026-08-27 it stopped at 09:30 and sat idle with five items waiting.
    #
    # Self-restarting was rejected once before, for a real reason: killing the
    # watcher mid-cycle left that cycle's row stuck on IN PROGRESS, and a row
    # that is not TODO is skipped by the picker for ever, silently. THAT reason
    # is now gone - the startup block above reopens every orphaned row before
    # taking any work, and it was proven red-then-green. So the objection that
    # made this unsafe no longer holds, and the limit can do what it was always
    # meant to do: bound one process, not end the work.
    #
    # Exit 42 is the signal to relay-start.cmd to launch a FRESH watcher. It is
    # a distinct code on purpose: a HALT that Greg created, a failed self-test
    # and a crash all exit with something else, and the wrapper only loops on
    # 42. So "stop" still means stop, and only the rollover rolls over.
    #
    # This cannot spin. Reaching 42 requires $MaxCycles cycles to have actually
    # STARTED in this process, and a cycle takes twenty to forty-five minutes.
    # ---------------------------------------------------------------------
    if ($cyclesThisRun -ge $MaxCycles) {
        Write-Line "Ran $MaxCycles cycles in this session, which is the runaway limit for ONE process."
        Write-Line "Handing over to a fresh watcher - no HALT file, nothing lost, work continues."
        Write-Line "Any row left IN PROGRESS by this process will be reopened by the next one."
        exit 42
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
    $cyclesThisRun++
    Write-Line "Cycle $cycle starting (number $cyclesThisRun of $MaxCycles in this run)."

    # Clear a stale .git/index.lock left behind by a killed cycle BEFORE the
    # brief goes to Claude Code - see Clear-StaleIndexLock above for why.
    $lockCheck = Clear-StaleIndexLock -RepoPath $RepoRoot -Now (Get-Date)
    if ($lockCheck.Found) {
        Write-Line $lockCheck.Note
    }

    Move-Item -Path $NextFile -Destination $CurrentFile -Force
    Save-Status $cycle "running" $lastSelfQueued

    $logFile = Join-Path $LogDir ("cycle-{0:d3}.md" -f $cycle)
    $started = Get-Date

    $prompt     = Get-Content $CurrentFile -Raw -Encoding UTF8
    $namedFiles = Get-NamedFiles $prompt
    $before     = Get-RepoEvidence $namedFiles

    # The row NUMBERS as they stand before the cycle touches anything. Compared
    # against the same list afterwards, this is what tells "mirrored a finding
    # into the queue" apart from "stamped its own row DONE" - and every cycle
    # does the second. See "A FINDING THAT EXISTS ONLY IN A CYCLE LOG" above.
    $queueRowsBefore = @(@(Get-QueueRows) | ForEach-Object { [string]$_.Number })

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

    # -----------------------------------------------------------------------
    # A CYCLE THAT ENDED BADLY MUST GIVE ITS ROW BACK - MID-RUN, NOT JUST AT
    # STARTUP.
    #
    # Found live on 2026-08-27, minutes after the startup version shipped and
    # while it was busy congratulating itself. Cycle 41 was killed at the
    # 45-minute deadline holding row 9 - PROVE, the most important item in the
    # queue. Its row stayed "IN PROGRESS 41", the watcher carried on running,
    # and the picker skipped straight past it. Nothing broke, nothing alerted,
    # and the one item Greg most needed would simply never have been done.
    #
    # The startup reopen does NOT cover this, because the watcher never
    # restarted. Cycles 33 and 34 timed out the same way earlier that morning,
    # so it had already happened twice before anyone noticed.
    #
    # Only this cycle's own row is touched, and only while it is STILL marked
    # "IN PROGRESS <this cycle>". If the agent got as far as writing DONE or
    # BLOCKED, that stands - a kill is a verdict on the clock, not on the work.
    #
    # ROW 121: this used to gate on $outcome being one of the three ways the
    # WATCHER can tell a cycle went wrong (timed-out / failed / failed to
    # run). Cycle 150 ended CLEANLY - exit code 0, outcome "finished" - having
    # simply run out of time waiting on a rebuild and never gotten round to
    # writing its own row's status word. A clean exit was never a reason to
    # look, so row 117 sat "IN PROGRESS 150" while the watcher kept running,
    # and cycle 151 stepped straight past it - invisible for good, since the
    # picker only self-queues TODO and PARTIAL. The real invariant has nothing
    # to do with WHY the process ended: it is simply that the process has now
    # exited, so nothing is holding this row - checked structurally, because
    # this code runs only after Invoke-CycleAgent has already returned. See
    # Get-StrandedRowActions above, which is now called unconditionally.
    # -----------------------------------------------------------------------
    $strandedActions = Get-StrandedRowActions -QueueRows (Get-QueueRows) -CycleNumber $cycle `
        -Outcome $outcome -CycleTimeoutMinutes $CycleTimeoutMinutes `
        -MergeCheck { param($n) Test-RowMergedOnMain $n }
    foreach ($action in $strandedActions) {
        if (Set-QueueRowStatus $action.RowNumber $action.NewStatus) {
            if ($action.MergedOnMain) {
                Write-Line "Gave row #$($action.RowNumber) back to the queue as PARTIAL - cycle $cycle ended, but main's history already mentions this row. VERIFY before redoing."
            } else {
                Write-Line "Gave row #$($action.RowNumber) back to the queue - cycle $cycle ended without closing it, so it is TODO again rather than stranded."
            }
        } else {
            Write-Line "Row #$($action.RowNumber) is stranded on cycle $cycle and could NOT be rewritten. Check its formatting."
        }
    }

    # -----------------------------------------------------------------------
    # A DONE THIS CYCLE JUST WROTE FOR ITS OWN ROW IS CHECKED AGAINST MAIN.
    # See "A DONE THAT NEVER MERGED IS THE MIRROR IMAGE..." above, beside row
    # 103's Test-RowMergedOnMain / Get-OrphanReopenStatus. Only this cycle's
    # own row, and only while it still reads "DONE <this cycle>" - if a later
    # step already rewrote it (the unreadable-row repair below, for instance),
    # this does not fight that rewrite.
    #
    # ROW 122 runs FIRST, beside this: a pushed branch that names this row and
    # sits ahead of origin/main, unmerged, is checked before the generic
    # demands-a-merge question below - see "A DONE WHOSE OWN BRIEF NEVER
    # DEMANDED A MERGE CAN STILL BE SITTING ON A PUSHED, UNMERGED BRANCH"
    # above. This is the row 114/cycle 154 shape: an artefact-only row whose
    # brief never demanded a merge, so Get-DoneWithoutMergeStatus alone would
    # never have looked, but which still had real committed work waiting on
    # CI with nobody left to merge it.
    # -----------------------------------------------------------------------
    if ($script:LastTakenRow) {
        $justClosed = @(Get-QueueRows) |
                      Where-Object { $_.Number -eq $script:LastTakenRow } |
                      Select-Object -First 1
        if ($justClosed -and $justClosed.Parsed -and $justClosed.Status -match "^DONE\s+$cycle\b") {
            $unmergedBranch = Find-UnmergedPushedBranchForRow -RowNumber $justClosed.Number

            # ROW 138's LOOP BREAKER - see the block comment above
            # Get-DoneWithUnmergedBranchStatus. Reopen counts are per row
            # number and persisted across cycles (separate processes), so
            # they are read fresh here and written back once the decision is
            # made - never held in memory between calls.
            $rowKey = [string]$justClosed.Number
            $reopenCounts = Get-RowReopenCounts
            $priorReopenCount = if ($reopenCounts.ContainsKey($rowKey)) { [int]$reopenCounts[$rowKey] } else { 0 }

            $newDoneStatus = Get-DoneWithUnmergedBranchStatus -CurrentStatus $justClosed.Status `
                -RowNumber $justClosed.Number -CycleNumber $cycle -UnmergedBranch $unmergedBranch `
                -PriorReopenCount $priorReopenCount

            if ($unmergedBranch) {
                # A real reopen (PARTIAL) counts against the row; the loop
                # breaker firing (DONE ... LOOP BREAKER) resets it - the row
                # is being left closed, so the next genuinely new problem
                # with this row gets its own fresh two-strike budget.
                $reopenCounts[$rowKey] = if ($newDoneStatus -match '(?i)loop breaker') { 0 } else { $priorReopenCount + 1 }
                Set-RowReopenCounts $reopenCounts
            } elseif ($reopenCounts.ContainsKey($rowKey) -and $reopenCounts[$rowKey] -ne 0) {
                # No unmerged branch found this time - the row genuinely
                # closed clean, so any stale count from an earlier loop is
                # cleared rather than left to fire on an unrelated future
                # reopen of this same row number.
                $reopenCounts[$rowKey] = 0
                Set-RowReopenCounts $reopenCounts
            }

            if ($newDoneStatus -eq $justClosed.Status) {
                $demandsMerge = Test-RowDefinitionOfDoneDemandsMerge $justClosed.Item
                $mergedOnMain = if ($demandsMerge) { Test-RowMergedOnMain $justClosed.Number } else { $true }
                $newDoneStatus = Get-DoneWithoutMergeStatus -CurrentStatus $justClosed.Status `
                    -DemandsMerge $demandsMerge -MergedOnMain $mergedOnMain `
                    -RowNumber $justClosed.Number -CycleNumber $cycle
            }

            if ($newDoneStatus -ne $justClosed.Status) {
                if (Set-QueueRowStatus $justClosed.Number $newDoneStatus) {
                    if ($newDoneStatus -match '(?i)loop breaker') {
                        Write-Line "Row #$($justClosed.Number) has been reopened by the unmerged-branch guard $priorReopenCount time(s) already over branch '$unmergedBranch' - the loop breaker is giving up rather than reopening it again. Left closed DONE with a note; a person should check that branch."
                    } elseif ($unmergedBranch) {
                        Write-Line "Row #$($justClosed.Number) was closed DONE by cycle $cycle but branch '$unmergedBranch' is pushed and unmerged - rewritten to PARTIAL so the next cycle finishes the merge."
                    } else {
                        Write-Line "Row #$($justClosed.Number) was closed DONE by cycle $cycle but nothing on main mentions it - rewritten to PARTIAL so the next cycle verifies before trusting it."
                    }
                } else {
                    Write-Line "Row #$($justClosed.Number) was closed DONE with unmerged work found, and could NOT be rewritten. Check its formatting."
                }
            }
        }
    }

    # -----------------------------------------------------------------------
    # DID THIS CYCLE HAND ITS ROW BACK IN A WORD THE QUEUE DOES NOT HAVE?
    # Only this cycle's own row, only when it is now unreadable, only twice.
    # See "THE SEVENTH WORD" near the parser.
    # -----------------------------------------------------------------------
    if ($script:LastTakenRow) {
        $takenNow = @(Get-QueueRows) |
                    Where-Object { $_.Number -eq $script:LastTakenRow } |
                    Select-Object -First 1
        if ($takenNow -and -not $takenNow.Parsed) {
            $fix = Repair-UnreadableQueueRow $script:LastTakenRow $cycle
            if ($null -eq $fix) {
                Write-Line "Row #$($script:LastTakenRow) is unreadable and the relay could not safely find its status cell, so it changed nothing."
            } elseif ($fix.Duplicate) {
                # Not a typo to repair - a queue that has two rows with the same
                # number, which no amount of repairing fixes. See "TWO ROWS, ONE
                # NUMBER". Greg is emailed because nothing else here can move.
                Write-Line "Row #$($script:LastTakenRow) is unreadable AND $($fix.Count) rows carry that number, on lines $($fix.Lines). The relay changed nothing - it cannot tell which row is which. Emailing Greg."
                Send-RelayAlert "ODoutreach relay STUCK - QUEUE.md has $($fix.Count) rows numbered $($script:LastTakenRow)" @"
Cycle $cycle handed row #$($script:LastTakenRow) back with a status the queue parser
cannot read, which the relay would normally repair by itself. It has NOT, because
$($fix.Count) different rows in .bidlow\relay\QUEUE.md carry the number $($script:LastTakenRow) -
they are on lines $($fix.Lines).

With a repeated number the relay cannot tell which row is which, so it changed
NEITHER. Guessing is how a finished row's record was overwritten before.

THE FIX IS ONE EDIT: give one of those rows a number no other row is using.
The relay picks up again by itself within $RefusalRetryMins minutes.

Nothing has been skipped, nothing has been changed, and no work has been lost.
"@ | Out-Null
            } elseif ($fix.Repaired) {
                $peek = $fix.Cell.Substring(0, [Math]::Min(140, $fix.Cell.Length))
                Write-Line "Row #$($script:LastTakenRow) came back from cycle $cycle with a status word this queue does not have."
                Write-Line "  Put TODO in front of it, kept every word the cycle wrote, released the queue."
                Write-Line "  The cycle had written: $peek"
            } else {
                Write-Line "Row #$($script:LastTakenRow) is unreadable AGAIN after $($fix.Prior) repairs. Not repairing a third time - emailing Greg instead."
                Send-RelayAlert "ODoutreach relay - row #$($script:LastTakenRow) keeps coming back unreadable" "Cycle $cycle rewrote row #$($script:LastTakenRow) into a status the queue parser cannot read, and that has now happened $($fix.Prior) times on the same row. The relay has stopped repairing it, because a third repair would hide a real loop rather than fix a typo. The row is in .bidlow/relay/QUEUE.md and the queue is stopped behind it." | Out-Null
            }
        }
        $script:LastTakenRow = $null
    }

    $minutes = [math]::Round(((Get-Date) - $started).TotalMinutes, 1)

    $checkedList = if ($namedFiles.Count -gt 0) { $namedFiles -join ", " } else { "none were named in the brief" }

    # Read the CURRENT file fresh, every cycle, and compare it with what was
    # loaded at launch. Doing the read here rather than once at startup is the
    # whole point: the script can be replaced by a merge at any time DURING a
    # long-running watcher, and that is exactly the case being detected.
    $currentScriptHash = try {
        if ($PSCommandPath) { (Get-FileHash -Path $PSCommandPath -Algorithm SHA256).Hash } else { $null }
    } catch {
        $null
    }
    $stalenessNote = Get-StaleWatcherNote -LoadedHash $script:LoadedScriptHash -CurrentHash $currentScriptHash

    $wrote = Write-CycleLog -Path $logFile -Lines @(
        "# Cycle $cycle - $outcome"
        ""
        $headline
        ""
        $stalenessNote
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
    )

    Save-Status $cycle $outcome $lastSelfQueued
    if ($wrote.Preserved) {
        Write-Line "Cycle $cycle $outcome. The cycle had already written its own log ($($wrote.Bytes) bytes), so the watcher's record was ADDED UNDERNEATH it in $logFile - nothing was overwritten."
    } else {
        Write-Line "Cycle $cycle $outcome. Written to $logFile"
    }

    # -----------------------------------------------------------------------
    # DID THIS CYCLE HAND SOMETHING ON AND THEN NOT QUEUE IT?
    #
    # Runs AFTER the log has been written, because the log file is the richest
    # version of the cycle's own words - richer than $output, which is only the
    # agent's last message on stdout.
    #
    # Only for a cycle that ENDED NORMALLY. A killed or failed cycle has already
    # had its row given back above, and its log is a fragment; reading a handoff
    # out of a half-written sentence would be exactly the cry-wolf failure this
    # is built to avoid.
    # -----------------------------------------------------------------------
    if ($outcome -eq "finished" -or $outcome -eq "no-change") {
        try {
            $logText     = [string](Get-Content $logFile -Raw -Encoding UTF8)
            $rowsAfter   = @(@(Get-QueueRows) | ForEach-Object { [string]$_.Number })
            $handoff     = Get-UnmirroredFindingVerdict -LogText $logText `
                              -RowNumbersBefore $queueRowsBefore -RowNumbersAfter $rowsAfter
            $relativeLog = ".bidlow/relay/log/cycle-{0:d3}.md" -f $cycle

            if ($handoff.ShouldRecord) {
                $carried = Add-QueueRowForHandoff -Cycle $cycle -Passages $handoff.Passages -LogPath $relativeLog

                if ($carried.Added) {
                    Write-Line "Cycle $cycle handed something on in its log and queued no row for it."
                    Write-Line "  Copied its own words into QUEUE.md as row #$($carried.Number), TODO. Nothing was interpreted."
                    @(
                        ""
                        ""
                        "### The relay carried an unqueued finding into QUEUE.md"
                        ""
                        "This cycle's own words say it was handing something on, and it added no new"
                        "row to QUEUE.md before it exited. Nothing downstream reads old cycle logs -"
                        "the one channel every cycle reads is QUEUE.md - so the relay copied the"
                        "sentences below into that file as row #$($carried.Number), status TODO."
                        ""
                        "Not one word of the quoted text is the relay's, and it interpreted none of"
                        "it. If the row turns out not to be worth doing, close it WONTFIX; that costs"
                        "one reading, and a finding stranded in a log costs a whole cycle every time"
                        "somebody has to re-derive it."
                        ""
                        "What was carried:"
                        ""
                    ) | Add-Content -Path $logFile -Encoding utf8
                    @($handoff.Passages) | ForEach-Object { "* $_" } | Add-Content -Path $logFile -Encoding utf8
                } else {
                    # The finding is real and the relay could not carry it. THIS
                    # is worth an email, and the ordinary case is not: a queue row
                    # that arrives by itself needs no announcement, a finding with
                    # nowhere to go does.
                    Write-Line "Cycle $cycle handed something on and queued no row, and the relay could NOT carry it: $($carried.Reason)"
                    Send-RelayAlert "ODoutreach relay - cycle $cycle found something and it is stranded in a log" @"
Cycle $cycle's log says it was handing a finding on to somebody else, and the
cycle added no row to QUEUE.md for it. The relay tried to copy the cycle's own
words into QUEUE.md so the next cycle would meet them, and could not:

$($carried.Reason)

Nothing has been changed and nothing has been lost - but the finding currently
exists only in $relativeLog, and no cycle reads old logs. This is what happened
to cycle 50's E2E finding, which cost cycle 52 its entire reconnaissance.

What the cycle said:

$((@($handoff.Passages) | ForEach-Object { "* $_" }) -join "`n")
"@ | Out-Null
                }
            }
        } catch {
            # Carrying a finding forward must never be the thing that stops the
            # relay taking the next item.
            Write-Line "Could not check whether cycle $cycle left a finding unqueued: $($_.Exception.Message)"
        }
    }

    # Tell Greg AFTER the log exists, so the email can point at something that
    # is already there to read.
    if ($alertSubject) {
        Send-RelayAlert $alertSubject $alertBody | Out-Null
    }

    # -----------------------------------------------------------------------
    # ROW 137: REGENERATE THE CROSS-PROJECT DECK, AFTER THIS CYCLE'S OWN
    # COMMIT (Invoke-CycleAgent above already ran the cycle's own git work) and
    # AFTER the cycle's own log is written, so the deck reflects whatever this
    # cycle actually left behind.
    #
    # Wrapped in its own try/catch on top of Invoke-DeckRegeneration's internal
    # handling - belt and braces, so that even a bug inside this block itself
    # (not just inside the function it calls) cannot stop the relay. See the
    # function's own comment above for why this must never gate anything.
    # -----------------------------------------------------------------------
    try {
        $deckResult = Invoke-DeckRegeneration -ProjectsRoot $ProjectsRoot -DeckScript $DeckScriptPath -OutFile $DeckOutputPath
        if ($deckResult.Ok) {
            Write-Line "Cycle ${cycle} deck regeneration: $($deckResult.Note)"
        } else {
            Write-Line "Cycle ${cycle} deck regeneration did not happen this cycle - $($deckResult.Note)"
        }
        Add-Content -Path $logFile -Value "`n`n## Cross-project deck`n`n$($deckResult.Note)" -Encoding utf8 -ErrorAction SilentlyContinue
    } catch {
        Write-Line "Cycle ${cycle} deck regeneration threw outside Invoke-DeckRegeneration and was swallowed here instead - $($_.Exception.Message)"
    }

    # A cycle ran, so the relay is demonstrably alive: restart the stall clock.
    # Clearing $stallAlerted too means a LATER stall is a new stall and gets its
    # own email - "once per stall", not "once per night".
    $idleSince    = Get-Date
    $stallAlerted = $false

    Start-Sleep -Seconds $SleepSecs
}
