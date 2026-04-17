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

/** Delegated scopes — identity + refresh; send/reply pipelines will extend scopes later. */
export function microsoftMailboxOAuthScopes(): string {
  return ["offline_access", "openid", "profile", "email", "User.Read"].join(" ");
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
