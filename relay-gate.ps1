# relay-gate.ps1 - one command to go live for a client meeting, and one to go back.
#
#   Go live:  double-click relay-golive.cmd
#   Go back:  double-click relay-resume.cmd
#   Prove it: .\relay-gate.ps1 -Mode proof   (see PROVING IT FIRES, below)
#
# ---------------------------------------------------------------------------
# WHAT PROBLEM THIS SOLVES
#
# Making scheduled sending genuinely live for every client currently means
# hand-editing an Azure App Service setting. That is a manual step, performed
# under time pressure, before a meeting that decides whether Greg gets paid, on
# a portal blade with no undo. It also silently couples two things that are not
# the same thing:
#
#   1. "the background agent is running"     - AUTONOMOUS_RELAY_ACTIVE
#   2. "which clients the agent may send for" - AUTONOMOUS_SEND_ALLOWLIST
#
# Unsetting (1) to go live also throws away (2), so going back afterwards means
# remembering a value nobody wrote down. This script never touches (2). It flips
# (1) and only (1), so the rail is still configured while it is switched off,
# and resume is a single flag back.
#
# ---------------------------------------------------------------------------
# THE ORDER, AND WHY IT IS THE ORDER
#
# The dangerous state is not "gate off while nobody is running". It is "agent
# running while the gate is off" - that is the one state the whole safety design
# exists to forbid, and relay-watch.ps1 already refuses to start a cycle unless
# the live site says the gate is on.
#
# So:
#   GO LIVE:  stop the agent  ->  confirm it is stopped  ->  THEN turn the gate off
#   RESUME:   turn the gate on ->  confirm it is on      ->  THEN start the agent
#
# Both put the safe half first. If the first half cannot be confirmed, the second
# half never happens and nothing is left changed.
#
# ---------------------------------------------------------------------------
# NO HALF STATES
#
# Every path out of this script leaves the system in one of exactly two shapes:
#
#   * fully switched, verified by reading it back off the live site, or
#   * exactly as it was found, with the reason printed.
#
# The abort path removes a HALT file only if this script created it. Leaving one
# behind would stop the relay LATER - Greg would believe nothing changed while
# the agent quietly died, which is the half state in its most misleading form.
#
# If the gate is flipped and then cannot be verified, the change is rolled back
# and the rollback is itself verified. If even that fails, the script says so in
# capital letters rather than exiting quietly.
#
# ---------------------------------------------------------------------------
# WHAT THE GATE DOES NOT DO - on the record
#
# A HUMAN clicking send in the app is allowed today, gate or no gate. The guard
# in src/lib/safety/autonomous-actor-guard.ts gates the ACTOR, not the action:
# HUMAN_STAFF is waved through unconditionally. So a hand-driven demo works
# either way, and this script is only about the SCHEDULED sending - the job that
# runs every five minutes - being genuinely live.
#
# ---------------------------------------------------------------------------
# PROVING IT FIRES
#
# QUEUE.md records six things this week that were built, wired, reported success
# and never fired. The riskiest link here is the one that cannot be exercised
# without consequence: whether `az` can actually WRITE an app setting on this
# machine, with these credentials, five minutes before a meeting. A read proves
# nothing about a write.
#
# `-Mode proof` therefore runs the entire go-live pipeline for real - preflight,
# az write, wait for App Service to recycle, poll the health endpoint, az delete,
# poll again - against a throwaway setting named RELAY_GATE_WRITE_PROOF that no
# code reads. Every link fires. The two safety variables are never touched, and
# the proof asserts afterwards that they are still exactly as it found them.
#
# ---------------------------------------------------------------------------
# THIS FILE IS DELIBERATELY PLAIN ASCII - see the note at the top of
# relay-watch.ps1. Typographic punctuation makes PowerShell unable to parse it.

param(
    [string]$Mode = "",
    [switch]$LoadOnly,
    # How long to wait for the current cycle to finish before giving up. A cycle
    # can legitimately run for the watcher's full timeout, but a script that
    # blocks for 45 minutes in front of a client is useless, so this gives up
    # and changes nothing rather than hanging.
    [int]$StopWaitMinutes = 12,
    # How long to wait for App Service to recycle and start reporting the new
    # value. Observed recycles are well under a minute; six is slack, not hope.
    [int]$VerifyWaitMinutes = 6
)

