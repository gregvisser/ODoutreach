import type { MailboxConnectionStatus } from "@/generated/prisma/enums";

/** OpensDoors product rule: per-mailbox daily send cap (not pooled across mailboxes). */
export const DEFAULT_MAILBOX_DAILY_SEND_CAP = 30;

/** Maximum active mailbox identities per client workspace. */
export const MAX_ACTIVE_MAILBOXES_PER_CLIENT = 5;

export type MailboxEligibilityInput = {
  isActive: boolean;
  connectionStatus: MailboxConnectionStatus;
  canSend: boolean;
  isSendingEnabled: boolean;
  dailySendCap: number;
  emailsSentToday: number;
  dailyWindowResetAt: Date | null;
  /** Soft-removed from workspace — never eligible. */
  workspaceRemovedAt?: Date | null;
};

/** UTC midnight at the start of the calendar day after `from`. */
export function startOfNextUtcDay(from: Date): Date {
  return new Date(
    Date.UTC(
      from.getUTCFullYear(),
      from.getUTCMonth(),
      from.getUTCDate() + 1,
      0,
      0,
      0,
      0,
    ),
  );
}

/**
 * When `now` is past the reset boundary, the stored counter is stale until a worker clears it;
 * for gating we treat the mailbox as not blocked by yesterday's count.
 */
export function isUnderDailySendCap(input: MailboxEligibilityInput, now: Date): boolean {
  const cap = Math.max(1, input.dailySendCap || DEFAULT_MAILBOX_DAILY_SEND_CAP);
  if (input.emailsSentToday <= 0) return true;
  if (!input.dailyWindowResetAt) {
    return input.emailsSentToday < cap;
  }
  if (now.getTime() >= input.dailyWindowResetAt.getTime()) {
    return true;
  }
  return input.emailsSentToday < cap;
}

/**
 * Operational sending readiness for UI and future send pipeline (no provider calls in this slice).
 */
export function isMailboxSendingEligible(input: MailboxEligibilityInput, now: Date): boolean {
  if (input.workspaceRemovedAt) return false;
  if (!input.isActive) return false;
  if (input.connectionStatus !== "CONNECTED") return false;
  if (!input.canSend || !input.isSendingEnabled) return false;
  return isUnderDailySendCap(input, now);
}

export function assertActiveMailboxLimit(
  currentActiveCount: number,
  activating: boolean,
): void {
  if (activating && currentActiveCount >= MAX_ACTIVE_MAILBOXES_PER_CLIENT) {
    throw new Error(
      `At most ${MAX_ACTIVE_MAILBOXES_PER_CLIENT} active mailboxes are allowed per client.`,
    );
  }
}

export function assertPrimaryRequiresActive(isPrimary: boolean, isActive: boolean): void {
  if (isPrimary && !isActive) {
    throw new Error("Primary mailbox must be active.");
  }
}
