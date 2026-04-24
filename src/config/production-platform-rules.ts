/**
 * Central reference for production behaviour (no secrets). These rules are
 * enforced in code across auth, mailboxes, sends, and UI — this module is
 * documentation + stable identifiers for tests and future refactors.
 *
 * **Authentication**
 * - Staff sign in with Microsoft (Entra / Microsoft 365). MFA is entirely
 *   the tenant’s responsibility (Conditional Access), not reimplemented here.
 * - A `StaffUser` row (and optional `STAFF_EMAIL_DOMAINS`) gates app access
 *   after OAuth succeeds.
 * - Multi-tenant sign-in: set `AUTH_MICROSOFT_ENTRA_ID_ISSUER` to the
 *   `common` or `organizations` v2.0 endpoint and set
 *   `ALLOWED_ENTRA_TENANT_IDS` to the directory UUIDs that may use this app
 *   (e.g. Bidlow and OpensDoors). Single-tenant issuer URLs keep the
 *   previous one-tenant match on `profile.tid`.
 * - B2B guest **invitation** in Staff Access is optional: operators can be
 *   pre-provisioned in the database and sign in directly with their home
 *   tenant credentials when the app and Entra app registration allow it.
 *
 * **Mailboxes**
 * - Any authorised operator on a client workspace may use any eligible
 *   connected mailbox for that client (shared pool), subject to per-mailbox
 *   send limits and governance. Replies stay on the receiving mailbox/thread.
 *
 * **Signatures**
 * - Google Workspace: `users.settings.sendAs` is read and stored on the
 *   mailbox row (“Sync from Gmail” in the UI) when the operator requests it.
 * - Microsoft 365: the supported Graph path in this app does not expose a
 *   server-side Outlook signature. Operators set a plain-text (or HTML)
 *   signature in OpensDoors, or the send path may use a legacy client-brief
 *   fallback. Do not claim automatic Outlook signature pull in product copy.
 *
 * **Unsubscribe**
 * - Composition builds the final body with template + mailbox/brief
 *   signature first; `ensureUnsubscribeLinkInPlainTextBody` then appends a
 *   resolvable footer when the URL is not already present, so the unsubscribe
 *   line always comes after the signature in production sends. Sequence
 *   dispatch, one-off contact sends, and the outbound worker all use this
 *   pattern. Hosted one-click and List-Unsubscribe header metadata apply when
 *   the public app base URL is configured.
 */
export const PRODUCTION_PLATFORM_RULES_VERSION = 1 as const;
