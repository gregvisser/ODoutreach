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

export function mailboxRowOperatorStatus(
  row: OperatorMailboxRow,
): OperatorMailboxStatus {
  if (row.workspaceRemovedAt) {
    return { kind: "removed", label: "Removed" };
  }
  if (!row.isActive) {
    return { kind: "inactive", label: "Inactive" };
  }
  if (row.connectionStatus === "CONNECTION_ERROR") {
    return {
      kind: "connection_failed",
      label: "Connection failed",
      sublabel:
        row.provider === "MICROSOFT"
          ? "Connection did not complete. Reconnect and approve access in Microsoft 365."
          : "Connection did not complete. Reconnect and approve access in Google.",
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
      sublabel: "Finish sign-in in the Microsoft or Google window, or use Connect again.",
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
  if (vm.source === "missing" && !vm.resolvedSignatureText?.trim()) return true;
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
    if (vm.source === "client_brief_fallback") {
      return { label: "Using client fallback signature", isSyncedGmail: false };
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
    if (vm.source === "client_brief_fallback") {
      return { label: "Using client fallback signature", isSyncedGmail: false };
    }
    if (vm.source === "missing" || vm.source === "unsupported_provider") {
      return { label: "Needs signature", isSyncedGmail: false };
    }
  }
  return { label: "Set in ODoutreach", isSyncedGmail: false };
}
