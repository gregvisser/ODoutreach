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

/**
 * Delegated scopes — identity + refresh + inbox read + send for Microsoft Graph.
 * Adding or changing Graph scopes (e.g. `Mail.Read`, `Mail.Send`) requires a mailbox reconnect
 * to obtain fresh admin/user consent and refresh token.
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
  ].join(" ");
}

export function googleMailboxOAuthScopes(): string {
  return [
    "openid",
    "email",
    "profile",
    "https://www.googleapis.com/auth/gmail.send",
  ].join(" ");
}

export function mailboxMicrosoftRedirectUri(): string {
  return mailboxOAuthCallbackUrl("microsoft");
}

export function mailboxGoogleRedirectUri(): string {
  return mailboxOAuthCallbackUrl("google");
}
