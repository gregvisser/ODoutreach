/**
 * Pure view-model helpers for the operator Mailboxes page (no I/O, no Prisma).
 */

import type { SenderSignatureViewModel } from "@/lib/mailboxes/sender-signature";
import { MAX_ACTIVE_MAILBOXES_PER_CLIENT } from "@/lib/mailbox-identities";

/** Minimal row shape for operator status (matches `MailboxIdentityRow` in the panel). */
export type OperatorMailboxRow = {
  id: string;
  email: string;
  displayName: string | null;
  provider: "MICROSOFT" | "GOOGLE";
  connectionStatus:
    | "DRAFT"
    | "PENDING_CONNECTION"
    | "CONNECTED"
    | "CONNECTION_ERROR"
    | "DISCONNECTED";
  workspaceRemovedAt: string | null;
  isActive: boolean;
  isPrimary: boolean;
  isSendingEnabled: boolean;
  dailySendCap: number;
  emailsSentToday: number;
  dailyWindowResetAt: string | null;
  lastError: string | null;
};

export type OperatorLedgerRow = {
  cap: number;
  bookedInUtcDay: number;
  remaining: number;
};

export type OperatorMailboxStatusKind =
  | "connected"
  | "needs_connection"
  | "needs_approval"
  | "connection_failed"
  | "account_deleted"
  | "disconnected"
  | "sending_paused"
  | "removed"
  | "inactive";

export type OperatorMailboxStatus = {
  kind: OperatorMailboxStatusKind;
  /** One-line status for the table */
  label: string;
  /** Shorter hint for the actions column / mobile — no raw stack traces */
  sublabel?: string;
};

/** Generic Microsoft connection-error hint when no mapped `lastError` pattern matches. */
export const MICROSOFT_CONNECTION_ERROR_SUBLABEL_GENERIC =
  "Connection did not complete. Reconnect and approve access in Microsoft 365." as const;

/**
 * The one status in this product that must not offer a next step, because
 * there isn't one on our side.
 */
export const MAILBOX_ACCOUNT_DELETED_SUBLABEL =
  "This account no longer exists in the client's Microsoft directory, so it cannot be reconnected. Someone at the client has to recreate the mailbox, or it should be removed from this workspace." as const;

/** True when `lastError` says the underlying account has been deleted. */
export function isMailboxAccountDeletedError(
  lastError: string | null | undefined,
): boolean {
  return /AADSTS500341/i.test(lastError?.trim() ?? "");
}

/**
 * Concise table sublabel for a Google `CONNECTION_ERROR`.
 *
 * The old text said "Connection did not complete" for every Google failure,
 * which reads as "someone abandoned the sign-in window". The commonest cause
 * by far is the opposite: a sign-in that completed fine and then expired,
 * because the OAuth app is in Testing mode and Google expires those refresh
 * tokens weekly. Six production mailboxes were in exactly that state.
 */
export function googleConnectionErrorSublabel(
  lastError: string | null | undefined,
): string {
  const err = lastError?.trim() ?? "";
  if (/invalid_grant|refresh token/i.test(err)) {
    return "The Google sign-in for this mailbox has expired. Press Reconnect and approve access — Google expires these weekly until the app is published.";
  }
  return "Connection did not complete. Reconnect and approve access in Google.";
}

/**
 * Concise table sublabel for Microsoft `CONNECTION_ERROR` from stored `lastError` (set by OAuth/callback).
 * Full provider text remains under Advanced details.
 */
