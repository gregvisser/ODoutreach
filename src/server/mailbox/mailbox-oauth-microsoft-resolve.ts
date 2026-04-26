import "server-only";

import { mailboxEmailsAlign } from "@/server/mailbox/mailbox-oauth-callback-shared";
import { fetchMicrosoftGraphPrimaryEmail } from "@/server/mailbox/microsoft-mailbox-oauth";

const GRAPH = "https://graph.microsoft.com/v1.0";

export type MicrosoftMailboxOAuthResolution = {
  /** Graph object id for the **mailbox row** (target user), not necessarily the OAuth actor. */
  mailboxGraphUserId: string;
  oauthPrimaryEmail: string;
};

/**
 * Validates mailbox OAuth for a `ClientMailboxIdentity` row:
 * - Same-address: OAuth user is the mailbox (classic path).
 * - Delegate/admin-managed: OAuth user can open the target mailbox in Graph
 *   (`/users/{mailbox}/mailFolders/inbox/...`), then we resolve the target's Graph id.
 *
 * Tokens always belong to the Microsoft user who completed OAuth; Graph calls use
 * `/users/{row}/…` so send/reply/inbox target the **declared** mailbox address.
 */
export async function resolveMicrosoftMailboxOAuthConnection(input: {
  accessToken: string;
  mailboxEmailNormalized: string;
}): Promise<MicrosoftMailboxOAuthResolution> {
  const me = await fetchMicrosoftGraphPrimaryEmail(input.accessToken);
  const target = input.mailboxEmailNormalized.trim();
  if (!target) {
    throw new Error("Mailbox row has no normalized email.");
  }

  if (mailboxEmailsAlign(target, me.primaryEmail)) {
    return { mailboxGraphUserId: me.id, oauthPrimaryEmail: me.primaryEmail };
  }

  const inboxUrl = `${GRAPH}/users/${encodeURIComponent(target)}/mailFolders/inbox/messages?$top=1`;
  const inboxRes = await fetch(inboxUrl, {
    headers: { Authorization: `Bearer ${input.accessToken}` },
  });
  if (!inboxRes.ok) {
    const detail = (await inboxRes.text()).slice(0, 800);
    throw new Error(
      `Microsoft sign-in (${me.primaryEmail}) cannot open ${target} in Microsoft Graph (HTTP ${inboxRes.status}). ` +
        `In Exchange Online, grant this user Full Access / Send As (or equivalent) on that mailbox, ensure admin consent includes Mail.Read.Shared and Mail.Send.Shared for the mailbox OAuth app, then reconnect. ` +
        `Provider detail: ${detail}`,
    );
  }

  const userUrl = `${GRAPH}/users/${encodeURIComponent(target)}?$select=id`;
  const userRes = await fetch(userUrl, {
    headers: { Authorization: `Bearer ${input.accessToken}` },
  });
  if (!userRes.ok) {
    const detail = (await userRes.text()).slice(0, 800);
    throw new Error(
      `Microsoft Graph could not resolve directory user ${target} (HTTP ${userRes.status}): ${detail}`,
    );
  }
  const json = (await userRes.json()) as { id?: string };
  if (typeof json.id !== "string" || !json.id) {
    throw new Error(`Microsoft Graph did not return an object id for ${target}.`);
  }
  return { mailboxGraphUserId: json.id, oauthPrimaryEmail: me.primaryEmail };
}
