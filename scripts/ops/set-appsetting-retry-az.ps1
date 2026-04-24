<#!
  Thin wrapper: az webapp config appsettings set with bounded retries for flaky Windows/ARM 10054.

  - Pass only the settings you need (e.g. two non-secret name=value pairs). Do not put secrets in CI logs.
  - If all retries fail, the script exits non-zero: complete the change in Azure Portal instead.
  - Does not print the entire appsettings list after the operation.

  Example:
  .\set-appsetting-retry-az.ps1 -ResourceGroup rg-opensdoors-outreach-prod -AppName app-opensdoors-outreach-prod -Retries 5 `
    -Settings @(
      'AUTH_MICROSOFT_ENTRA_ID_ISSUER=https://login.microsoftonline.com/common/v2.0',
      'ALLOWED_ENTRA_TENANT_IDS=tenant-a,tenant-b'
    )
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string] $ResourceGroup,
  [Parameter(Mandatory = $true)][string] $AppName,
  [Parameter(Mandatory = $true)][string[]] $Settings,
  [int] $Retries = 5,
  [int] $DelaySeconds = 3
)

$ErrorActionPreference = 'Continue'
$ok = $false
for ($i = 1; $i -le $Retries; $i++) {
  $args = @('webapp', 'config', 'appsettings', 'set', '-g', $ResourceGroup, '-n', $AppName, '--settings') + $Settings
  $err = & az @args 2>&1
  if ($LASTEXITCODE -eq 0) { $ok = $true; break }
  if ($i -lt $Retries) { Start-Sleep -Seconds $DelaySeconds }
}
if (-not $ok) {
  Write-Error "az webapp config appsettings set failed after $Retries attempts. Use Azure Portal. Last: $err" -ErrorAction Stop
  exit 1
}
Write-Output "ok (az exit 0 on attempt) — verify non-secret values with get-appsetting-safe.ps1 or Portal; do not log secrets."
