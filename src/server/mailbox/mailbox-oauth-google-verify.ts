import "server-only";

import { normalizeEmail } from "@/lib/normalize";
import { mailboxEmailsAlign } from "@/server/mailbox/mailbox-oauth-callback-shared";

/**
 * Google 3-legged mailbox OAuth: the refresh token is for the Google user who
 * consented. That user must be able to call Gmail API as the **row** mailbox.
 *
 * - Same Google account as the row → always allowed.
 * - Otherwise we probe `users/{row}/profile`. This succeeds only when Google has
 *   granted the token access to that mailbox (e.g. some admin-delegation setups);
 *   typical Workspace installs still need the mailbox account to complete OAuth.
 */
export async function verifyGoogleMailboxOAuthForWorkspaceRow(input: {
  accessToken: string;
  mailboxEmailNormalized: string;
  oauthUserEmail: string;
}): Promise<void> {
  if (mailboxEmailsAlign(input.mailboxEmailNormalized, input.oauthUserEmail)) {
    return;
  }
  const url = `https://gmail.googleapis.com/gmail/v1/users/${encodeURIComponent(input.mailboxEmailNormalized)}/profile`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${input.accessToken}` },
  });
  if (res.ok) {
    return;
  }
  const oauth = normalizeEmail(input.oauthUserEmail);
  throw new Error(
    `This Google sign-in (${oauth}) cannot access Gmail for ${input.mailboxEmailNormalized}. ` +
      `Use Connect while signed into that mailbox in Google, or configure Google Workspace domain-wide delegation if your organisation uses service-account impersonation for admin-managed connections.`,
  );
}
