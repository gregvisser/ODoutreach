# Azure production — first lean deploy (ODoutreach)

**As deployed in this subscription:** **PostgreSQL Flexible Server** is in **UK South**. **App Service plan**, **Web App**, and **Application Insights** are in **West Europe** (Basic `B1` plan; Node 20 LTS). Cross-region latency applies between app and DB. Production resource **names** below match what exists; secrets stay in App Service configuration or Key Vault — never in git.

| Resource | Name |
|----------|------|
| Resource group | `rg-opensdoors-outreach-prod` |
| PostgreSQL Flexible Server | `pg-opensdoors-outreach-prod-01` (actual name in subscription) |
| App Service plan | `asp-opensdoors-outreach-prod` |
| Web App | `app-opensdoors-outreach-prod` |

**Default hostname:** `https://app-opensdoors-outreach-prod.azurewebsites.net`

Details mirror [AZURE_STAGING_SETUP.md](./AZURE_STAGING_SETUP.md) (Entra-only auth, queue drain external, no Clerk). Use **production** resource names above instead of staging.

## Resource group

If it does not exist yet:

```bash
az group create --name rg-opensdoors-outreach-prod --location uksouth \
  --tags Application=OpensDoors-Outreach Environment=production Project=ODoutreach
```

## PostgreSQL Flexible Server

**Shape (deployed):** PostgreSQL **16**, **Burstable** **`Standard_B2s`**, **32 GiB** storage, **admin user** `odoutreach`, public network access enabled. **Firewall:** a rule **Allow Azure services and resources to access this server** is present (`AllowAllAzureServicesAndResourcesWithinAzureIps_*`, `0.0.0.0`–`0.0.0.0`), so the App Service can reach PostgreSQL without manually adding the web app’s outbound IPs. Add separate rules only if you need access from a fixed admin IP or non-Azure clients.

**Example create (if recreating elsewhere):** Burstable **`Standard_B1ms`** or **`Standard_B2s`** as available.

```bash
az postgres flexible-server create \
  --resource-group rg-opensdoors-outreach-prod \
  --name pg-opensdoors-outreach-prod-01 \
  --location uksouth \
  --admin-user odoutreach \
  --admin-password '<ADMIN_PASSWORD>' \
  --sku-name Standard_B1ms \
  --tier Burstable \
  --storage-size 32 \
  --version 16 \
  --public-access All \
  --tags Application=OpensDoors-Outreach Environment=production Project=ODoutreach
```

If **`az create`** fails with **connection reset / 10054** (proxy or flaky ARM connectivity), create the same server in **Azure Portal** with these settings, or retry from another network.

**App database** (after the server exists):

```bash
az postgres flexible-server db create \
  --resource-group rg-opensdoors-outreach-prod \
  --server-name pg-opensdoors-outreach-prod-01 \
  --database-name opensdoors_outreach
```

**`DATABASE_URL`** (URL-encode special characters in the password; matches `.env.example`):

```text
postgresql://odoutreach:<ADMIN_PASSWORD>@pg-opensdoors-outreach-prod-01.postgres.database.azure.com:5432/opensdoors_outreach?schema=public&sslmode=require
```

## App Service (Linux, Node 20)

**Quota:** If `az appservice plan create` returns **“additional quota”** for **Basic VMs** in **UK South**, request a quota increase in Azure Portal (**Subscriptions → Usage + quotas**) or choose a SKU your subscription allows (e.g. **Premium** tier if quota exists there).

**Actual region for the live app/plan:** **West Europe**. Example CLI (use `--location westeurope` to match what is deployed; UK South was used in drafts when quota allowed):

```bash
az appservice plan create \
  --name asp-opensdoors-outreach-prod \
  --resource-group rg-opensdoors-outreach-prod \
  --location westeurope \
  --is-linux \
  --sku B1

az webapp create \
  --resource-group rg-opensdoors-outreach-prod \
  --plan asp-opensdoors-outreach-prod \
  --name app-opensdoors-outreach-prod \
  --runtime "NODE:20-lts"
```

Set **Startup Command** to `npm run start` (build via GitHub Actions or Oryx as in [AZURE_STAGING_SETUP.md](./AZURE_STAGING_SETUP.md)).

## Microsoft Entra

**Redirect URI (Web):**

```text
https://app-opensdoors-outreach-prod.azurewebsites.net/api/auth/callback/microsoft-entra-id
```

**`AUTH_URL`:** `https://app-opensdoors-outreach-prod.azurewebsites.net` (no trailing slash)

If you add a custom domain later, update Entra redirect URIs and `AUTH_URL` to match the public origin.

## Environment variables

See the table in [AZURE_STAGING_SETUP.md](./AZURE_STAGING_SETUP.md) — same variables; use production URLs and secrets. **Do not** set `AUTOPROCESS_OUTBOUND_QUEUE=true` for production-style operation; use cron/Logic App + `PROCESS_QUEUE_SECRET` for queue drain.
