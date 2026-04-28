# Client-assisted mailbox OAuth (operators + mailbox owners)

ODoutreach is operated by **OpensDoors staff**. **End clients do not log into ODoutreach** unless they are also hired as operators.

## Model

| Concern | Who |
|--------|-----|
| ODoutreach sign-in (Staff Access) | Staff users with a `StaffUser` row |
| Starting mailbox Connect / managing rows | Authorised staff per client (ADMIN/MANAGER globally, or OPERATOR with LEAD/CONTRIBUTOR on that client) |
| Microsoft / Google provider sign-in + MFA | The **mailbox owner** or their **tenant admin** (or a delegate with rights to that mailbox) |
| Stored OAuth tokens | **`ClientMailboxIdentity` / `MailboxIdentitySecret`** for the **workspace mailbox row** — not the staff user’s personal identity |

Staff **start** the flow (prepare OAuth state on the row). Anyone who completes the provider redirect can finish Microsoft/Google consent **without** being a Staff user: the callback links the authorization code to the mailbox row using the signed **`state`** parameter.

## Microsoft 365

- App registration should allow sign-in from the **correct tenant(s)** for client mailboxes. Use **`common`** (default in code when `MAILBOX_MICROSOFT_OAUTH_TENANT` is unset) for multi-tenant consent **when** the Entra app is registered as multi-tenant and admin consent is in place.
- If sign-in is restricted to a **single tenant** (e.g. only Bidlow), users from another organisation will see **AADSTS50020**. Fix: multi-tenant app + `common`, or a tenant-specific authority only when **all** client mailboxes live in that tenant.
- **Delegated** shared mailbox access still requires **Exchange** permissions (Full Access / Send As) when the signing-in user is not the primary SMTP address — unchanged from product behavior.

## Google Workspace

- Typically the **Google user for that mailbox** signs in. Domain-wide delegation is an organisation-level prerequisite if you use a different model; ODoutreach does not replace Workspace admin setup.

## Operator steps

1. Staff adds the mailbox row (address + provider) on **Mailboxes**.
2. Staff clicks **Connect** (or **Complete sign-in** if pending).
3. **Mailbox owner or admin** completes Microsoft/Google sign-in and MFA in the browser window.
4. Staff confirms **Connected** and sets **per-mailbox signature** before production sends.

Do **not** share passwords; use provider consent and MFA.

## Phase 2 (future)

- Stricter **tenant allowlists** for multi-tenant mailbox apps (validate `tid` from token vs client policy).
- Optional **magic-link** / long-lived connect URL for owner-only devices (security design TBD).