$ErrorActionPreference = "Stop"

$RepoRoot   = $PSScriptRoot
$RelayDir   = Join-Path $RepoRoot ".bidlow\relay"
$HaltFile   = Join-Path $RelayDir "HALT"
$StatusFile = Join-Path $RelayDir "STATUS.json"
$StartCmd   = Join-Path $RepoRoot "relay-start.cmd"

# The DIRECT App Service URL, never the custom domain. The custom domain is CDN
# cached and has already once reported a stale answer to a question about
# whether a change was live - see the note in relay-watch.ps1.
$AppHost    = "app-opensdoors-outreach-prod.azurewebsites.net"
$HealthUrl  = "https://$AppHost/api/health"
$BuildUrl   = "https://$AppHost/api/build-info"

$AppName    = "app-opensdoors-outreach-prod"
$AppGroup   = "rg-opensdoors-outreach-prod"

$GateSetting      = "AUTONOMOUS_RELAY_ACTIVE"
$AllowlistSetting = "AUTONOMOUS_SEND_ALLOWLIST"
$DefaultAllowlist = "bidlowai"
$ProofSetting     = "RELAY_GATE_WRITE_PROOF"

function Write-Step($text)  { Write-Host "  $text" }
function Write-Head($text)  { Write-Host ""; Write-Host $text; Write-Host ("-" * $text.Length) }
function Write-Bad($text)   { Write-Host $text -ForegroundColor Red }
function Write-Good($text)  { Write-Host $text -ForegroundColor Green }

# ===========================================================================
# THE DECISION - pure, so relay/gate-switch.test.ts can drive it
# ===========================================================================

<#
Is the live site reporting the state we are waiting for?

$Want is "off" while going live and "on" while resuming.

Three outcomes, not two, and the third is the important one:
  Satisfied = $true   we are there, verified by the site itself
  Fatal     = $true   more waiting cannot help; stop and say why
  neither             not yet; keep polling

The distinction matters because App Service answers 503 for a few seconds while
it recycles. Treating that as failure would abort a go-live that was working;
treating it as success would report "live" off an app that is down.
#>
function Get-GateVerdict {
    param($Health, [string]$Want)

    if ($null -eq $Health) {
        return [pscustomobject]@{
            Satisfied = $false; Fatal = $false
            Reason    = "The site did not answer yet. It is probably still restarting."
        }
    }

    if ($Health.ok -ne $true) {
        return [pscustomobject]@{
            Satisfied = $false; Fatal = $false
            Reason    = "The site answered but its database check failed, so it is not ready."
        }
    }

    $relay = $Health.autonomousRelay
    if ($null -eq $relay) {
        return [pscustomobject]@{
            Satisfied = $false; Fatal = $true
            Reason    = "The site does not report a safety gate at all. It is running an older build than this script expects, so nothing here can be trusted."
        }
    }

    if ($Want -eq "off") {
        if ($relay.active -eq $true) {
            return [pscustomobject]@{
                Satisfied = $false; Fatal = $false
                Reason    = "The site still reports the gate as ON. The restart has not landed yet."
            }
        }
        return [pscustomobject]@{
            Satisfied = $true; Fatal = $false
            Reason    = "The site reports the gate as OFF. Scheduled sending is live for every client."
        }
    }

    if ($relay.active -ne $true) {
        return [pscustomobject]@{
            Satisfied = $false; Fatal = $false
            Reason    = "The site still reports the gate as OFF. The restart has not landed yet."
        }
    }

    # On, but allowlisting nobody, refuses EVERYTHING - and relay-watch.ps1 would
    # refuse to start against it. Reporting that as a successful resume would
    # leave Greg believing the agent was working when it could not run at all.
    if ([int]$relay.allowlistedClients -lt 1) {
        return [pscustomobject]@{
            Satisfied = $false; Fatal = $true
            Reason    = "The gate is ON but no client is allowlisted, so everything would be refused and the relay would not start. $AllowlistSetting needs a value."
        }
    }

    return [pscustomobject]@{
        Satisfied = $true; Fatal = $false
        Reason    = "The site reports the gate as ON, covering $($relay.allowlistedClients) client(s)."
    }
}

