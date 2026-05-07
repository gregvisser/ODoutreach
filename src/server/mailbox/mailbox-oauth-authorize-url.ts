import "server-only";

import type { MailboxProvider } from "@/generated/prisma/enums";
import { buildGoogleMailboxAuthorizeUrl } from "@/server/mailbox/google-mailbox-oauth";
import { buildMicrosoftMailboxAuthorizeUrl } from "@/server/mailbox/microsoft-mailbox-oauth";

/**
 * Builds the provider authorize URL immediately after persisting `oauthState` on the mailbox row.
 * Used by {@link prepareMailboxOAuthConnection} so the browser navigates straight to Microsoft/Google
 * without an intermediate `/api/mailbox-oauth/.../start` hop (avoids stale reads and middleware edge cases).
 */
export function buildMailboxOAuthAuthorizeUrlForPreparedState(input: {
  provider: MailboxProvider;
  oauthState: string;
  mailboxEmailNormalized: string;
}): string {
  if (input.provider === "MICROSOFT") {
    return buildMicrosoftMailboxAuthorizeUrl(input.oauthState, {
      loginHint: input.mailboxEmailNormalized,
      prompt: "select_account",
    });
  }
  return buildGoogleMailboxAuthorizeUrl(input.oauthState);
}
