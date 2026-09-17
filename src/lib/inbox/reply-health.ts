export type ReplyHealthMailbox = {
  provider: "MICROSOFT" | "GOOGLE";
  connectionStatus: string;
  lastSyncAt: string | null;
  lastError: string | null;
};

export type ReplyHealthSummary = {
  connectedMailboxCount: number;
  mailboxesNeedingAttention: number;
  lastAttemptAt: string | null;
};

/**
 * Builds a safe staff-facing signal from mailbox state. `lastSyncAt` records
 * an attempt, including failed attempts, so it is never described as success.
 * Connection lifecycle problems remain represented by connectionStatus.
 */
export function summarizeReplyHealth(
  mailboxes: ReplyHealthMailbox[],
): ReplyHealthSummary {
  const connected = mailboxes.filter(
    (mailbox) =>
      (mailbox.provider === "MICROSOFT" || mailbox.provider === "GOOGLE") &&
      mailbox.connectionStatus === "CONNECTED",
  );
  const affected = connected.filter((mailbox) => Boolean(mailbox.lastError?.trim()));
  const attempts = (affected.length > 0 ? affected : connected)
    .map((mailbox) => mailbox.lastSyncAt)
    .filter((value): value is string => value !== null && !Number.isNaN(Date.parse(value)));

  return {
    connectedMailboxCount: connected.length,
    mailboxesNeedingAttention: affected.length,
    lastAttemptAt:
      attempts.length > 0
        ? attempts.reduce((latest, value) =>
            Date.parse(value) > Date.parse(latest) ? value : latest,
          )
        : null,
  };
}

export function formatReplyCheckAttempt(lastAttemptAt: string | null): string {
  if (!lastAttemptAt) return "No reply check attempt yet";
  const date = new Date(lastAttemptAt);
  if (Number.isNaN(date.getTime())) return "Reply check attempt date unavailable";
  return `Last reply check attempt ${new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/London",
  }).format(date)}`;
}
