import type { MailboxConnectionStatus } from "@/generated/prisma/enums";

export type MailboxAuthFailureSignal = {
  /** Snippet from failed OutboundEmail row */
  message: string;
  /** When that failure row was last updated (used vs mailbox.connectedAt). */
  failedAt: Date;
};

/**
 * Historically we surfaced recent failed-send auth errors as if the mailbox were disconnected.
 * After a successful OAuth reconnect, the mailbox row is CONNECTED but old FAILED rows remain —
 * we must not override real DB status when the failure predates the latest connection.
 */
export function shouldApplyMailboxAuthFailureOverlay(input: {
  dbConnectionStatus: MailboxConnectionStatus;
  connectedAt: Date | null;
  mailboxUpdatedAt: Date;
  failure: MailboxAuthFailureSignal | null;
}): boolean {
  if (!input.failure) return false;
  if (input.dbConnectionStatus !== "CONNECTED") return true;
  const baseline = input.connectedAt ?? input.mailboxUpdatedAt;
  return input.failure.failedAt.getTime() > baseline.getTime();
}

/**
 * Provider-aware "this mailbox needs reconnecting" message. Previously this was
 * hardcoded to the Microsoft/MFA wording even for Google mailboxes — confusing
 * for the documented Gmail case, where a Testing-mode refresh token expires
 * roughly weekly and a reconnect (not MFA) fixes it.
 */
export function mailboxReauthMessage(
  provider: string,
  failureMessage: string,
): string {
  const base =
    provider === "GOOGLE"
      ? "Google requires this mailbox to re-authenticate. Reconnect it to restore sending — Google tokens in Testing mode expire about weekly, and reconnecting fixes it."
      : "Microsoft requires this mailbox to re-authenticate. Reconnect this mailbox and complete MFA.";
  return `${base} ${failureMessage}`.slice(0, 4000);
}
