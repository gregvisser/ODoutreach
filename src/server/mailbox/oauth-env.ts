import "server-only";

import { mailboxOAuthCallbackUrl } from "@/lib/mailbox-oauth-app-url";

export function isMicrosoftMailboxOAuthConfigured(): boolean {
  return Boolean(
    process.env.MAILBOX_MICROSOFT_OAUTH_CLIENT_ID?.trim() &&
      process.env.MAILBOX_MICROSOFT_OAUTH_CLIENT_SECRET?.trim(),
  );
}

export function isGoogleMailboxOAuthConfigured(): boolean {
  return Boolean(
    process.env.MAILBOX_GOOGLE_OAUTH_CLIENT_ID?.trim() &&
      process.env.MAILBOX_GOOGLE_OAUTH_CLIENT_SECRET?.trim(),
  );
}

export function microsoftMailboxOAuthTenant(): string {
  return (
    process.env.MAILBOX_MICROSOFT_OAUTH_TENANT?.trim() || "common"
  );
}

/** Use in tests and app docs — must match `microsoftMailboxOAuthScopes()`. */
export const MICROSOFT_GRAPH_SCOPE_MAIL_READ = "https://graph.microsoft.com/Mail.Read";
export const MICROSOFT_GRAPH_SCOPE_MAIL_SEND = "https://graph.microsoft.com/Mail.Send";
/** Delegated — read mail the signed-in user can reach (shared / delegated mailboxes). */
export const MICROSOFT_GRAPH_SCOPE_MAIL_READ_SHARED =
  "https://graph.microsoft.com/Mail.Read.Shared";
/** Delegated — send mail from mailboxes the signed-in user may send on behalf of. */
export const MICROSOFT_GRAPH_SCOPE_MAIL_SEND_SHARED =
  "https://graph.microsoft.com/Mail.Send.Shared";

/**
 * Delegated scopes — identity + refresh + inbox read + send for Microsoft Graph.
 * `Mail.Read.Shared` / `Mail.Send.Shared` allow a workspace admin to connect a **row**
 * for another mailbox when Exchange Online grants delegate/full-access/send-as rights.
 * Adding or changing Graph scopes requires a mailbox reconnect for fresh consent.
 */
export function microsoftMailboxOAuthScopes(): string {
  return [
    "offline_access",
    "openid",
    "profile",
    "email",
    "User.Read",
    MICROSOFT_GRAPH_SCOPE_MAIL_READ,
    MICROSOFT_GRAPH_SCOPE_MAIL_SEND,
    MICROSOFT_GRAPH_SCOPE_MAIL_READ_SHARED,
    MICROSOFT_GRAPH_SCOPE_MAIL_SEND_SHARED,
  ].join(" ");
}

/** Use in tests and docs — must match `googleMailboxOAuthScopes()`. */
export const GOOGLE_SCOPE_GMAIL_READONLY =
  "https://www.googleapis.com/auth/gmail.readonly";
export const GOOGLE_SCOPE_GMAIL_SEND =
  "https://www.googleapis.com/auth/gmail.send";

/**
 * Delegated scopes — identity + refresh + Gmail read + send.
 * Adding scopes requires a mailbox reconnect so Google issues a refresh token with consent.
 */
export function googleMailboxOAuthScopes(): string {
  return [
    "openid",
    "email",
    "profile",
    GOOGLE_SCOPE_GMAIL_READONLY,
    GOOGLE_SCOPE_GMAIL_SEND,
  ].join(" ");
}

export function mailboxMicrosoftRedirectUri(): string {
  return mailboxOAuthCallbackUrl("microsoft");
}

export function mailboxGoogleRedirectUri(): string {
  return mailboxOAuthCallbackUrl("google");
}
