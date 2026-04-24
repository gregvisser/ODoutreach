<#!
  Read selected App Service application settings by name using ARM POST .../config/appsettings/list
  with curl.exe -4 --http1.1 to avoid unstable dual-stack / Azure CLI 10054 resets on some Windows paths.

  - Only prints VALUES for allowlisted non-secret names (edit $NonSecretNamesToDisplay below to extend).
  - For other requested names, prints (present) or (missing) without a value.
  - Does not dump the full settings payload to the host. Temp JSON is deleted in finally.
  - Requires: az login context, az account get-access-token, curl.exe (Windows 10+).

  Example (non-secret only):
  .\get-appsetting-safe.ps1 -ResourceGroup rg-opensdoors-outreach-prod -AppName app-opensdoors-outreach-prod `
    -Names @('AUTH_MICROSOFT_ENTRA_ID_ISSUER','ALLOWED_ENTRA_TENANT_IDS')
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string] $ResourceGroup,
  [Parameter(Mandatory = $true)][string] $AppName,
  [Parameter(Mandatory = $true)][string[]] $Names
)

$ErrorActionPreference = 'Stop'

# Explicit allowlist: values may be echoed. Add new keys only if they are confirmed non-secrets in your ops policy.
$NonSecretNamesToDisplay = [System.Collections.Generic.HashSet[string]]::new(
  [StringComparer]::OrdinalIgnoreCase
)
$null = @(
  'AUTH_MICROSOFT_ENTRA_ID_ISSUER'
  'ALLOWED_ENTRA_TENANT_IDS'
) | ForEach-Object { [void]$NonSecretNamesToDisplay.Add($_) }

$sub = (az account show --query id -o tsv 2>&1)
if ($LASTEXITCODE -ne 0) { throw "az account show failed: $sub" }
$sub = $sub.Trim()

$tok = (az account get-access-token --resource "https://management.azure.com/" --query accessToken -o tsv 2>&1)
if ($LASTEXITCODE -ne 0) { throw "get-access-token failed: $tok" }
# Token is secret: never write to host or log files
$tok = $tok.Trim()

$api = '2022-09-01'
$url = "https://management.azure.com/subscriptions/$sub/resourceGroups/$ResourceGroup/providers/Microsoft.Web/sites/${AppName}/config/appsettings/list?api-version=$api"
$tmp = Join-Path ([System.IO.Path]::GetTempPath()) ("od-arm-as-{0}.json" -f [Guid]::NewGuid().ToString('N'))

try {
  & curl.exe -4 -sS --http1.1 --connect-timeout 45 `
    -X POST -H "Content-Type: application/json" -H "Authorization: Bearer $tok" `
    -d "{}" -o $tmp $url
  if ($LASTEXITCODE -ne 0) { throw "curl failed with exit $LASTEXITCODE" }

  $raw = [System.IO.File]::ReadAllText($tmp)
  if ([string]::IsNullOrWhiteSpace($raw)) { throw "empty ARM response" }
  $j = $raw | ConvertFrom-Json
  if (-not $j.properties) { throw "ARM JSON missing .properties" }

  foreach ($n in $Names) {
    $p = $j.properties
    $v = $null
    if ($p.PSObject.Properties.Name -contains $n) {
      $v = $p.$n
    }
    if ($null -ne $v -and $v -ne '') {
      if ($NonSecretNamesToDisplay.Contains($n)) {
        Write-Output ("{0}={1}" -f $n, $v)
      } else {
        Write-Output ("{0}=(present, value not displayed — not in allowlist)" -f $n)
      }
    } else {
      Write-Output ("{0}=(missing or empty in response)" -f $n)
    }
  }
}
finally {
  if (Test-Path -LiteralPath $tmp) {
    try { Remove-Item -LiteralPath $tmp -Force } catch { }
  }
  # Wipe local reference (defence in depth; token is short-lived)
  $tok = $null
}