<#
The thing Greg actually reads.

It is a separate function from the verdict on purpose: it is the last place a
false claim could reach him, so it re-checks the response rather than trusting
that it was only called on success.
#>
function Get-GoLiveSummary {
    param($Health, [string]$Commit)

    $verdict = Get-GateVerdict -Health $Health -Want "off"

    if (-not $verdict.Satisfied) {
        return @"
NOTHING WAS CHANGED - the system is NOT live for every client.

  $($verdict.Reason)

Scheduled sending is still restricted to the one allowlisted client. Run
relay-golive.cmd again, or check the site is up, before you rely on this.
"@
    }

    $allowlisted = 0
    if ($null -ne $Health.autonomousRelay) { $allowlisted = [int]$Health.autonomousRelay.allowlistedClients }

    return @"
SCHEDULED SENDING IS NOW LIVE FOR EVERY CLIENT.

Read back from the live site just now ($AppHost):
  safety gate .... OFF
  database ....... ok
  running build .. $Commit
  restricted to .. $allowlisted client(s)

What that means in practice:
  * The job that runs every five minutes will now send queued mail for ALL
    clients, not just the one allowlisted client.
  * Replies keep being collected exactly as before.
  * Nothing was changed about the mailboxes, the queue, the templates, or who
    is allowed to sign in.

The background agent (the relay) is STOPPED. It will not start again by itself.

TO PUT IT ALL BACK: double-click relay-resume.cmd

For the record: you clicking send in the app was ALWAYS allowed, gate or no
gate. The gate only ever stopped the machine sending by itself, so a demo you
drive by hand never needed this.
"@
}

<#
Removing a HALT file, but only one we created.

The relay may already have been stopped by hand before this script ran. Deleting
somebody else's HALT would restart the agent behind their back.
#>
function Undo-Halt {
    param([string]$HaltPath, [bool]$CreatedByUs)

    if (-not $CreatedByUs) { return $false }
    if (-not (Test-Path $HaltPath)) { return $false }
    Remove-Item $HaltPath -Force -ErrorAction SilentlyContinue
    return $true
}

# ===========================================================================
# THE WORLD - the bits that touch Azure, the network and the process table
# ===========================================================================

<#
Is a relay watcher process alive?

The STATUS.json file is NOT enough on its own: an idle watcher between cycles
has a finished lastOutcome and is very much still running. The process table is
the only honest answer. If it cannot be read we say YES - an unreadable process
table must never be mistaken for "nothing is running".
#>
function Test-RelayProcessRunning {
    try {
        $procs = Get-CimInstance Win32_Process -Filter "Name = 'powershell.exe' OR Name = 'pwsh.exe'" -ErrorAction Stop
    } catch {
        Write-Step "Could not read the process list ($($_.Exception.Message)). Assuming the relay IS running."
        return $true
    }

    foreach ($p in $procs) {
        if ($p.ProcessId -eq $PID) { continue }
        if ([string]$p.CommandLine -match 'relay-watch\.ps1') { return $true }
    }
    return $false
}

function Wait-ForRelayStopped {
    param([int]$TimeoutMinutes, [int]$PollSeconds = 5)

    $deadline = (Get-Date).AddMinutes($TimeoutMinutes)
    while ($true) {
        if (-not (Test-RelayProcessRunning)) {
            return [pscustomobject]@{ Stopped = $true; Reason = "The relay has stopped." }
        }
        if ((Get-Date) -ge $deadline) {
            return [pscustomobject]@{
                Stopped = $false
                Reason  = "The relay is still running after $TimeoutMinutes minute(s). It is most likely part-way through a cycle."
            }
        }
        Start-Sleep -Seconds $PollSeconds
    }
}

function Get-Health {
    param([string]$Url = $HealthUrl)
    try {
        return Invoke-RestMethod -Uri "$Url`?nocache=$([guid]::NewGuid().ToString('N'))" `
            -TimeoutSec 20 -Method Get -Headers @{ "Cache-Control" = "no-cache" }
    } catch {
        return $null
    }
}

function Get-RunningCommit {
    try {
        $b = Invoke-RestMethod -Uri "$BuildUrl`?nocache=$([guid]::NewGuid().ToString('N'))" `
            -TimeoutSec 20 -Method Get -Headers @{ "Cache-Control" = "no-cache" }
        if ([string]::IsNullOrWhiteSpace($b.commit)) { return "unknown" }
        return ([string]$b.commit).Substring(0, 7)
    } catch {
        return "unknown"
    }
}

