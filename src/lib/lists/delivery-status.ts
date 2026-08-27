/**
 * PR #131 → PR #132 — Pure delivery-status derivation for list detail
 * view and outreach metrics.
 *
 * Given the raw data from the server query, produces a staff-friendly
 * label for each contact's outreach status plus a page-level summary.
 *
 * No DB access — everything is derived from the row shape passed in.
 *
 * PR #132 send-proof contract: a row may only show "Sent from mailbox"
 * when actual outbound/provider proof exists. Step-send SENT alone is
 * not sufficient — an OutboundEmail with sentAt or providerMessageId
 * (or a provider-confirmed status) is required.
 */

export type DeliveryStatusLabel =
  | "Not sent"
  | "Awaiting send"
  | "Queued"
  | "Sent from mailbox"
  | "Sent — time unavailable"
  | "Sent, not confirmed"
  | "Failed"
  | "Bounced"
  | "Replied"
  | "Unsubscribed"
  | "Suppressed / skipped";

/**
 * The raw per-contact outreach data assembled by the server query.
 * Each field is optional because a contact may have no sequence activity.
 */
export type ContactOutreachInput = {
  stepSendStatus: string | null;
  outboundStatus: string | null;
  hasOutboundEmail: boolean;
  hasProviderProof: boolean;
  sentAt: Date | null;
  bouncedAt: Date | null;
  openedAt: Date | null;
  repliedAt: Date | null;
  unsubscribedAt: Date | null;
  isSuppressed: boolean;
  hasLinkedReply: boolean;
};

const PROVIDER_CONFIRMED_STATUSES = new Set([
  "SENT",
  "DELIVERED",
  "REPLIED",
  "BOUNCED",
]);

export function deriveDeliveryStatus(
  input: ContactOutreachInput,
): DeliveryStatusLabel {
  if (input.unsubscribedAt) return "Unsubscribed";

  if (input.hasLinkedReply || input.outboundStatus === "REPLIED") {
    return "Replied";
  }

  if (
    input.outboundStatus === "BOUNCED" ||
    input.bouncedAt
  ) {
    return "Bounced";
  }

  if (
    input.outboundStatus === "FAILED" ||
    input.stepSendStatus === "FAILED"
  ) {
    return "Failed";
  }

  if (
    input.stepSendStatus === "SUPPRESSED" ||
    input.stepSendStatus === "SKIPPED" ||
    input.stepSendStatus === "BLOCKED" ||
    input.outboundStatus === "BLOCKED_SUPPRESSION"
  ) {
    return "Suppressed / skipped";
  }

  // "Queued" means the email has actually been handed to the send
  // pipeline — a real OutboundEmail row exists in a pre-send state. This
  // is the SAME definition the workspace Reports page uses, so the two
  // surfaces reconcile.
  if (
    input.outboundStatus === "QUEUED" ||
    input.outboundStatus === "PROCESSING" ||
    input.outboundStatus === "REQUESTED" ||
    input.outboundStatus === "PREPARING"
  ) {
    return "Queued";
  }

  if (
    input.outboundStatus === "SENT" ||
    input.outboundStatus === "DELIVERED" ||
    input.stepSendStatus === "SENT"
  ) {
    if (input.hasOutboundEmail && input.sentAt) {
      return "Sent from mailbox";
    }
    if (
      input.hasOutboundEmail &&
      (input.hasProviderProof ||
        PROVIDER_CONFIRMED_STATUSES.has(input.outboundStatus ?? ""))
    ) {
      return "Sent — time unavailable";
    }
    if (!input.hasOutboundEmail) {
      return "Sent, not confirmed";
    }
    return "Sent, not confirmed";
  }

  // The contact is enrolled and prepared to send (step-send READY or
  // PLANNED) but NO OutboundEmail exists yet — nothing has been handed
  // to the send pipeline. This is "Awaiting send", NOT "Queued". These
  // go out on the next launch / send-queue run. Labelling them "Queued"
  // is what made the per-list count disagree with the workspace Reports
  // page (which only counts real queued OutboundEmail rows).
  if (
    input.stepSendStatus === "READY" ||
    input.stepSendStatus === "PLANNED"
  ) {
    return "Awaiting send";
  }

  if (input.isSuppressed) {
    return "Suppressed / skipped";
  }

  return "Not sent";
}

export function deriveOpensLabel(openedAt: Date | null): string {
  if (openedAt) {
    return `Opened ${openedAt.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}`;
  }
  return "Not tracked";
}

export type ListDeliverySummary = {
  totalContacts: number;
  emailSendable: number;
  sent: number;
  awaitingSend: number;
  queued: number;
  sentProofMissing: number;
  failed: number;
  bounced: number;
  replied: number;
  unsubscribed: number;
  suppressed: number;
};

export function summarizeDelivery(
  statuses: DeliveryStatusLabel[],
  emailSendableCount: number,
): ListDeliverySummary {
  const summary: ListDeliverySummary = {
    totalContacts: statuses.length,
    emailSendable: emailSendableCount,
    sent: 0,
    awaitingSend: 0,
    queued: 0,
    sentProofMissing: 0,
    failed: 0,
    bounced: 0,
    replied: 0,
    unsubscribed: 0,
    suppressed: 0,
  };

  for (const s of statuses) {
    switch (s) {
      case "Sent from mailbox":
      case "Sent — time unavailable":
        summary.sent++;
        break;
      case "Awaiting send":
        summary.awaitingSend++;
        break;
      case "Queued":
        summary.queued++;
        break;
      case "Sent, not confirmed":
        summary.sentProofMissing++;
        break;
      case "Failed":
        summary.failed++;
        break;
      case "Bounced":
        summary.bounced++;
        break;
      case "Replied":
        summary.replied++;
        break;
      case "Unsubscribed":
        summary.unsubscribed++;
        break;
      case "Suppressed / skipped":
        summary.suppressed++;
        break;
    }
  }

  return summary;
}
