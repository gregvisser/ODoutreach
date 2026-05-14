/**
 * PR #131 — Pure delivery-status derivation for list detail view.
 *
 * Given the raw data from the server query, produces a staff-friendly
 * label for each contact's outreach status plus a page-level summary.
 *
 * No DB access — everything is derived from the row shape passed in.
 */

export type DeliveryStatusLabel =
  | "Not sent"
  | "Queued"
  | "Sent from mailbox"
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
  sentAt: Date | null;
  bouncedAt: Date | null;
  openedAt: Date | null;
  repliedAt: Date | null;
  unsubscribedAt: Date | null;
  isSuppressed: boolean;
  hasLinkedReply: boolean;
};

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

  if (
    input.outboundStatus === "SENT" ||
    input.outboundStatus === "DELIVERED" ||
    input.stepSendStatus === "SENT"
  ) {
    return "Sent from mailbox";
  }

  if (
    input.outboundStatus === "QUEUED" ||
    input.outboundStatus === "PROCESSING" ||
    input.outboundStatus === "REQUESTED" ||
    input.outboundStatus === "PREPARING" ||
    input.stepSendStatus === "READY" ||
    input.stepSendStatus === "PLANNED"
  ) {
    return "Queued";
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
    failed: 0,
    bounced: 0,
    replied: 0,
    unsubscribed: 0,
    suppressed: 0,
  };

  for (const s of statuses) {
    switch (s) {
      case "Sent from mailbox":
        summary.sent++;
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