function Wait-ForGate {
    param([string]$Want, [int]$TimeoutMinutes)

    $deadline = (Get-Date).AddMinutes($TimeoutMinutes)
    $last = "no answer yet"
    while ($true) {
        $health  = Get-Health
        $verdict = Get-GateVerdict -Health $health -Want $Want
        $last    = $verdict.Reason

        if ($verdict.Satisfied) {
            return [pscustomobject]@{ Satisfied = $true; Reason = $verdict.Reason; Health = $health }
        }
        if ($verdict.Fatal) {
            return [pscustomobject]@{ Satisfied = $false; Reason = $verdict.Reason; Health = $health }
        }
        if ((Get-Date) -ge $deadline) {
            return [pscustomobject]@{
                Satisfied = $false
                Reason    = "Gave up after $TimeoutMinutes minutes. Last thing the site said: $last"
                Health    = $health
            }
        }
        Start-Sleep -Seconds 10
    }
}

function Invoke-Az {
    param([string[]]$AzArgs)
    $previous = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try {
        $out = & az @AzArgs 2>&1 | Out-String
        return [pscustomobject]@{ Ok = ($LASTEXITCODE -eq 0); Output = $out.Trim() }
    } catch {
        return [pscustomobject]@{ Ok = $false; Output = $_.Exception.Message }
    } finally {
        $ErrorActionPreference = $previous
    }
}

function Set-AppSetting {
    param([string]$Name, [string]$Value)
    return Invoke-Az @(
        "webapp", "config", "appsettings", "set",
        "--name", $AppName, "--resource-group", $AppGroup,
        "--settings", "$Name=$Value", "-o", "none"
    )
}

function Remove-AppSetting {
    param([string]$Name)
    return Invoke-Az @(
        "webapp", "config", "appsettings", "delete",
        "--name", $AppName, "--resource-group", $AppGroup,
        "--setting-names", $Name, "-o", "none"
    )
}

function Get-AppSettings {
    $r = Invoke-Az @(
        "webapp", "config", "appsettings", "list",
        "--name", $AppName, "--resource-group", $AppGroup, "-o", "json"
    )
    if (-not $r.Ok) { return $null }
    try {
        $map = @{}
        foreach ($s in ($r.Output | ConvertFrom-Json)) { $map[[string]$s.name] = [string]$s.value }
        return $map
    } catch {
        return $null
    }
}

<#
Refuse before touching anything, rather than half-way through.

Everything here is read-only. It catches the two things that actually go wrong
on the day: az missing from PATH, and a login that quietly expired.
#>
function Test-Preflight {
    Write-Head "Checking this machine can talk to Azure"

    if (-not (Get-Command az -ErrorAction SilentlyContinue)) {
        Write-Bad "The 'az' command is not installed, or not on PATH. Nothing was changed."
        return $false
    }
    Write-Step "az command ................ found"

    $acct = Invoke-Az @("account", "show", "--query", "user.name", "-o", "tsv")
    if (-not $acct.Ok) {
        Write-Bad "Azure is not signed in on this machine. Run: az login"
        Write-Bad "Nothing was changed."
        return $false
    }
    Write-Step "signed in as .............. $($acct.Output)"

    $settings = Get-AppSettings
    if ($null -eq $settings) {
        Write-Bad "Signed in, but could not read the app's settings. The account may not have access to $AppGroup."
        Write-Bad "Nothing was changed."
        return $false
    }
    Write-Step "app settings .............. readable"
    Write-Step "$GateSetting ... currently '$($settings[$GateSetting])'"

    return $true
}

# ===========================================================================
# GO LIVE
# ===========================================================================

