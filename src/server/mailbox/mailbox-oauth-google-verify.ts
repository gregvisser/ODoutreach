import "server-only";

import { normalizeEmail } from "@/lib/normalize";
import {
  MailboxOAuthAccountMismatchError,
  mailboxEmailsAlign,
} from "@/server/mailbox/mailbox-oauth-callback-shared";

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
  // Names both addresses. Whoever reads this — banner, row diagnostics or audit
  // trail — must be able to see which account approved and which one was asked
  // for, or they cannot act on it.
  throw new MailboxOAuthAccountMismatchError(
    normalizeEmail(input.oauthUserEmail),
    input.mailboxEmailNormalized,
  );
}
