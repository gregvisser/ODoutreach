/**
 * Mailbox connection — product rules (workspace-admin-managed).
 *
 * Version bumps when the connection semantics change materially.
 */
export const MAILBOX_CONNECTION_PLATFORM_RULES_VERSION = 1;

/**
 * ODoutreach models **client workspace mailboxes** as shared infrastructure:
 * any authorised operator may use the eligible pool after connection; replies stay
 * on the receiving mailbox/thread.
 *
 * **Connection** is performed by an authorised staff user in the UI; that user
 * may be a workspace admin who signs into Microsoft/Google with **their** tenant
 * identity while linking **a declared mailbox row** for the client.
 *
 * - **Microsoft 365:** Delegated Graph tokens still belong to the Microsoft user
 *   who completed OAuth. When that user is **not** the mailbox row address, the
 *   app requires proof they can open the **target** mailbox in Graph (shared
 *   mailbox / delegate / full-access patterns) and uses `/users/{mailbox}/…`
 *   APIs so send/reply/sync use the **row** identity. Tenant admins must grant
 *   the mailbox OAuth app consent for `Mail.Read.Shared` and `Mail.Send.Shared`
 *   (plus base mail scopes) and grant Exchange Online permissions on the target
 *   mailbox where applicable.
 *
 * - **Google Workspace:** Standard 3-legged OAuth can only access the signed-in
 *   Gmail user. Connecting a row for **another** mailbox requires that Google
 *   account to complete OAuth, or a future service-account / domain-wide
 *   delegation integration. The callback probes Gmail `users/{email}/profile`;
 *   failure surfaces an honest operator error (no silent mismatch).
 *
 * The app must **never** claim provider rights it does not have; blocked
 * states should cite missing delegate/send-as or consent, not generic failures.
 */
