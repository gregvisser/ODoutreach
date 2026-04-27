/**
 * Operator-facing signature readiness (pure). For the Mailboxes “proof / readiness” flow.
 */

import type { SenderSignatureSelection, SenderSignatureSource, SenderSignatureViewModel } from "./sender-signature";

import type { OperatorMailboxRow } from "./mailboxes-operator-model";

export type OperatorSignatureStateKind =
  | "not_connected"
  | "error_sync"
  | "ready_gmail"
  | "ready_od"
  | "missing";

export type OperatorSignatureState = {
  kind: OperatorSignatureStateKind;
  label: string;
  shortDescription: string;
  recommendedAction: string;
  /**
   * When true, the composition path has non-empty mailbox `emailSignatureText`
   * from `chooseSignatureForSend`.
   */
  sendReadyFromSignature: boolean;
};

const TEMPLATES: Record<OperatorSignatureStateKind, Omit<OperatorSignatureState, "sendReadyFromSignature" | "kind">> = {
  not_connected: {
    label: "Not connected",
    shortDescription: "Connect the mailbox before signatures apply to sends.",
    recommendedAction: "Use Connect on the mailbox row, then return here.",
  },
  error_sync: {
    label: "Error — sync failed",
    shortDescription: "Gmail send-as could not be read or stored on the last try.",
    recommendedAction: "Retry “Sync from Gmail” or set the signature manually in ODoutreach.",
  },
  ready_gmail: {
    label: "Ready — Synced from Gmail",
    shortDescription: "The send-as signature is stored on this mailbox from Google Workspace.",
    recommendedAction: "Use “Preview signature” to verify the footer, or re-sync if you change it in Google Admin.",
  },
  ready_od: {
    label: "Ready — Set in ODoutreach",
    shortDescription: "A signature is saved on this mailbox in ODoutreach (required for Microsoft 365).",
    recommendedAction: "Use “Preview” before go-live, or edit if the footer should change.",
  },
  missing: {
    label: "No mailbox signature configured",
    shortDescription:
      "This mailbox does not have its own signature yet. Add a per-mailbox signature so outreach sent from this mailbox matches the sender identity.",
    recommendedAction:
      "Set a per-mailbox signature in ODoutreach, or use Sync from Gmail (Google) where supported. Client-level brief text is not used for mailbox sends.",
  },
};

/**
 * How the send pipeline will resolve the signature (from `chooseSignatureForSend`).
 */
export function humanizeSignatureSource(source: SenderSignatureSource): string {
  switch (source) {
    case "gmail_send_as":
      return "Gmail send-as (synced)";
    case "manual":
      return "Set in ODoutreach";
    case "client_brief_fallback":
      return "Client brief (legacy) — not used for mailbox";
    case "unsupported_provider":
      return "Not set (set in ODoutreach; Outlook is not read automatically)";
    case "missing":
      return "None — mailbox signature required";
    default:
      return String(source);
  }
}

/**
 * `selection` must be `chooseSignatureForSend({ mailbox, clientBrief })` for
 * the same row as `vm` / `row`.
 */
export function getOperatorSignatureState(
  row: Pick<OperatorMailboxRow, "connectionStatus" | "provider" | "email" | "id">,
  vm: SenderSignatureViewModel,
  selection: SenderSignatureSelection,
): OperatorSignatureState {
  if (row.connectionStatus !== "CONNECTED") {
    return { kind: "not_connected", sendReadyFromSignature: false, ...TEMPLATES.not_connected };
  }
  if (vm.syncError?.trim()) {
    return { kind: "error_sync", sendReadyFromSignature: false, ...TEMPLATES.error_sync };
  }
  const text = selection.emailSignatureText?.trim() ?? "";
  if (text.length > 0) {
    if (selection.source === "gmail_send_as") {
      return { kind: "ready_gmail", sendReadyFromSignature: true, ...TEMPLATES.ready_gmail };
    }
    if (selection.source === "manual") {
      return { kind: "ready_od", sendReadyFromSignature: true, ...TEMPLATES.ready_od };
    }
    return { kind: "ready_od", sendReadyFromSignature: true, ...TEMPLATES.ready_od };
  }
  if (selection.source === "missing" || selection.source === "unsupported_provider") {
    return { kind: "missing", sendReadyFromSignature: false, ...TEMPLATES.missing };
  }
  return { kind: "missing", sendReadyFromSignature: false, ...TEMPLATES.missing };
}
