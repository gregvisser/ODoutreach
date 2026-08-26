# relay-install-task.ps1 - make the relay start itself again after a reboot.
#
#   Install it:  .\relay-install-task.ps1
#   Remove it:   .\relay-install-task.ps1 -Remove
#   Check it:    .\relay-install-task.ps1 -Check
#
# Run it ONCE. It does not need an administrator; it registers a task that runs
# as you, in your own session, so the relay window appears exactly as it does
# when you start it by hand.
#
# ---------------------------------------------------------------------------
# WHAT PROBLEM THIS SOLVES
#
# The relay lives in a PowerShell window. Windows reboots for updates overnight,
# the window goes, and the run simply ends - with nothing said, at the exact
# moment nobody is watching. This makes a reboot cost a few minutes instead of
# the rest of the night.
#
# ---------------------------------------------------------------------------
# WHY IT DOES NOT USE relay-start.cmd
#
# relay-start.cmd DELETES the HALT file, which is right when you double-click it
# (a leftover HALT is a silent reason the relay refuses to start) and wrong for
# a machine that restarts on its own. HALT is how the relay says "stop" - it
# writes one itself when it hits the cycle limit or finds the safety gate off.
# A reboot that quietly cleared it would restart a relay that had deliberately
# stopped, unattended, and that is how you get a runaway.
#
# So this starts the watcher directly. If you stopped the relay, it stays
# stopped through a reboot. That is deliberate.
# ---------------------------------------------------------------------------
#
# THIS FILE IS DELIBERATELY PLAIN ASCII - see the note at the top of
# relay-watch.ps1.

param(
    [switch]$Remove,
    [switch]$Check,
    [switch]$Prove
)

$ErrorActionPreference = "Stop"

$TaskName = "BidlowRelayWatcher"
$RepoRoot = $PSScriptRoot
$Watcher  = Join-Path $RepoRoot "relay-watch.ps1"

function Show-Task {
    $task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    if (-not $task) {
        Write-Host "NOT INSTALLED. The relay will not restart itself after a reboot."
        return $false
    }

    $info = Get-ScheduledTaskInfo -TaskName $TaskName -ErrorAction SilentlyContinue
    Write-Host "INSTALLED."
    Write-Host "  Name        : $($task.TaskName)"
    Write-Host "  State       : $($task.State)"
    Write-Host "  Runs as     : $($task.Principal.UserId)"
    Write-Host "  Starts on   : $(($task.Triggers | ForEach-Object { $_.CimClass.CimClassName }) -join ', ')"
    Write-Host "  Runs        : $($task.Actions[0].Execute) $($task.Actions[0].Arguments)"
    if ($info) {
        Write-Host "  Last run    : $($info.LastRunTime) (result $($info.LastTaskResult))"
    }
    return $true
}

if ($Check) {
    $installed = Show-Task
    if ($installed) { exit 0 } else { exit 1 }
}

