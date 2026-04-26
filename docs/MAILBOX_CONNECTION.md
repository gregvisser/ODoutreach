# Mailbox connection (Microsoft 365 & Google Workspace)

This runbook is for operators wiring **per-mailbox OAuth** on the OpensDoors app. Staff still sign in with **Microsoft Entra** (`AUTH_MICROSOFT_ENTRA_ID_*`). Mailbox OAuth uses **separate** client IDs and redirect URIs.

## Redirect URIs

Set `AUTH_URL` to the public origin (e.g. `https://opensdoors.bidlow.co.uk`). Register these exact callback URLs in each provider:

| Provider   | Redirect URI |
|-----------|---------------|
| Microsoft | `{AUTH_URL}/api/mailbox-oauth/microsoft/callback` |
| Google    | `{AUTH_URL}/api/mailbox-oauth/google/callback` |

Local development: `http://localhost:3000/api/mailbox-oauth/.../callback`.

## Environment variables

See `.env.example` for:

- `MAILBOX_OAUTH_SECRET` — encrypts stored refresh tokens (recommended in production).
- `MAILBOX_MICROSOFT_OAUTH_CLIENT_ID` / `MAILBOX_MICROSOFT_OAUTH_CLIENT_SECRET` / optional `MAILBOX_MICROSOFT_OAUTH_TENANT` (`common` is typical for multi-tenant consent).
- `MAILBOX_GOOGLE_OAUTH_CLIENT_ID` / `MAILBOX_GOOGLE_OAUTH_CLIENT_SECRET`.

## Operator workflow

1. Create a mailbox row on the client page (draft identity, pick provider and email).
2. Ensure env vars and provider registrations are in place; then click **Connect** (or **Reconnect**).
3. **Microsoft 365:** complete sign-in as a user who may act for that mailbox (often the mailbox itself, or a delegate with Full Access / Send As). The Entra app must include delegated **`Mail.Read.Shared`** and **`Mail.Send.Shared`** (plus `Mail.Read` / `Mail.Send`) so Graph can use `/users/{mailbox}/…` for inbox, send, and reply.
4. **Google Workspace:** complete sign-in as the Gmail user for that row unless your organisation has configured a delegation path that makes `users/{email}/profile` succeed for another actor (most tenants still use the mailbox account for 3-legged OAuth).
5. On success, status becomes **Connected**; **Disconnect** removes stored credentials in the app (provider-side token revocation is not implemented in this slice).

See `src/config/mailbox-connection-platform-rules.ts` for the in-repo product rules.

## Audit

Connection prepare, callback outcomes, and disconnect actions append `AuditLog` rows with `entityType` `ClientMailboxIdentity` and structured metadata (`kind` in JSON).
