import "server-only";

import { getAppBaseUrl } from "@/lib/mailbox-oauth-app-url";
import { formatMailboxOAuthAccountMismatch } from "@/lib/mailboxes/mailbox-oauth-banner-message";
import {
  MAILBOX_OAUTH_ACCOUNT_MISMATCH_REASON,
  MAILBOX_OAUTH_CALLBACK_FAILED_REASON,
  type MailboxOAuthFailureReason,
} from "@/lib/mailboxes/mailbox-oauth-failure-reason";
import { normalizeEmail } from "@/lib/normalize";

/**
 * A mailbox OAuth failure that knows what KIND of failure it is.
 *
 * The callback cannot work out why an exception happened — by the time it holds
 * one, all it has is prose. So the reason is attached where the cause is known,
 * at the throw site, and carried out untouched. That is the whole mechanism:
 * everything else here is plumbing.
 *
 * The message stays exactly what it was before this class existed, because it
 * is already written to `ClientMailboxIdentity.lastError` and read by the
 * owner-only connection diagnostics. This adds a channel; it removes nothing.
 */
export class MailboxOAuthFailure extends Error {
  readonly reason: MailboxOAuthFailureReason;

  constructor(reason: MailboxOAuthFailureReason, message: string) {
    super(message);
    this.name = "MailboxOAuthFailure";
    this.reason = reason;
  }
}

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
export class MailboxOAuthAccountMismatchError extends MailboxOAuthFailure {
  readonly approvedEmail: string;
  readonly mailboxEmail: string;

  constructor(approvedEmail: string, mailboxEmail: string) {
    super(
      MAILBOX_OAUTH_ACCOUNT_MISMATCH_REASON,
      formatMailboxOAuthAccountMismatch(approvedEmail, mailboxEmail),
    );
    this.name = "MailboxOAuthAccountMismatchError";
    this.approvedEmail = approvedEmail;
    this.mailboxEmail = mailboxEmail;
  }
}

/**
 * What to tell the operator about a thrown error.
 *
 * Unclassified errors return `callback_failed` deliberately rather than being
 * guessed at from their message text: a wrong-but-specific reason sends someone
 * to fix the wrong thing, which is worse than the shrug this row set out to
 * remove. Guessing from prose would also break the first time a provider
 * reworded an error.
 */
export function mailboxOAuthFailureReasonOf(
  error: unknown,
): MailboxOAuthFailureReason {
  return error instanceof MailboxOAuthFailure
    ? error.reason
    : MAILBOX_OAUTH_CALLBACK_FAILED_REASON;
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
