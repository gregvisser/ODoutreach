# Staff Access (in-app invitations)

Production path for OpensDoors staff:

1. **Microsoft Entra** — single-tenant Bidlow app registration (same as Auth.js).
2. **Guest users** — B2B invitations add external users to the Bidlow tenant.
3. **StaffUser row** — required before sign-in grants app access (no auto-provisioning from invite alone).
4. **Optional domain allowlist** — `STAFF_EMAIL_DOMAINS` must include the invitee’s domain when set (production typically includes **`bidlow.co.uk`** and **`opensdoors.co.uk`**).

Admins manage invitations from **Settings → Staff Access** (`/settings/staff-access`). Only users with **`StaffUser.role === ADMIN`** can open this page or call its server actions.

## Microsoft Graph (application permissions)

On the **same** Entra app registration used for `AUTH_MICROSOFT_ENTRA_ID_*`:

| Permission (Application) | Purpose |
|--------------------------|---------|
| `User.Invite.All` | Create guest invitations (`POST /invitations`) |
| `User.Read.All` | Read guest `externalUserState` when syncing invite status |

**Grant admin consent** for the tenant.

The app requests an **app-only** token (`client_credentials`) with scope `https://graph.microsoft.com/.default`, using `AUTH_MICROSOFT_ENTRA_ID_ID` and `AUTH_MICROSOFT_ENTRA_ID_SECRET`. The tenant id is taken from `AUTH_MICROSOFT_ENTRA_ID_ISSUER` unless `AUTH_TENANT_ID` is set.

## Environment variables

| Variable | Required | Notes |
|----------|----------|--------|
| `AUTH_MICROSOFT_ENTRA_ID_ID` | Yes | Same as sign-in |
| `AUTH_MICROSOFT_ENTRA_ID_SECRET` | Yes | Same as sign-in |
| `AUTH_MICROSOFT_ENTRA_ID_ISSUER` | Yes | Single-tenant v2 issuer URL |
| `AUTH_URL` | Yes | Used to build invite redirect `{AUTH_URL}/sign-in` |
| `AUTH_TENANT_ID` | No | Directory (tenant) GUID override |
| `STAFF_INVITE_REDIRECT_URL` | No | Full URL for guest redemption (overrides `AUTH_URL` + `/sign-in`) |

## What the app does / does not do

- **Does:** Send Graph guest invitations, store invitation metadata on `StaffUser`, resend invites, sync Microsoft-reported invite state, activate/deactivate staff, change roles.
- **Does not:** Skip Entra sign-in, MFA, or `StaffUser` checks; does not make the app multi-tenant; does not auto-create staff for arbitrary Microsoft identities.

## Database

`StaffUser` tracks `guestInvitationState` (`NONE` | `PENDING` | `ACCEPTED`), invitation timestamps, `invitedById`, and Graph ids. Run migrations after deploy: `npm run db:migrate`.

## Audit trail

Successful staff management actions write to **`AuditLog`** with `entityType: "StaffUser"` and JSON `metadata` describing the operation (`invite_sent`, `invite_resent`, `role_change`, `active_change`, `invitation_status_sync`). Query in the database or extend reporting as needed.

## Manual steps that may remain

- Invitee must **accept** the Microsoft invitation email (or redeem via admin-provided link).
- Entra **Conditional Access** / **MFA** policies apply at sign-in as configured in the tenant.
- If Graph permissions are missing, admins see errors from server actions — fix permissions and retry.
