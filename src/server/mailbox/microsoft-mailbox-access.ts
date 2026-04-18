import "server-only";

import { prisma } from "@/lib/db";
import {
  decryptMailboxCredentialJson,
  encryptMailboxCredentialJson,
  type StoredMailboxCredentialV1,
} from "@/server/mailbox/oauth-crypto";
import { refreshMicrosoftMailboxAccessToken } from "@/server/mailbox/microsoft-mailbox-oauth";

const REFRESH_SKEW_MS = 60_000;

/**
 * Returns a valid Graph access token for a connected Microsoft mailbox, refreshing and
 * persisting the encrypted secret when needed.
 */
export async function getMicrosoftGraphAccessTokenForMailbox(
  mailboxIdentityId: string,
): Promise<string> {
  const row = await prisma.mailboxIdentitySecret.findFirst({
    where: { mailboxIdentityId, provider: "MICROSOFT" },
  });
  if (!row) {
    throw new Error("Mailbox has no stored OAuth credentials. Connect the mailbox first.");
  }

  const cred = decryptMailboxCredentialJson(row.encryptedCredential);
  if (!cred.refreshToken?.trim()) {
    throw new Error("Mailbox refresh token missing — disconnect and connect again.");
  }

  const now = Date.now();
  if (
    cred.accessToken &&
    cred.accessTokenExpiresAt != null &&
    cred.accessTokenExpiresAt - REFRESH_SKEW_MS > now
  ) {
    return cred.accessToken;
  }

  const next = await refreshMicrosoftMailboxAccessToken(cred.refreshToken);
  const mergedRefresh = next.refresh_token?.trim() ? next.refresh_token : cred.refreshToken;
  const nextExp: number | null =
    next.expires_in != null
      ? now + next.expires_in * 1000
      : null;

  const v1: StoredMailboxCredentialV1 = {
    v: 1,
    provider: "MICROSOFT",
    refreshToken: mergedRefresh,
    accessToken: next.access_token,
    accessTokenExpiresAt: nextExp,
    scope: next.scope?.trim() ? next.scope : cred.scope,
  };

  await prisma.mailboxIdentitySecret.update({
    where: { mailboxIdentityId: row.mailboxIdentityId },
    data: { encryptedCredential: encryptMailboxCredentialJson(v1) },
  });

  return next.access_token;
}
