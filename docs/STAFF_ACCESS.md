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

Successful staff management actions write to **`AuditLog`** with `entityType: "StaffUser"` and JSON `metadata` describing the operation (`invite_sent`, `invite_resent`, `role_change`, `active_change`, `invitation_status_sync`). **Settings → Staff Access** includes a read-only **Recent activity** table (newest first, last 40 entries) so admins can verify actions without opening the database. Full history remains queryable in PostgreSQL as needed.

## Production manual proof (operators)

Step-by-step live verification checklist: **[STAFF_ACCESS_MANUAL_PROOF.md](./STAFF_ACCESS_MANUAL_PROOF.md)**.

## Manual steps that may remain

- Invitee must **accept** the Microsoft invitation email (or redeem via admin-provided link).
- Entra **Conditional Access** / **MFA** policies apply at sign-in as configured in the tenant.
- If Graph permissions are missing, admins see errors from server actions — fix permissions and retry.

## Invitation error classification

Guest-invitation failures from Microsoft Graph are classified by
`src/lib/staff-access/invitation-errors.ts` into stable operator-facing
codes. Raw Graph JSON payloads are never shown in the UI — only a clean
message, the Graph HTTP status, and the Microsoft `request-id` (useful for
tenant admins to correlate with Entra sign-in / audit logs).

| Code | What it means | Admin action |
|------|---------------|--------------|
| `missing_graph_permission` | Graph replied 401/403 `Authorization_RequestDenied` or equivalent. The Entra app registration does not have working invite permissions. | Grant `User.Invite.All` (Application) and admin consent on the ODoutreach Entra app registration. |
| `admin_consent_required` | Graph says admin consent is required. | Grant admin consent for the ODoutreach Entra app registration in the Bidlow tenant. |
| `guest_invitation_not_allowed_by_tenant` | Graph says B2B invitations are disabled by policy. | Enable external collaboration / B2B guest invitations in Entra External Identities. |
| `signed_in_admin_lacks_required_role` | Graph says the signed-in user isn’t allowed to invite. | Assign Guest Inviter / User Administrator, or allow tenant-default guest-invite. |
| `invited_user_already_exists` | The invitee already exists in the tenant. | Use Entra to manage the existing guest, or use **Sync invite status**. |
| `invited_user_email_invalid` | Graph rejected the email address. | Use a valid external email address. |
| `graph_rate_limited` | Graph returned 429. | Wait and retry once. Do not retry in a loop. |
| `graph_service_unavailable` | Graph returned 5xx. | Microsoft-side; check Microsoft 365 service health. |
| `unknown_graph_invite_error` | Everything else. | Share the Microsoft `request-id` with the Bidlow Entra admin. |

The API endpoint used is the supported Microsoft Graph **v1.0**
`POST /invitations` — not `/beta`. If the UI ever shows a Graph `request-id`
referencing an internal `/beta/…` path, that comes from Microsoft’s own
`innerError` payload, not from the ODoutreach code path.
