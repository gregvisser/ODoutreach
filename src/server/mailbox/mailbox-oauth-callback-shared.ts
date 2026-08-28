import "server-only";

import { getAppBaseUrl } from "@/lib/mailbox-oauth-app-url";
import { formatMailboxOAuthAccountMismatch } from "@/lib/mailboxes/mailbox-oauth-banner-message";
import { normalizeEmail } from "@/lib/normalize";

/**
 * The person who completed the provider's consent screen is not the mailbox on
 * the row, and cannot act for it.
 *
 * This has its own type because it is the one OAuth failure the operator can
 * fix unaided — by signing in as the right person — and because the guard that
 * raises it is doing its job. Without that guard a personal Gmail becomes a
 * client's sending address and their prospects get mail from a stranger. It
 * used to be flattened into the callback's catch-all and reported as
 * `callback_failed`, which is why it went unexplained for a week.
 */
export class MailboxOAuthAccountMismatchError extends Error {
  readonly approvedEmail: string;
  readonly mailboxEmail: string;

  constructor(approvedEmail: string, mailboxEmail: string) {
    super(formatMailboxOAuthAccountMismatch(approvedEmail, mailboxEmail));
    this.name = "MailboxOAuthAccountMismatchError";
    this.approvedEmail = approvedEmail;
    this.mailboxEmail = mailboxEmail;
  }
}

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