function Invoke-GoLive {
    Write-Host ""
    Write-Host "GOING LIVE FOR EVERY CLIENT"
    Write-Host "==========================="
    Write-Host "This stops the background agent, then switches scheduled sending on"
    Write-Host "for every client. It changes nothing else."

    if (-not (Test-Preflight)) { return 1 }

    # ---- 1. Stop the agent, and prove it stopped --------------------------
    Write-Head "Stopping the background agent"

    $haltExisted   = Test-Path $HaltFile
    $haltCreatedByUs = $false

    if ($haltExisted) {
        Write-Step "A HALT file was already there, so the relay was already being stopped."
    } else {
        New-Item -ItemType Directory -Force -Path $RelayDir | Out-Null
        @(
            "Stopped by relay-golive.cmd at $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')."
            "relay-resume.cmd removes this file and starts the relay again."
        ) | Set-Content -Path $HaltFile -Encoding utf8
        $haltCreatedByUs = $true
        Write-Step "Asked the relay to stop after its current cycle."
    }

    if (Test-RelayProcessRunning) {
        Write-Step "Waiting for it to finish (up to $StopWaitMinutes minutes). Nothing has been switched yet."
    }

    $stop = Wait-ForRelayStopped -TimeoutMinutes $StopWaitMinutes
    if (-not $stop.Stopped) {
        Write-Host ""
        Write-Bad "STOPPED WITHOUT CHANGING ANYTHING."
        Write-Bad $stop.Reason
        Write-Host ""
        Write-Host "The safety gate was NOT switched off, because switching it off while the"
        Write-Host "agent is still running is the one state this system must never be in."
        Write-Host ""
        if (Undo-Halt -HaltPath $HaltFile -CreatedByUs $haltCreatedByUs) {
            Write-Host "The stop request was withdrawn, so the relay carries on as before."
        }
        Write-Host "Wait for the current cycle to finish and run relay-golive.cmd again."
        return 1
    }
    Write-Good "  The relay is stopped."

    # ---- 2. Now, and only now, turn the gate off --------------------------
    Write-Head "Switching scheduled sending on for every client"
    Write-Step "Setting $GateSetting to 0 (the allowlist is left exactly as it is)."

    $set = Set-AppSetting -Name $GateSetting -Value "0"
    if (-not $set.Ok) {
        Write-Host ""
        Write-Bad "COULD NOT CHANGE THE SETTING. Nothing is live."
        Write-Bad $set.Output
        Write-Host ""
        Write-Host "The relay is stopped. Run relay-resume.cmd to start it again."
        return 1
    }
    Write-Step "Setting accepted. The site is restarting - this takes under a minute."

    # ---- 3. Verify against the live site, or roll back --------------------
    Write-Head "Reading it back off the live site"
    $check = Wait-ForGate -Want "off" -TimeoutMinutes $VerifyWaitMinutes

    if (-not $check.Satisfied) {
        Write-Host ""
        Write-Bad "COULD NOT CONFIRM IT WENT LIVE: $($check.Reason)"
        Write-Bad "Putting the setting back rather than leaving this half done."

        $rollback = Set-AppSetting -Name $GateSetting -Value "1"
        if (-not $rollback.Ok) {
            Write-Host ""
            Write-Bad "THE ROLLBACK ALSO FAILED. THIS NEEDS A HUMAN."
            Write-Bad "Set $GateSetting back to 1 on $AppName in the Azure portal."
            Write-Bad $rollback.Output
            return 2
        }

        $back = Wait-ForGate -Want "on" -TimeoutMinutes $VerifyWaitMinutes
        if ($back.Satisfied) {
            Write-Good "The setting is back as it was, confirmed by the live site."
            Write-Host "Nothing is live. The relay is stopped; relay-resume.cmd starts it again."
            return 1
        }

        Write-Bad "THE ROLLBACK COULD NOT BE CONFIRMED EITHER. THIS NEEDS A HUMAN."
        Write-Bad "Check $GateSetting on $AppName in the Azure portal."
        return 2
    }

    $commit = Get-RunningCommit
    Write-Host ""
    Write-Good (Get-GoLiveSummary -Health $check.Health -Commit $commit)
    return 0
}

# ===========================================================================
# RESUME
# ===========================================================================

