/**
 * When Connect / Reconnect belongs in the primary action row vs Advanced overflow.
 *
 * Healthy CONNECTED mailboxes (Needs attention = 0 for connection) must not show
 * Reconnect at the same visual weight as Disconnect / Remove — unsupervised staff
 * treat peer-level Reconnect as weekly hygiene. Google's seven-day clock is the
 * exception: when `resolveGoogleReconnectCountdown` says attention is needed,
 * Reconnect returns to the primary row. Microsoft rows never use that clock.
 */

import { resolveGoogleReconnectCountdown } from "@/lib/mailboxes/google-refresh-token-expiry";
import { mailboxSignInWindowIsOpen } from "@/lib/mailboxes/mailboxes-operator-model";

export type MailboxConnectCtaRow = {
  provider: "MICROSOFT" | "GOOGLE";
  connectionStatus:
    | "DRAFT"
    | "PENDING_CONNECTION"
    | "CONNECTED"
    | "CONNECTION_ERROR"
    | "DISCONNECTED";
  connectedAt: Date | string | null;
  oauthStateExpiresAt: string | null;
  workspaceRemovedAt?: string | null;
  isActive?: boolean;
};

export type MailboxConnectCtaPlacement = "primary" | "advanced";

export function mailboxConnectActionLabel(row: MailboxConnectCtaRow, now: Date): string {
  if (row.connectionStatus === "CONNECTED") {
    return "Reconnect";
  }
  if (
    row.connectionStatus === "PENDING_CONNECTION" &&
    mailboxSignInWindowIsOpen(row.oauthStateExpiresAt, now)
  ) {
    return "Complete sign-in";
  }
  return "Connect";
}

function connectedAtDate(row: MailboxConnectCtaRow): Date | null {
  if (!row.connectedAt) return null;
  if (row.connectedAt instanceof Date) return row.connectedAt;
  const parsed = new Date(row.connectedAt);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Primary row = operator should act on connection now. Advanced = optional fresh
 * sign-in for a healthy connected mailbox (Microsoft, or Google still in date).
 */
export function mailboxConnectActionPlacement(
  row: MailboxConnectCtaRow,
  now: Date,
): MailboxConnectCtaPlacement {
  if (row.workspaceRemovedAt || row.isActive === false) {
    return "advanced";
  }
  if (row.connectionStatus !== "CONNECTED") {
    return "primary";
  }
  const countdown = resolveGoogleReconnectCountdown(
    {
      provider: row.provider,
      connectionStatus: row.connectionStatus,
      connectedAt: connectedAtDate(row),
    },
    now,
  );
  if (countdown?.needsAttention) {
    return "primary";
  }
  return "advanced";
}

/** Tooltip when Reconnect is tucked under Advanced on a healthy mailbox. */
export const MAILBOX_HEALTHY_RECONNECT_ADVANCED_HINT =
  "Optional — only if Microsoft or Google asks for a fresh sign-in. Healthy connected mailboxes do not need this." as const;
