# Azure ARM / Azure CLI stability (Windows workstation)

This runbook documents **intermittent failures** talking to `management.azure.com` from a Windows operator machine when using **Azure CLI** (`az webapp`, `az webapp config appsettings list`, `az rest`, etc.) and the **reliable workarounds** that work for ODoutreach production operations.

## Symptoms

- `ConnectionResetError: [WinError 10054] An existing connection was forcibly closed by the remote host` (or similar) from the **Python-based Azure CLI** and sometimes from **curl** (without IPv4).
- A **write** (`az webapp config appsettings set`) can **succeed** while a **read** (`list` / `show`) **fails** in the same window—different code paths, timing, and connection handling.
- **Not** a bug in the ODoutreach app or GitHub Actions (CI often uses a clean Linux path).

## What we confirmed on a problematic workstation (read-only)

| Test | Outcome (example) |
|------|----------------------|
| General HTTPS to `https://www.microsoft.com` | OK (control) |
| `management.azure.com` DNS | Resolves through normal Azure edge / Traffic Manager (CNAME chain to `arm-msedge.net` etc.) |
| `Test-NetConnection management.azure.com -Port 443` | TCP to an **IPv6** address can succeed; that does not guarantee stable **application** traffic on all paths. |
| **`curl.exe -4 --http1.1` + ARM bearer token** to a harmless read (`GET` resource group or `POST` appsettings list) | **Repeated 200s** in a row (stable). |
| **`curl.exe` without `-4`** to the same URL | **Intermittent** `curl: (35) Recv failure: Connection was reset` while other attempts return **200**. |
| **PowerShell `Invoke-RestMethod`** to a simple **GET** of a resource group | **Often** OK, but we also saw flakiness on heavier endpoints (e.g. appsettings) similar to the CLI. |
| **`az webapp show` / `az webapp config appsettings list`** | **Frequently** failed with **10054** while `curl -4` remained stable. |

**Conclusion (strongest hypothesis, not a formal root cause):** traffic to the ARM front door is **sensitive to the network path and HTTP stack** used. On this class of Windows setups, the **default (often dual-stack / high-layer) path used by the Azure CLI’s Python/urllib/requests** can be **unstable** (connection closed mid-request). Forcing **IPv4** and **HTTP/1.1** in `curl.exe` avoids a large share of the resets. The behaviour matches known upstream discussion (e.g. [Azure CLI issue #28139](https://github.com/Azure/azure-cli/issues/28139) and similar **management.azure.com** ECONNRESET reports).

**Proxy / SSL inspection on this host:** `HTTP(S)_PROXY` unset; `netsh winhttp` showed **Direct access (no proxy server).** (Still allow for AV’s localhost filters or per-process hooks.)

## Do / don’t

- **Do** use **Azure Portal** for quick changes when CLI is flaking (same ARM backend; browser stack differs).
- **Do** use **`curl.exe -4 --http1.1`** for **targeted, token-based ARM** calls when you need automation (see repo script `scripts/ops/get-appsetting-safe.ps1`).
- **Do** use **Azure Cloud Shell** or a **small Linux jump box** for long interactive `az` sessions if your corporate Windows path is persistently bad.
- **Do** add **short bounded retries** for `az` (e.g. 3–5 with backoff) for **idempotent** reads; never blindly loop writes.
- **Do** use **`az account get-access-token --resource https://management.azure.com/`** to obtain a token for `curl` (token is a secret: **do not log it** or paste it into issues).

- **Don’t** export or print **full** App Service `appsettings` in logs, tickets, or chat (values often contain **secrets**).
- **Don’t** use `az rest --debug` in shared logs (can leak token material).
- **Don’t** assume a successful **`set`** was followed by a successful **`list`** from the same tool—**verify in Portal** or with **`get-appsetting-safe.ps1`** for **non-secret** names only.

## Recommended operator order (ODoutreach production)

1. **Prefer Azure Portal** for one-off `AUTH_*` / `ALLOWED_ENTRA_TENANT_IDS` edits: App Service → **Configuration** → Application settings → **Save** → wait for **restart** notification.
2. **Verify non-secret values** in the same blade (no need to use CLI to “prove” a read if Portal shows the right two rows).
3. If you need **scripted** confirmation of those **two** values from the shell, run:

   ```powershell
   .\scripts\ops\get-appsetting-safe.ps1 `
     -ResourceGroup "rg-opensdoors-outreach-prod" `
     -AppName "app-opensdoors-outreach-prod" `
     -Names @("AUTH_MICROSOFT_ENTRA_ID_ISSUER","ALLOWED_ENTRA_TENANT_IDS")
   ```

   (Only allowlisted **non-secret** names emit values to the console; extend the allowlist in the script when adding new *documented* safe keys.)
4. If you must use **`az webapp config appsettings set`**, use a **5-attempt** retry; if it still fails, use **Portal**. Never paste secrets in command lines—prefer **Key Vault references** and Portal for secret-bearing keys.

## When to use which tool

| Need | Suggested first choice |
|------|-------------------------|
| Change app settings in prod | **Portal** (low friction, no huge ARM reads) |
| Scripted read of **2–3** known non-secrets | **`get-appsetting-safe.ps1`** (curl `-4` + `POST` list) |
| Interactive ARM exploration | **Cloud Shell** or a **Linux** host with stable `az` |
| CI/CD to Azure | **OIDC in GitHub Actions** (not this Windows shell) — already the happy path in this repo |

## Secret handling

- Treat **all** `appsettings` list responses as **confidential**: download only to a **temp file** that you **delete** after parsing, and never commit.
- The helper script only prints **values** for an explicit **allowlist of non-secret** setting names. To add a new “safe to echo” name, update the allowlist in **`get-appsetting-safe.ps1`** deliberately.
- For **write** of secret-bearing settings, do **not** add echo in scripts; set via **Portal** or **Key Vault** integration.

## Rollback / cleanup

- No persistent state is left by the read script beyond a **temporary JSON** file in `%TEMP%` that is **removed** in a `try/finally`.
- If a bad `az` partial write is suspected, use **Portal** “View history” / redeploy from known good, or re-apply the previous value from your internal runbook (out of band here).

## References (upstream)

- Azure CLI: ECONNRESET / 10054 to `management.azure.com` — e.g. [github.com/Azure/azure-cli issues](https://github.com/Azure/azure-cli/issues?q=ConnectionResetError+10054+management) (various: login, webapp, ARM).

## Revision

- 2026-04-24 — Initial playbook: IPv4+HTTP/1.1 `curl` stable vs flaky dual-stack/CLI; Portal-first for prod edits.
