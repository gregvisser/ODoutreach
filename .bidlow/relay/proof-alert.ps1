# Fire a REAL alert, through the watcher's own code path.
#
# This sends an actual email. That is the point: this repository's defining
# defect is things that are built, wired, report success and never fire, and
# the only cure for it is to make the thing fire.
#
# It calls Send-RelayAlert - the same function a timed-out cycle calls - rather
# than hand-writing a `gh` command, because a proof that skips the code under
# test proves nothing about the code under test.
$ErrorActionPreference = "Stop"
. (Join-Path (Split-Path $PSScriptRoot -Parent | Split-Path -Parent) "relay-watch.ps1") -LoadOnly

$armed = Test-AlertPathArmed
Write-Host "Alert path armed: $($armed.Ok) - $($armed.Detail)"
if (-not $armed.Ok) { exit 1 }

$sent = Send-RelayAlert "ODoutreach relay: alerting TEST (nothing is wrong)" @"
This is a test, sent on purpose. Nothing has failed and the relay is fine.

It was sent by the same code that will email you for real when a cycle is
killed for running too long, when one fails, or when the relay stops. If this
message reached you, that path works end to end.

From now on you will get an email when:
  * a cycle runs past 45 minutes and is killed (the relay carries on by itself)
  * a cycle fails or cannot start
  * the relay stops completely
  * the relay refuses to start because its own self-check failed

You will NOT get one when everything is fine.
"@

if ($sent) {
    Write-Host "Dispatched. Now check the run actually succeeded - dispatching is not sending."
    exit 0
}
Write-Host "FAILED to dispatch."
exit 1
