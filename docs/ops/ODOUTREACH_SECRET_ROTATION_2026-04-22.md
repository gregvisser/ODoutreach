# ODoutreach secret rotation — 2026-04-22

> No secret values appear in this document, in git history, or in any
> committed file. Only metadata about what was rotated.

## Summary

- Prod SHA before: `50631bd`
- Prod SHA after: `50631bd` (no app code changes; docs-only branch will follow)
- Azure Web App: `app-opensdoors-outreach-prod` (rg `rg-opensdoors-outreach-prod`)
- Azure subscription: `Azure subscription 1` (`87959659-a56a-4774-ac44-f96b18905ee2`)
- Operator: `greg@bidlow.co.uk`
- Pre-rotation health: green on both `opensdoors.bidlow.co.uk` and `app-opensdoors-outreach-prod.azurewebsites.net`
- Post-rotation health: green on both hostnames
- Post-rotation `prisma migrate status` (against new `DATABASE_URL`): "Database schema is up to date" (22 migrations)

## Critical finding — `MAILBOX_OAUTH_SECRET` is NOT a plain shared secret

`src/server/mailbox/oauth-crypto.ts` uses the sha256 of `MAILBOX_OAUTH_SECRET`
as the AES-256-GCM key that encrypts every stored mailbox OAuth credential
(`StoredMailboxCredential.encryptedBlob`). Rotating the env value in place
would immediately make every existing mailbox refresh token on every client
undecryptable, effectively disconnecting every connected mailbox across the
platform.

This rotation is therefore marked **BLOCKED / MANUAL** in this run. It
requires a dual-key migration in application code (accept
`MAILBOX_OAUTH_SECRET` OR `MAILBOX_OAUTH_SECRET_NEXT` on decrypt, write only
with the new key) followed by a re-encrypt pass over all
`StoredMailboxCredential` rows, and only then a cut-over. This is a separate
engineering task.

## Setting inventory confirmed (names only)

Present in production App Service at run time:

```
AUTH_MICROSOFT_ENTRA_ID_ID
AUTH_MICROSOFT_ENTRA_ID_ISSUER
AUTH_MICROSOFT_ENTRA_ID_SECRET
AUTH_SECRET
AUTH_URL
DATABASE_URL
GOOGLE_SERVICE_ACCOUNT_JSON_BASE64
INTERNAL_APP_URL
MAILBOX_GOOGLE_OAUTH_CLIENT_ID
MAILBOX_GOOGLE_OAUTH_CLIENT_SECRET
MAILBOX_MICROSOFT_OAUTH_CLIENT_ID
MAILBOX_MICROSOFT_OAUTH_CLIENT_SECRET
MAILBOX_MICROSOFT_OAUTH_TENANT
MAILBOX_OAUTH_SECRET
PROCESS_QUEUE_SECRET
ROCKETREACH_API_KEY
STAFF_EMAIL_DOMAINS
```

Added in this rotation:

```
GOVERNED_TEST_EMAIL_DOMAINS
```

Not present (nothing to rotate):

- `RESEND_WEBHOOK_SECRET`
- `INBOUND_WEBHOOK_SECRET`

## What was rotated successfully

| Setting | How | Old credential | Verification |
|---|---|---|---|
| `AUTH_SECRET` | Crypto-random 48 bytes, base64url, set via ARM PUT to `/config/appsettings`, app restarted | Not a key-id-addressable credential (App Service value replaced) | `/api/health` green on both hostnames after restart |
| `PROCESS_QUEUE_SECRET` | Crypto-random 32 bytes, base64url | As above | As above |
| `AUTH_MICROSOFT_ENTRA_ID_SECRET` | `az ad app credential reset --append` on Entra app "ODoutreach" with `--years 2`, App Service setting updated, app restarted | Old keyId `74ae493c-2b4a-4d4a-8b17-116355958f82` (exp 2027-04-18) **deleted** after verification | `/api/health` green and `/clients` unauth → 307 `/sign-in` |
| `MAILBOX_MICROSOFT_OAUTH_CLIENT_SECRET` | `az ad app credential reset --append` on Entra app "opensdoors-mailbox-microsoft-oauth" with `--years 2`, App Service setting updated, app restarted | Old keyId `1c2b9e54-138c-4613-9fd1-6085b6fc18d3` (exp 2027-04-18) **deleted** after verification | `/api/health` green; mailbox OAuth callback URLs unchanged; no mailbox reconnect required because stored refresh tokens still decrypt (unchanged `MAILBOX_OAUTH_SECRET`) |
| `DATABASE_URL` / Postgres admin password | New 47-char password (crypto-random 32 bytes + complexity prefix) applied via `az postgres flexible-server update --admin-password`; new URL PUT to `/config/appsettings` preserving `?schema=public&sslmode=require`; app restarted | Old admin password overwritten at Azure PG side | `/api/health` green on both hostnames; `npx prisma migrate status` from operator IP reports "Database schema is up to date" |
| `STAFF_EMAIL_DOMAINS` | Explicit value set | Was already present; value now confirmed deliberate | See below |
| `GOVERNED_TEST_EMAIL_DOMAINS` | New setting created | — | See below |

### Remaining Entra credentials (post-rotation)

- `ODoutreach` app: only keyId `4a5af18a-7e81-4b8d-a4e8-2508918d0c1a` (exp 2028-04-22) remains
- `opensdoors-mailbox-microsoft-oauth` app: only keyId `57150a77-95eb-4366-9f6e-76c528651cbb` (exp 2028-04-22) remains

## What was BLOCKED / MANUAL this run