# ---------------------------------------------------------------------------
# -Prove : does Windows actually LAUNCH it, or was the registration just
#          politely accepted?
#
# "The task is in the list" and "the task starts the relay" are different
# claims, and only the first one is easy. A wrong working directory, a blocked
# execution policy or a principal that cannot reach the desktop all look
# perfectly healthy in the task list and do nothing at logon.
#
# This cannot simply run the real task: that would start a SECOND relay
# alongside a running one, and the two would take the same queue item twice.
# So it registers an identical twin pointing at the watcher's -LoadOnly mode,
# which loads the script and returns without touching a single file, runs THAT,
# and reads the exit code back out of Windows. Same launcher, same arguments,
# same account, same folder - and nothing happens.
# ---------------------------------------------------------------------------
if ($Prove) {
    $proofName = "$TaskName" + "Proof"
    $userId    = "$env:USERDOMAIN\$env:USERNAME"

    Write-Host "Registering a temporary, inert twin of the task and running it..."
    Write-Host ""

    $proofAction = New-ScheduledTaskAction `
        -Execute "powershell.exe" `
        -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$Watcher`" -LoadOnly" `
        -WorkingDirectory $RepoRoot
    $proofPrincipal = New-ScheduledTaskPrincipal -UserId $userId -LogonType Interactive -RunLevel Limited
    $proofSettings  = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries

    try {
        Register-ScheduledTask -TaskName $proofName -Action $proofAction `
            -Principal $proofPrincipal -Settings $proofSettings -Force | Out-Null

        Start-ScheduledTask -TaskName $proofName

        $deadline = (Get-Date).AddSeconds(90)
        $result   = $null
        while ((Get-Date) -lt $deadline) {
            Start-Sleep -Seconds 2
            $state = (Get-ScheduledTask -TaskName $proofName).State
            $info  = Get-ScheduledTaskInfo -TaskName $proofName
            if ($state -eq "Ready" -and $info.LastTaskResult -ne 267009) {
                $result = $info.LastTaskResult
                break
            }
        }

        if ($null -eq $result) {
            Write-Host "FAILED: it was still running after 90 seconds. Windows started it but it did not finish."
            exit 1
        }
        if ($result -ne 0) {
            Write-Host "FAILED: Windows ran it and it exited with $result."
            Write-Host "The task is registered but would NOT start the relay at logon."
            exit 1
        }

        Write-Host "PROVEN: Windows started it and it exited cleanly (result 0)."
        Write-Host "The scheduling, the folder, the execution policy and the account all work."
        Write-Host "Nothing was changed - the twin ran the watcher in load-only mode."
    } finally {
        Unregister-ScheduledTask -TaskName $proofName -Confirm:$false -ErrorAction SilentlyContinue
    }
    exit 0
}

if ($Remove) {
    if (-not (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue)) {
        Write-Host "Nothing to remove - '$TaskName' is not installed."
        exit 0
    }
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
    Write-Host "Removed '$TaskName'. The relay will no longer start itself after a reboot."
    Write-Host "You can still start it by hand with relay-start.cmd."
    exit 0
}

if (-not (Test-Path $Watcher)) {
    Write-Host "Cannot find relay-watch.ps1 next to this script, so there is nothing to schedule."
    Write-Host "Run this from inside the repository folder."
    exit 1
}

$userId = "$env:USERDOMAIN\$env:USERNAME"

$action = New-ScheduledTaskAction `
    -Execute "powershell.exe" `
    -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$Watcher`"" `
    -WorkingDirectory $RepoRoot

$trigger = New-ScheduledTaskTrigger -AtLogOn -User $userId

# Interactive, not Highest: this needs your session so the window is visible,
# and it does not need administrator rights. Asking for rights it does not need
# is how a task ends up being one people turn off.
$principal = New-ScheduledTaskPrincipal -UserId $userId -LogonType Interactive -RunLevel Limited

$settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -MultipleInstances IgnoreNew `
    -RestartCount 3 `
    -RestartInterval (New-TimeSpan -Minutes 5) `
    -ExecutionTimeLimit ([TimeSpan]::Zero)

# The three settings that matter, and what each one is stopping:
#
#  MultipleInstances IgnoreNew - two relays sharing one queue would take the
#      same item twice and race each other writing QUEUE.md. A second logon
#      must not start a second relay.
#  ExecutionTimeLimit zero     - the default is three days. A task that quietly
#      kills the relay after three days is the same class of defect as the hang
#      this whole cycle is about, just slower.
#  RestartCount 3              - if the watcher dies outright, try again rather
#      than wait for a human. The relay's own HALT file still wins: it exits
#      immediately when it sees one, so this cannot fight a deliberate stop.

Register-ScheduledTask `
    -TaskName  $TaskName `
    -Action    $action `
    -Trigger   $trigger `
    -Principal $principal `
    -Settings  $settings `
    -Description "Starts the ODoutreach relay watcher when Greg logs on, so a reboot does not silently end an overnight run." `
    -Force | Out-Null

Write-Host ""
Write-Host "Registered. Reading it back to check it is really there:"
Write-Host ""

# Never report an install without reading it back. This repository has recorded
# eight cases of something reporting success and never firing; a task that was
# accepted and not stored would be the ninth.
if (-not (Show-Task)) {
    Write-Host ""
    Write-Host "Windows accepted the registration but the task is not there. Nothing is scheduled."
    exit 1
}

Write-Host ""
Write-Host "The relay will now start on its own the next time you log on."
Write-Host "If you stop it with a HALT file, it stays stopped - a reboot will not undo that."
Write-Host "To undo this: .\relay-install-task.ps1 -Remove"