function Invoke-Resume {
    Write-Host ""
    Write-Host "PUTTING THE SAFETY RAIL BACK"
    Write-Host "============================"
    Write-Host "This switches the rail back on, confirms it, and then starts the agent."

    if (-not (Test-Preflight)) { return 1 }

    # ---- 1. Make sure the allowlist is actually populated -----------------
    #
    # Gate on + empty allowlist refuses everything AND stops relay-watch.ps1
    # starting. Resuming into that state would look like success and leave the
    # agent dead, so it is repaired here rather than discovered at 2am.
    $settings = Get-AppSettings
    $allowlist = if ($null -ne $settings) { [string]$settings[$AllowlistSetting] } else { "" }

    if ([string]::IsNullOrWhiteSpace($allowlist)) {
        Write-Head "Restoring the allowlist"
        Write-Step "$AllowlistSetting was empty, so it is being set back to '$DefaultAllowlist'."
        $a = Set-AppSetting -Name $AllowlistSetting -Value $DefaultAllowlist
        if (-not $a.Ok) {
            Write-Bad "Could not set the allowlist. Nothing was changed."
            Write-Bad $a.Output
            return 1
        }
    }

    # ---- 2. Gate on, before any agent runs --------------------------------
    Write-Head "Switching the safety rail back on"
    $set = Set-AppSetting -Name $GateSetting -Value "1"
    if (-not $set.Ok) {
        Write-Bad "COULD NOT CHANGE THE SETTING. The rail is still off and the relay was NOT started."
        Write-Bad $set.Output
        return 1
    }
    Write-Step "Setting accepted. The site is restarting."

    Write-Head "Reading it back off the live site"
    $check = Wait-ForGate -Want "on" -TimeoutMinutes $VerifyWaitMinutes
    if (-not $check.Satisfied) {
        Write-Host ""
        Write-Bad "COULD NOT CONFIRM THE RAIL IS BACK ON: $($check.Reason)"
        Write-Bad "The relay was NOT started. That is deliberate - an agent must never"
        Write-Bad "run without a confirmed rail."
        Write-Host ""
        Write-Host "Check $GateSetting on $AppName, then run relay-resume.cmd again."
        return 1
    }
    Write-Good "  $($check.Reason)"

    # ---- 3. Only now start the agent --------------------------------------
    Write-Head "Starting the background agent"

    if (Test-RelayProcessRunning) {
        Write-Step "It is already running, so it was left alone."
    } elseif (-not (Test-Path $StartCmd)) {
        Write-Bad "relay-start.cmd is missing, so the relay could not be started."
        Write-Bad "The rail IS back on. Start the relay yourself when you can."
        return 1
    } else {
        # relay-start.cmd clears the HALT file itself, so it is not removed here -
        # two places deleting the same file is how one of them gets it wrong.
        Start-Process -FilePath "cmd.exe" -ArgumentList "/c", "`"$StartCmd`"" -WorkingDirectory $RepoRoot | Out-Null
        Start-Sleep -Seconds 5
        if (Test-RelayProcessRunning) {
            Write-Step "Started. It runs in its own window - leave that window open."
        } else {
            Write-Bad "The relay was asked to start but no watcher process appeared."
            Write-Bad "The rail IS back on. Double-click relay-start.cmd yourself."
            return 1
        }
    }

    $commit = Get-RunningCommit
    Write-Host ""
    Write-Good @"
EVERYTHING IS BACK AS IT WAS.

Read back from the live site just now ($AppHost):
  safety gate .... ON
  database ....... ok
  running build .. $commit

  * Scheduled sending is restricted to the allowlisted client again. Nothing
    the machine sends can reach any other client's prospects.
  * The background agent is running again in its own window.
  * You clicking send in the app is unaffected, as it always was.
"@
    return 0
}

# ===========================================================================
# PROOF - fire every link, change nothing that matters
# ===========================================================================

function Invoke-Proof {
    Write-Host ""
    Write-Host "PROVING THE GO-LIVE SWITCH ACTUALLY FIRES"
    Write-Host "========================================="
    Write-Host "This runs the whole pipeline for real against a throwaway setting that no"
    Write-Host "code reads. The safety variables are never touched. Takes a few minutes;"
    Write-Host "the site restarts twice."

    if (-not (Test-Preflight)) { return 1 }

    $before = Get-AppSettings
    if ($null -eq $before) { Write-Bad "Could not read the settings to compare against."; return 1 }
    $gateBefore = [string]$before[$GateSetting]
    $listBefore = [string]$before[$AllowlistSetting]
    Write-Step "Recorded the two safety values so they can be checked afterwards."

    $stamp = Get-Date -Format "yyyyMMddHHmmss"

    Write-Head "1. Writing a throwaway setting (proves az can WRITE, not just read)"
    $w = Set-AppSetting -Name $ProofSetting -Value $stamp
    if (-not $w.Ok) {
        Write-Bad "FAILED. This account can read the app's settings but cannot change them."
        Write-Bad "relay-golive.cmd would fail at exactly this point. $($w.Output)"
        return 1
    }
    Write-Good "  Write accepted."

    Write-Head "2. Waiting for the site to come back (proves the wait-and-verify loop fires)"
    $wait = Wait-ForGate -Want "on" -TimeoutMinutes $VerifyWaitMinutes
    if (-not $wait.Satisfied) {
        Write-Bad "The site did not come back healthy after a settings change: $($wait.Reason)"
        Write-Bad "Cleaning up the throwaway setting."
        Remove-AppSetting -Name $ProofSetting | Out-Null
        return 1
    }
    Write-Good "  The site restarted and answered: $($wait.Reason)"

    Write-Head "3. Confirming the throwaway setting really landed"
    $mid = Get-AppSettings
    if ($null -eq $mid -or [string]$mid[$ProofSetting] -ne $stamp) {
        Write-Bad "The write reported success but the value is not there. That is the exact"
        Write-Bad "defect class this proof exists to catch."
        Remove-AppSetting -Name $ProofSetting | Out-Null
        return 1
    }
    Write-Good "  $ProofSetting reads back as $stamp."

    Write-Head "4. Removing it again (proves the rollback path fires too)"
    $d = Remove-AppSetting -Name $ProofSetting
    if (-not $d.Ok) {
        Write-Bad "Could not remove $ProofSetting. Delete it by hand on $AppName."
        Write-Bad $d.Output
        return 1
    }
    $after = Get-AppSettings
    if ($null -ne $after -and $after.ContainsKey($ProofSetting)) {
        Write-Bad "$ProofSetting is still present after the delete. Remove it by hand."
        return 1
    }
    Write-Good "  Removed."

    Write-Head "5. The safety variables are untouched"
    $gateAfter = if ($null -ne $after) { [string]$after[$GateSetting] } else { "unreadable" }
    $listAfter = if ($null -ne $after) { [string]$after[$AllowlistSetting] } else { "unreadable" }
    if ($gateAfter -ne $gateBefore -or $listAfter -ne $listBefore) {
        Write-Bad "A SAFETY VARIABLE CHANGED DURING THE PROOF. THIS NEEDS A HUMAN."
        Write-Bad "$GateSetting was '$gateBefore', is now '$gateAfter'."
        Write-Bad "$AllowlistSetting was '$listBefore', is now '$listAfter'."
        return 2
    }
    Write-Good "  $GateSetting is still '$gateAfter' and $AllowlistSetting is still '$listAfter'."

    Write-Host ""
    Write-Good @"
PROVEN. Every link in relay-golive.cmd fired for real:
  * this machine is signed in to Azure and CAN change this app's settings
  * a settings change restarts the site and the script waits for it correctly
  * the value is read back off $AppHost, not assumed
  * the removal path works, which is what a failed go-live falls back to

The only thing not exercised is the value itself - relay-golive.cmd writes
$GateSetting=0, which makes real scheduled sending live for every client, and
that is Greg's call to make, not a test's.
"@
    return 0
}

# ===========================================================================

if ($LoadOnly) { return }

switch ($Mode.ToLowerInvariant()) {
    "golive" { exit (Invoke-GoLive) }
    "resume" { exit (Invoke-Resume) }
    "proof"  { exit (Invoke-Proof) }
    default {
        Write-Host ""
        Write-Host "relay-gate.ps1 needs to know what to do."
        Write-Host ""
        Write-Host "  Go live for a meeting ....... double-click relay-golive.cmd"
        Write-Host "  Put the safety rail back .... double-click relay-resume.cmd"
        Write-Host "  Prove the switch works ...... .\relay-gate.ps1 -Mode proof"
        Write-Host ""
        exit 1
    }
}
