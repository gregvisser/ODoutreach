import "server-only";

import { getAppBaseUrl } from "@/lib/mailbox-oauth-app-url";
import { normalizeEmail } from "@/lib/normalize";

export function mailboxOAuthRedirectToClient(
  clientId: string,
  query: Record<string, string>,
): Response {
  const base = getAppBaseUrl();
  const path = clientId ? `/clients/${clientId}/mailboxes` : "/clients";
  const u = new URL(path, base);
  for (const [k, v] of Object.entries(query)) {
    u.searchParams.set(k, v);
  }
  return Response.redirect(u.toString());
}

export function mailboxEmailsAlign(
  identityEmailNormalized: string,
  oauthPrimaryEmail: string,
): boolean {
  return normalizeEmail(oauthPrimaryEmail) === identityEmailNormalized;
}
