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
5. On success, status becomes **Connected**; **Disconnect** revokes the in-app token row only (it does not delete the mailbox address from the client).

### Remove vs Disconnect

- **Disconnect** — clears OAuth for that mailbox row; the address stays in the workspace list so you can **Connect** again. Use when you only need to rotate consent or sign in as a different delegate.
- **Remove from workspace** — soft-archives the address: secrets are removed, the row is marked removed, and it is excluded from the send/reply/inbox/signature pool. **Outbound, inbound, and audit history in OpensDoors are preserved** (no hard delete of `ClientMailboxIdentity` while dependent rows exist). Use **Restore to workspace** to bring the address back; you must **Connect** again after restore.

### Reconsent when scopes change

If new delegated scopes are added to the Entra app (e.g. shared mailboxes), existing connections may need **Reconnect** so users consent to the full scope set.

## Exchange / Google prerequisites (outside the app)

- **Microsoft:** delegated Graph access to the *target* mailbox still requires the right **Exchange Online** mailbox permissions (e.g. Full Access, **Send As** or **Send on behalf** for the account that signs in) — the app cannot grant those.
- **Google:** default 3-leg OAuth is **mailbox-user based**; domain-wide delegation or a service account model is a separate org setup (not implied by normal Connect).

See `src/config/mailbox-connection-platform-rules.ts` for the in-repo product rules.

## Audit

Connection prepare, callback outcomes, and disconnect actions append `AuditLog` rows with `entityType` `ClientMailboxIdentity` and structured metadata (`kind` in JSON).
