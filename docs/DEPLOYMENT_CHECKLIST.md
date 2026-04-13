# Deployment checklist — GitHub + Azure staging

End-to-end order for **first hosted staging**. Keep secrets out of git; use GitHub/Azure consoles.

## A. Repo hygiene (local)

- [ ] No `.env` committed — only `.env.example` (verify: `git status` does not show `.env`).
- [ ] Run `npm run staging:preflight -- --staging` with a **copy** of staging env (values local only).
- [ ] Stage all intended app files: `git add -A` (review diff — no secrets).
- [ ] Commit: `git commit -m "chore: add outreach app and deployment docs"` (adjust message).

## B. GitHub

- [ ] Create empty private repo — [GITHUB_SETUP.md](./GITHUB_SETUP.md).
- [ ] `git remote add origin …` and `git push -u origin main` (or `master`).
- [ ] (Optional) Add GitHub Actions secrets if CI build requires real Clerk keys.

## C. Azure (manual)

- [ ] PostgreSQL Flexible Server + database + firewall allowing App Service.
- [ ] App Service (Linux, Node 20), deployment from GitHub Actions or manual artifact.
- [ ] Set Application Settings (env vars) — see [AZURE_STAGING_SETUP.md](./AZURE_STAGING_SETUP.md).
- [ ] Run `npm run db:migrate` against Azure DB (pipeline or one-off with `DATABASE_URL`).
- [ ] Deploy application; verify `GET https://<host>/api/health`.

## D. Clerk (staging app)

- [ ] Create staging application in Clerk dashboard.
- [ ] Allowed origins / redirect URLs include `https://<staging-host>`.
- [ ] Keys copied into App Service settings.

## E. Email (optional for full proof)

- [ ] Resend: API key, domain verification, webhook URL `https://<staging-host>/api/webhooks/resend`, signing secret → `RESEND_WEBHOOK_SECRET`.

## F. Queue + verification

- [ ] Schedule drain (cron/Logic App) or worker — [STAGING_ROLLOUT.md](./STAGING_ROLLOUT.md).
- [ ] `npm run staging:verify-health -- https://<staging-host>` (with `PROCESS_QUEUE_SECRET` in local env for queue-status).
- [ ] Run smoke steps in [STAGING_ROLLOUT.md](./STAGING_ROLLOUT.md).

## Rollback

- Revert deployment slot or previous Git commit + redeploy; DB migrations are forward-only — plan backups before risky migrations.
