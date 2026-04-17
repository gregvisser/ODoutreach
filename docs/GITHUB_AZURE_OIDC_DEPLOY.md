# Production deploy: GitHub Actions → Azure (OIDC)

This repo deploys **`app-opensdoors-outreach-prod`** from **`main`** using **OpenID Connect (OIDC)** workload identity federation. **No publish profile** and **no long-lived client secrets** in GitHub for deployment.

Workflow: `.github/workflows/deploy-production.yml`.

## What you need in Azure (one-time)

### 1. Choose an identity

Use **either**:

- **Option A — App registration (service principal)** — common for GitHub Actions; you create an Entra **App registration**, then a **federated credential** for GitHub.
- **Option B — User-assigned managed identity** — federated credential on the managed identity instead of an app registration (see Microsoft docs for “user-assigned managed identity” + GitHub Actions).

The examples below use **Option A** (app registration).

### 2. Record these IDs (non-secret)

You will store them as GitHub **secrets** (names are fixed in the workflow):

| Value | GitHub secret | Where to find it |
|--------|----------------|------------------|
| Directory (tenant) ID | `AZURE_TENANT_ID` | Microsoft Entra ID → Overview |
| Subscription ID | `AZURE_SUBSCRIPTION_ID` | Subscriptions → your subscription |
| Application (client) ID of the deploy identity | `AZURE_CLIENT_ID` | App registration → Overview |

**Known from this repo / naming:**

- Web App name: **`app-opensdoors-outreach-prod`**
- Resource group: **`rg-opensdoors-outreach-prod`**

### 3. Federated credential (GitHub → Entra trust)

In the **App registration** (or managed identity) used for deploy:

1. **Certificates & secrets** (or **Federated credentials** in the portal) → **Add credential**.
2. **Federated credential scenario:** GitHub Actions deploying Azure resources.
3. **Organization:** `gregvisser`
4. **Repository:** `ODoutreach`
5. **Entity type:** Branch.
6. **Branch name:** `main`

This produces a subject like:

`repo:gregvisser/ODoutreach:ref:refs/heads/main`

If you use **workflow_dispatch** only from `main`, the same subject applies when the workflow runs on `refs/heads/main`.

For stricter scoping (optional), use a **GitHub Environment** (e.g. `production`) and a federated credential that matches GitHub’s environment-based subject — adjust the workflow to use `environment:` on the job if you adopt that model.

**Issuer URL** (GitHub OIDC): `https://token.actions.githubusercontent.com`  
(Usually pre-filled when you pick GitHub Actions in the portal.)

### 4. Azure RBAC on the Web App (or resource group)

Grant the deploy identity permission to deploy to the App Service, for example:

- **Contributor** on resource group **`rg-opensdoors-outreach-prod`**, or
- A narrower built-in role scoped to the Web App if your org prefers least privilege (e.g. roles that allow zip deploy / site extension updates — align with your security team).

The identity must be able to run the deployment that **`azure/webapps-deploy`** performs against **`app-opensdoors-outreach-prod`**.

### 5. GitHub repository secrets

In **GitHub → Settings → Secrets and variables → Actions**, create:

| Secret | Description |
|--------|-------------|
| `AZURE_CLIENT_ID` | Application (client) ID of the Entra app or user-assigned managed identity used for OIDC login |
| `AZURE_TENANT_ID` | Microsoft Entra tenant (directory) ID |
| `AZURE_SUBSCRIPTION_ID` | Azure subscription ID containing the Web App |

**Remove after cutover (cleanup):**

- Delete **`AZURE_WEBAPP_PUBLISH_PROFILE`** if it was used previously — it is no longer read by the workflow.

Do **not** commit these values; only store them as secrets.

## SCM Basic Auth (App Service)

Until OIDC deploy is verified end-to-end, you may keep **SCM Basic Auth** / FTP-related settings as they were for emergency access. After a successful OIDC deploy and smoke test, you can **restrict or disable SCM basic authentication** per your security baseline (OIDC deploy does not rely on publish-profile / basic auth for GitHub Actions).

## Verify after setup

1. Push to **`main`** or run **Actions → Deploy production (Azure Web App) → Run workflow** on **`main`**.
2. Confirm the job **Azure login (OIDC)** and **Deploy to Azure Web App** succeed.
3. Check **`GET https://opensdoors.bidlow.co.uk/api/health`** (or your production URL).

## Troubleshooting

- **`AADSTS70021` / federated token**: Subject or issuer on the federated credential does not match the GitHub run (wrong repo, branch, or environment).
- **`Authorization failed` / 403**: RBAC on the subscription or resource group is missing for the deploy identity.
- **Still using old secret**: Ensure **`AZURE_WEBAPP_PUBLISH_PROFILE`** is removed from workflow expectations and deleted from GitHub secrets after cutover to avoid confusion.

## References

- [Azure Login action (OIDC)](https://github.com/Azure/login#login-with-openid-connect-oidc-recommended)
- [Configure federated credentials for GitHub Actions](https://learn.microsoft.com/entra/workload-id/workload-identity-federation-create-trust-github)
- [Azure Web App Deploy action](https://github.com/Azure/webapps-deploy)
