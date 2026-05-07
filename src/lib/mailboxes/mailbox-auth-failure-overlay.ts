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