| Setting | Reason | Exact manual steps |
|---|---|---|
| `MAILBOX_OAUTH_SECRET` | Is the AES-256-GCM key for every stored mailbox refresh token. See "Critical finding" above. | Requires dual-key migration in `src/server/mailbox/oauth-crypto.ts` + re-encrypt pass, then cut-over. Do not rotate alone. |
| `MAILBOX_GOOGLE_OAUTH_CLIENT_SECRET` | `gcloud` CLI not installed in this session | Google Cloud Console → APIs & Services → Credentials → select the mailbox OAuth client → "Add Secret" / rotate → copy new value → set in Azure App Service via `az webapp config appsettings set` (or ARM PUT) → restart → `/api/health` → delete old secret in console |
| `GOOGLE_SERVICE_ACCOUNT_JSON_BASE64` | `gcloud` CLI not installed in this session | Google Cloud Console → IAM & Admin → Service Accounts → identify the account (do not print its full email publicly) → Keys → "Add key" → JSON → base64-encode the JSON contents → set in Azure App Service → restart → `/api/health` → delete the old key in console |
| `ROCKETREACH_API_KEY` | No API/portal access from this session | RocketReach dashboard → API keys → generate new key → set in Azure App Service → restart → `/api/health` → revoke old key |

## Explicit env domain values now set

- `STAFF_EMAIL_DOMAINS=bidlow.co.uk,opensdoors.co.uk`
- `GOVERNED_TEST_EMAIL_DOMAINS=bidlow.co.uk,opensdoors.co.uk`

No real-prospect domains were added. `GOVERNED_TEST_EMAIL_DOMAINS` is set to
the same conservative domain list as `STAFF_EMAIL_DOMAINS` until Greg
explicitly approves widening.

## Postgres rotation details

- Server: `pg-opensdoors-outreach-prod-01.postgres.database.azure.com`
- Admin user: `odoutreach`
- DB: `opensdoors_outreach`
- URL params preserved: `?schema=public&sslmode=require`
- Firewall: existing rule `migrate-from-dev-202604162103` for `31.51.168.206` already covered the operator IP; no new temporary rule was added and none was removed.
- `az postgres flexible-server update --admin-password` returned exit code 0 after ~70s.
- Post-restart first `/api/health` call failed with curl timeout (cold start); retried ~60s later and both hostnames returned `{"ok":true,"checks":{"database":"ok"}}`.
- `npx prisma migrate status` confirmed 22 migrations applied and "Database schema is up to date!" against the new URL.

## Production smoke (post-rotation)

- `GET https://opensdoors.bidlow.co.uk/api/health` → `{"ok":true,"service":"opensdoors-outreach","checks":{"database":"ok"}}`
- `GET https://app-opensdoors-outreach-prod.azurewebsites.net/api/health` → same
- `GET /clients` (unauth) → `307 Temporary Redirect` → `/sign-in?callbackUrl=%2Fclients`
- `GET /unsubscribe/not-a-real-token` → `200 OK`, page body renders `<h1>Unsubscribe link is invalid or expired</h1>` with no IDs, no stack trace, no auth redirect.

No send / reply / import / sync / approval / fetch actions were triggered.

## Session hygiene

- All new secret material was kept in PowerShell environment variables of
  the operator session only. No secret value appears in repo, in the
  rotation ledger `.tmp/rotation-ledger.md`, in terminal output, or in any
  committed file.
- Temporary JSON bodies for the ARM `PUT /config/appsettings` calls were
  written to `%TEMP%` (outside the repo) and deleted immediately after.
- All `NEW_*` / `OLD_*` / `ARM_TOKEN` env vars were removed from the
  operator session at the end of this run.

## Risks and notes

- `MAILBOX_OAUTH_SECRET` remains the top outstanding security exposure.
  Because it is present only in App Service configuration (never in git, in
  email bodies, in chat output, or in logs), the exposure is lower than the
  other keys — but it should be treated as "sensitive internal" until the
  dual-key migration lands.
- The Google OAuth client secret, Google service account key, and
  RocketReach API key can only be rotated from their provider consoles.
  Those three are listed above with exact manual steps.
- Because `AUTH_SECRET` rotated, any previously signed-in staff browser
  sessions are invalidated. Next staff load will go through sign-in.
- Mailbox connections are unaffected. Stored refresh tokens are still
  decryptable (unchanged `MAILBOX_OAUTH_SECRET`) and the new
  `MAILBOX_MICROSOFT_OAUTH_CLIENT_SECRET` is used only by the next token
  exchange / refresh call, which Microsoft accepts against whichever
  currently-valid credential is on the app registration.
- No imports, sends, suppression syncs, replies, approvals, or on-demand
  fetches were triggered in this run.

## Remaining manual follow-ups

1. Rotate `MAILBOX_GOOGLE_OAUTH_CLIENT_SECRET` via Google Cloud Console.
2. Rotate `GOOGLE_SERVICE_ACCOUNT_JSON_BASE64` via Google Cloud Console.
3. Rotate `ROCKETREACH_API_KEY` via RocketReach dashboard.
4. Plan and implement dual-key migration for `MAILBOX_OAUTH_SECRET`, then rotate.
5. (Optional) add `GOVERNED_TEST_EMAIL_DOMAINS` real-prospect domains when
   a live-prospect launch is explicitly approved.

## A+ handover blocker status

- App-controlled secrets rotated: cleared
- Microsoft staff SSO client secret rotated: cleared
- Microsoft mailbox OAuth client secret rotated: cleared
- Postgres admin password rotated: cleared
- Explicit staff + governed-test email domains set: cleared
- Google OAuth / Google SA / RocketReach: documented manual follow-ups remain
- `MAILBOX_OAUTH_SECRET`: documented dual-key migration required

The security posture has moved from "B / exception" (pre-rotation) to
"A- / two provider secrets plus one dual-key-migration-gated secret remain
on the manual follow-up list". Full A+ is achievable after the four
remaining items above are closed.
