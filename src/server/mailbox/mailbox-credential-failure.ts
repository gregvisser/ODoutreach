/**
 * Classifying a mailbox credential failure — pure, no I/O, no Prisma.
 *
 * Found live on 2026-08-25: eight of thirty-five production mailboxes had dead
 * credentials and all eight still read "Connected" on screen. Reply sync wrote
 * the provider's error into `lastError` and left `connectionStatus` alone, so
 * the one word staff actually look at kept saying the mailbox was fine.
 *
 * Two failures were hiding behind that one word and they need OPPOSITE actions:
 *
 *   - `invalid_grant` — the sign-in expired. Reconnecting fixes it (for seven
 *     days, while the Google OAuth app stays in Testing mode).
 *   - `AADSTS500341` — the user account has been DELETED from the Microsoft
 *     directory. Reconnecting CANNOT fix it. Nobody can sign in as an account
 *     that no longer exists, and retrying it every fifteen minutes forever
 *     produces daily noise that will never resolve itself.
 *
 * Telling a member of staff to "reconnect and complete MFA" for a deleted
 * account is worse than saying nothing: it is a job that cannot be done.
 *
 * This module is the single source of that distinction. The send path
 * (`execute-one.ts`) and the reply-sync path (`mailbox-inbox-sync.ts`) both
 * read it, because they share one refresh-token grant and must not drift into
 * disagreeing about whether a mailbox is alive.
 */

export type MailboxProviderKind = "MICROSOFT" | "GOOGLE";

export type MailboxCredentialFailureKind =
  /** The sign-in expired or was revoked. A human signing in again fixes it. */
  | "reauth_required"
  /** The underlying account is gone. No sign-in can ever fix it. */
  | "account_deleted"
  /** Not a credential problem — a transport blip, a 500, a timeout. */
  | "not_credential";

export type MailboxCredentialFailure = {
  kind: MailboxCredentialFailureKind;
  /**
   * True when no amount of retrying or reconnecting will ever succeed. The
   * caller uses this to stop treating the mailbox as live.
   */
  isPermanent: boolean;
  /**
   * What to write to `ClientMailboxIdentity.connectionStatus`, or null when the
   * failure says nothing about the credentials and the status must be left
   * exactly as it was.
   *
   * `DISCONNECTED` for a deleted account rather than `CONNECTION_ERROR`: the
   * error statuses invite "try again", and this one must not.
   */
  connectionStatus: "CONNECTION_ERROR" | "DISCONNECTED" | null;
};

/** Entra's code for "the user account has been deleted from the directory". */
const ENTRA_ACCOUNT_DELETED = "aadsts500341";

/**
 * Reads a provider error string and says what it means for the mailbox.
 *
 * Order matters: the deleted-account check runs BEFORE the `invalid_grant`
 * check, because Entra returns `AADSTS500341` inside an `invalid_grant`
 * response. Testing `invalid_grant` first would classify a permanently dead
 * account as "just reconnect it" — which is exactly what the product did to
 * two Chevron Security mailboxes.
 */
export function classifyMailboxCredentialFailure(
  provider: MailboxProviderKind,
  error: string | null | undefined,
): MailboxCredentialFailure {
  const e = (error ?? "").toLowerCase();
  if (!e.trim()) {
    return { kind: "not_credential", isPermanent: false, connectionStatus: null };
  }

  if (e.includes(ENTRA_ACCOUNT_DELETED)) {
    return {
      kind: "account_deleted",
      isPermanent: true,
      connectionStatus: "DISCONNECTED",
    };
  }

  if (provider === "MICROSOFT") {
    if (
      e.includes("invalid_grant") ||
      e.includes("aadsts50076") ||
      e.includes("multi-factor authentication") ||
      // The mailbox row exists but its stored secret does not — a reconnect is
      // the only route back, and today this leaves the row reading "Connected".
      e.includes("refresh token missing") ||
      e.includes("no stored oauth credentials")
    ) {
      return {
        kind: "reauth_required",
        isPermanent: false,
        connectionStatus: "CONNECTION_ERROR",
      };
    }
    return { kind: "not_credential", isPermanent: false, connectionStatus: null };
  }

  if (
    e.includes("invalid_grant") ||
    e.includes("refresh token") ||
    e.includes("no stored oauth credentials")
  ) {
    return {
      kind: "reauth_required",
      isPermanent: false,
      connectionStatus: "CONNECTION_ERROR",
    };
  }
  return { kind: "not_credential", isPermanent: false, connectionStatus: null };
}

/**
 * The sentence stored on the mailbox row. Staff read this, so it says what to
 * do — or says plainly that there is nothing to do.
 *
 * The provider's own text is kept on the end (truncated) because it is the only
 * evidence of what actually happened, but it comes AFTER the instruction.
 */
export function mailboxCredentialFailureMessage(
  provider: MailboxProviderKind,
  failure: MailboxCredentialFailure,
  error: string,
): string {
  const detail = error.trim().slice(0, 1500);
  if (failure.kind === "account_deleted") {
    return `This mailbox cannot be reconnected — the account no longer exists in the organisation's Microsoft directory. Someone at the client has to recreate it, or the mailbox should be removed from this workspace. Reconnecting will not work. ${detail}`;
  }
  if (failure.kind === "reauth_required") {
    return provider === "MICROSOFT"
      ? `Microsoft requires this mailbox to re-authenticate. Reconnect this mailbox and complete MFA. ${detail}`
      : `Google requires this mailbox to re-authenticate. Reconnect this mailbox and approve access. ${detail}`;
  }
  return detail;
}
