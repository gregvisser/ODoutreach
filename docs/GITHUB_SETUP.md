# GitHub setup — new remote and first push

Use this once the working tree is committed locally (see [DEPLOYMENT_CHECKLIST.md](./DEPLOYMENT_CHECKLIST.md)).

## 1. Create an empty repository on GitHub

1. GitHub → **New repository**.
2. Name (e.g. `ODoutreach` or `opensdoors-outreach`).
3. **Private** recommended (internal operations app).
4. Do **not** add README, `.gitignore`, or license (this repo already has them).

## 2. Add the remote (replace URL)

```bash
cd C:\Bidlowprojects\BidlowClients\Opensdoors\ODoutreach
git remote add origin https://github.com/<org>/<repo>.git
# or SSH: git@github.com:<org>/<repo>.git
git remote -v
```

If `origin` already exists and is wrong:

```bash
git remote remove origin
git remote add origin https://github.com/<org>/<repo>.git
```

## 3. Branch name (optional)

GitHub’s default branch is often `main`:

```bash
git branch -M main
```

## 4. First push

```bash
git push -u origin main
```

If you stayed on `master`:

```bash
git push -u origin master
```

## 5. GitHub Actions (CI)

After push, **CI** runs (`.github/workflows/ci.yml`). The **Build** step uses **placeholder** `AUTH_*` environment variables defined in the workflow file so the Next.js build succeeds **without** storing real Entra secrets in GitHub. No Clerk or Entra secrets are required in GitHub for CI to pass.

For **deploying** the app to Azure App Service, configure real `AUTH_*` values in **Azure Application settings** (or your deployment pipeline), not necessarily in GitHub.

**Production deploy (GitHub Actions):** `.github/workflows/deploy-production.yml` builds on `ubuntu-latest` and deploys to **`app-opensdoors-outreach-prod`** using **`azure/webapps-deploy@v3`**. Add repository secret **`AZURE_WEBAPP_PUBLISH_PROFILE`** whose value is the full contents of the Web App **Download publish profile** file (`.PublishSettings` XML) from Azure Portal. Entra and DB secrets stay in Azure App Service configuration only.

## What this doc does not do

- Creating the GitHub org/repo (browser only).
- Setting branch protection or required checks (optional follow-up).