export function microsoftConnectionErrorSublabel(
  lastError: string | null | undefined,
): string {
  const err = lastError?.trim() ?? "";
  if (!err) {
    return MICROSOFT_CONNECTION_ERROR_SUBLABEL_GENERIC;
  }
  // MUST stay above the `invalid_grant` branch. Entra returns AADSTS500341
  // inside an invalid_grant response, so the order of these two checks decides
  // whether a deleted account is told to reconnect (impossible) or told the
  // truth. Two Chevron Security mailboxes read "reconnect and complete MFA"
  // for weeks for accounts that had been deleted from the directory.
  if (/AADSTS500341/i.test(err)) {
    return MAILBOX_ACCOUNT_DELETED_SUBLABEL;
  }
  if (err.includes("AADSTS50020")) {
    return "This Microsoft account is in the wrong tenant for the mailbox app, or sign-in is restricted. Use the mailbox owner or M365 admin in the correct organisation, or use a multi-tenant OAuth app/authority (see runbook).";
  }
  if (err.includes("HTTP 404")) {
    return "Microsoft Graph could not find or open this mailbox. Check it exists as an Exchange mailbox and that the connecting user has delegated access.";
  }
  if (err.includes("HTTP 403")) {
    return "Microsoft Graph denied access. Grant delegated Full Access and Send As/Send on behalf, then reconnect.";
  }
  if (
    /invalid_grant/i.test(err) ||
    /AADSTS50076/i.test(err) ||
    /AAD5TS0276/i.test(err) ||
    /multi-factor authentication/i.test(err)
  ) {
    return "Microsoft requires this mailbox to re-authenticate. Reconnect this mailbox and complete MFA.";
  }
  if (/access_denied/i.test(err)) {
    return "Microsoft sign-in was declined or cancelled. Use Connect again and approve access, or ask your admin if consent is blocked.";
  }
  if (
    /\bAADSTS/i.test(err) &&
    /consent|administrator|admin consent|requires an administrator/i.test(err)
  ) {
    return "Microsoft Entra may require admin approval for this app. Ask an admin to grant delegated permissions, then reconnect.";
  }
  return MICROSOFT_CONNECTION_ERROR_SUBLABEL_GENERIC;
}

export function mailboxRowOperatorStatus(
  row: OperatorMailboxRow,
): OperatorMailboxStatus {
  if (row.workspaceRemovedAt) {
    return { kind: "removed", label: "Removed" };
  }
  if (!row.isActive) {
    return { kind: "inactive", label: "Inactive" };
  }
  // Checked ahead of the status branches: a deleted account is the same answer
  // whichever status it currently carries, and it is the only one where the
  // honest label is "cannot be reconnected" rather than "reconnect".
  if (isMailboxAccountDeletedError(row.lastError)) {
    return {
      kind: "account_deleted",
      label: "Cannot be reconnected",
      sublabel: MAILBOX_ACCOUNT_DELETED_SUBLABEL,
    };
  }
  if (row.connectionStatus === "CONNECTION_ERROR") {
    return {
      kind: "connection_failed",
      label: "Connection failed",
      sublabel:
        row.provider === "MICROSOFT"
          ? microsoftConnectionErrorSublabel(row.lastError)
          : googleConnectionErrorSublabel(row.lastError),
    };
  }
  if (row.connectionStatus === "DISCONNECTED") {
    return {
      kind: "disconnected",
      label: "Disconnected",
      sublabel: "Use Connect to sign in again for this workspace mailbox.",
    };
  }
  if (row.connectionStatus === "DRAFT") {
    return {
      kind: "needs_connection",
      label: "Needs connection",
      sublabel: "Add this mailbox, then use Connect to finish sign-in.",
    };
  }
  if (row.connectionStatus === "PENDING_CONNECTION") {
    return {
      kind: "needs_approval",
      label: "Needs approval",
      sublabel:
        "Finish sign-in in the Microsoft or Google window, or press Connect again.",
    };
  }
  if (row.connectionStatus === "CONNECTED" && !row.isSendingEnabled) {
    return { kind: "sending_paused", label: "Sending paused" };
  }
  if (row.connectionStatus === "CONNECTED") {
    return { kind: "connected", label: "Connected" };
  }
  return { kind: "needs_connection", label: "Needs connection" };
}

export function connectionNeedsAttention(
  row: Pick<OperatorMailboxRow, "workspaceRemovedAt" | "isActive" | "connectionStatus">,
): boolean {
  if (row.workspaceRemovedAt || !row.isActive) return false;
  return row.connectionStatus !== "CONNECTED";
}

