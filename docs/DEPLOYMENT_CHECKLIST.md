# Deployment checklist — GitHub + Azure

End-to-end order for **first hosted staging**. For **lean first production** (UK South resource names, Entra, env vars), see [AZURE_PRODUCTION_FIRST_DEPLOY.md](./AZURE_PRODUCTION_FIRST_DEPLOY.md). Keep secrets out of git; use GitHub/Azure consoles.

## A. Repo hygiene (local)

- [ ] No `.env` committed — only `.env.example` (verify: `git status` does not show `.env`).
- [ ] Run `npm run staging:preflight -- --staging` with a **copy** of staging env (values local only).
- [ ] Stage all intended app files: `git add -A` (review diff — no secrets).
- [ ] Commit: `git commit -m "chore: add outreach app and deployment docs"` (adjust message).

## B. GitHub

- [ ] Create empty private repo — [GITHUB_SETUP.md](./GITHUB_SETUP.md).
- [ ] `git remote add origin …` and `git push -u origin main` (or `master`).
- [ ] Production deploy OIDC: [GITHUB_AZURE_OIDC_DEPLOY.md](./GITHUB_AZURE_OIDC_DEPLOY.md) — federated credential + `AZURE_CLIENT_ID` / `AZURE_TENANT_ID` / `AZURE_SUBSCRIPTION_ID`; remove `AZURE_WEBAPP_PUBLISH_PROFILE` after cutover.

## C. Azure (manual)

- [ ] PostgreSQL Flexible Server + database + firewall allowing App Service.
- [ ] App Service (Linux, Node 20), deployment from GitHub Actions or manual artifact.
- [ ] Set Application Settings (env vars) — see [AZURE_STAGING_SETUP.md](./AZURE_STAGING_SETUP.md).
- [ ] Run `npm run db:migrate` against Azure DB (pipeline or one-off with `DATABASE_URL`).
- [ ] Deploy application; verify `GET https://<host>/api/health`.

## D. Microsoft Entra (staging app registration)

- [ ] Register app in Entra ID; add **Web** redirect `https://<staging-host>/api/auth/callback/microsoft-entra-id` (see [AZURE_STAGING_SETUP.md](./AZURE_STAGING_SETUP.md)).
- [ ] Copy client ID, tenant issuer URL, create client secret → `AUTH_MICROSOFT_ENTRA_ID_*` + `AUTH_SECRET` + `AUTH_URL` in App Service (`AUTH_URL` must match `https://<staging-host>`).
- [ ] Staff access: ensure **`StaffUser`** rows (and domains if using `STAFF_EMAIL_DOMAINS`) for staging testers — not automatic from Entra alone.

## E. Email (optional for full proof)

- [ ] Resend: API key, domain verification, webhook URL `https://<staging-host>/api/webhooks/resend`, signing secret → `RESEND_WEBHOOK_SECRET`.

## F. Queue + verification

- [ ] Schedule drain (cron/Logic App) or worker — [STAGING_ROLLOUT.md](./STAGING_ROLLOUT.md).
- [ ] `npm run staging:verify-health -- https://<staging-host>` (with `PROCESS_QUEUE_SECRET` in local env for queue-status).
- [ ] Run smoke steps in [STAGING_ROLLOUT.md](./STAGING_ROLLOUT.md).

## Rollback

- Revert deployment slot or previous Git commit + redeploy; DB migrations are forward-only — plan backups before risky migrations.
