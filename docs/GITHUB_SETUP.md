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

After push, **CI** runs (`.github/workflows/ci.yml`). The **Build** step needs Clerk keys available to GitHub:

| Kind | Name | Where |
|------|------|--------|
| Variable | `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Repo → **Settings** → **Secrets and variables** → **Actions** → **Variables** |
| Secret | `CLERK_SECRET_KEY` | Same → **Secrets** |

Use the **same values as staging** (or a dedicated CI Clerk application). Until these are set, lint + Prisma validate still run; **build** may fail.

Placeholder: Azure deploy automation is **not** in this repo — add a pipeline when your org chooses GitHub Actions → Azure App Service or Azure DevOps.

## What this doc does not do

- Creating the GitHub org/repo (browser only).
- Setting branch protection or required checks (optional follow-up).
