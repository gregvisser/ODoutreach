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
 * - Google: signature can be read from Gmail send-as and stored on the
 *   mailbox row.
 * - Microsoft: the Graph APIs used by ODoutreach do not provide a reliable
 *   server-side “Outlook signature” read — operators set a signature in
 *   OpensDoors (or use client brief fallback) until a future API path exists.
 *
 * **Unsubscribe**
 * - Every outbound body must include a resolvable unsubscribe URL; sequence
 *   dispatch and one-off contact sends append a standard footer when the
 *   link is not already present. Hosted one-click links and List-Unsubscribe
 *   headers are used when the public app URL is configured.
 */
export const PRODUCTION_PLATFORM_RULES_VERSION = 1 as const;
