/**
 * Operator-facing signature readiness (pure). For the Mailboxes “proof / readiness” flow.
 */

import {
  isMailboxFullBrandedSignature,
  type SenderSignatureMailbox,
  type SenderSignatureSelection,
  type SenderSignatureSource,
  type SenderSignatureViewModel,
} from "./sender-signature";

import type { OperatorMailboxRow } from "./mailboxes-operator-model";

export type OperatorSignatureStateKind =
  | "not_connected"
  | "error_sync"
  | "minimal_signature"
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
  minimal_signature: {
    label: "Minimal signature saved",
    shortDescription:
      "Only a short signature block is stored. Add the full branded signature and legal disclaimer before live outreach.",
    recommendedAction:
      "Use Set signature (HTML recommended) or Insert OpensDoors branded template. ODoutreach composes message → full signature → unsubscribe.",
  },
  ready_gmail: {
    label: "Ready — Full signature from Gmail",
    shortDescription:
      "A full send-as signature is stored from Google Workspace. ODoutreach composes message → signature → unsubscribe.",
    recommendedAction:
      "Use Preview signature to verify ordering. If Google Workspace appends another footer after send, disable that injection to avoid duplicates.",
  },
  ready_od: {
    label: "Ready — Full branded signature in ODoutreach",
    shortDescription:
      "A full branded signature/disclaimer is stored for this mailbox. Outreach emails are composed as message body, signature, then unsubscribe.",
    recommendedAction:
      "Confirm Preview signature. Disable Microsoft/Exchange signature injection for this sender if duplicate footers appear after send.",
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
function withMicrosoftInjectionHint(
  row: Pick<OperatorMailboxRow, "provider">,
  base: Omit<OperatorSignatureState, "kind" | "sendReadyFromSignature">,
): Omit<OperatorSignatureState, "kind" | "sendReadyFromSignature"> {
  if (row.provider !== "MICROSOFT") return base;
  const hint =
    " If Microsoft/Exchange still appends another disclaimer after send, disable provider-side signature injection for this mailbox.";
  return { ...base, recommendedAction: `${base.recommendedAction}${hint}` };
}

export function getOperatorSignatureState(
  row: Pick<OperatorMailboxRow, "connectionStatus" | "provider" | "email" | "id">,
  vm: SenderSignatureViewModel,
  selection: SenderSignatureSelection,
  mailbox: Pick<SenderSignatureMailbox, "senderSignatureHtml" | "senderSignatureText">,
): OperatorSignatureState {
  if (row.connectionStatus !== "CONNECTED") {
    return { kind: "not_connected", sendReadyFromSignature: false, ...TEMPLATES.not_connected };
  }
  if (vm.syncError?.trim()) {
    return { kind: "error_sync", sendReadyFromSignature: false, ...TEMPLATES.error_sync };
  }
  const text = selection.emailSignatureText?.trim() ?? "";
  if (text.length > 0) {
    const full = isMailboxFullBrandedSignature(mailbox);
    if (!full) {
      return {
        kind: "minimal_signature",
        sendReadyFromSignature: true,
        ...withMicrosoftInjectionHint(row, TEMPLATES.minimal_signature),
      };
    }
    if (selection.source === "gmail_send_as") {
      return {
        kind: "ready_gmail",
        sendReadyFromSignature: true,
        ...withMicrosoftInjectionHint(row, TEMPLATES.ready_gmail),
      };
    }
    return {
      kind: "ready_od",
      sendReadyFromSignature: true,
      ...withMicrosoftInjectionHint(row, TEMPLATES.ready_od),
    };
  }
  if (selection.source === "missing" || selection.source === "unsupported_provider") {
    return { kind: "missing", sendReadyFromSignature: false, ...TEMPLATES.missing };
  }
  return { kind: "missing", sendReadyFromSignature: false, ...TEMPLATES.missing };
}