export function signatureNeedsAttention(vm: SenderSignatureViewModel): boolean {
  if (vm.syncError?.trim()) return true;
  if (!vm.hasMailboxSignature) return true;
  return false;
}

export function computePoolDailyMax(
  activeRows: OperatorMailboxRow[],
  sendingReadinessByMailboxId: Record<string, OperatorLedgerRow> | undefined,
): number {
  if (activeRows.length === 0) return 0;
  return activeRows.reduce((acc, row) => {
    const cap = sendingReadinessByMailboxId?.[row.id]?.cap ?? row.dailySendCap;
    return acc + Math.max(0, cap);
  }, 0);
}

export type MailboxesNextStep = "all_ready" | "needs_action" | "add_first";

export function mailboxesWhatToDoNext(input: {
  activeRowCount: number;
  needsAttentionCount: number;
}): { message: string; kind: MailboxesNextStep } {
  if (input.activeRowCount === 0) {
    return {
      kind: "add_first",
      message: "Add the first mailbox.",
    };
  }
  if (input.needsAttentionCount > 0) {
    return {
      kind: "needs_action",
      message:
        "Connect or reconnect the mailboxes that need attention (see Status).",
    };
  }
  return {
    kind: "all_ready",
    message: "Mailbox pool is ready.",
  };
}

export function countConnectedMailboxes(
  activeRows: OperatorMailboxRow[],
): number {
  return activeRows.filter((r) => r.connectionStatus === "CONNECTED").length;
}

/**
 * “Needs attention” in summary = connection issues, or a connected mailbox whose signature still needs work.
 * Does not count inactive or removed rows.
 */
export function countMailboxNeedsAttention(input: {
  activeRows: OperatorMailboxRow[];
  viewModels: SenderSignatureViewModel[];
}): number {
  const byId = new Set<string>();
  for (let i = 0; i < input.activeRows.length; i += 1) {
    const row = input.activeRows[i]!;
    if (row.workspaceRemovedAt || !row.isActive) continue;
    if (connectionNeedsAttention(row)) {
      byId.add(row.id);
      continue;
    }
    if (row.connectionStatus === "CONNECTED") {
      const vm = input.viewModels[i];
      if (vm && signatureNeedsAttention(vm)) {
        byId.add(row.id);
      }
    }
  }
  return byId.size;
}

export const MAX_CONNECTED_MAILBOXES = MAX_ACTIVE_MAILBOXES_PER_CLIENT;
export { THEORETICAL_MAX_CLIENT_DAILY_SENDS } from "@/lib/outreach-mailbox-model";

/**
 * Compact, provider-honest label for the signatures list (not the legacy badge map).
 */
export function operatorSignatureTableLabel(
  row: Pick<OperatorMailboxRow, "provider" | "connectionStatus">,
  vm: SenderSignatureViewModel,
): { label: string; isSyncedGmail: boolean } {
  if (row.connectionStatus !== "CONNECTED") {
    return { label: "Connect mailbox first", isSyncedGmail: false };
  }
  if (row.provider === "GOOGLE") {
    if (vm.source === "gmail_send_as" && vm.lastSyncedAtIso) {
      return { label: "Synced from Gmail", isSyncedGmail: true };
    }
    if (vm.source === "manual") {
      return { label: "Set in ODoutreach", isSyncedGmail: false };
    }
    if (vm.source === "missing") {
      return { label: "Needs signature", isSyncedGmail: false };
    }
    return { label: "Set in ODoutreach", isSyncedGmail: false };
  }
  if (row.provider === "MICROSOFT") {
    if (vm.source === "manual") {
      return { label: "Set in ODoutreach", isSyncedGmail: false };
    }
    if (vm.source === "missing" || vm.source === "unsupported_provider") {
      return { label: "Needs signature", isSyncedGmail: false };
    }
  }
  return { label: "Set in ODoutreach", isSyncedGmail: false };
}
