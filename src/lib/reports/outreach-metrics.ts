/**
 * PR #132 — Outreach metrics contract.
 *
 * Pure derivation from database counts. No DB access here —
 * the server queries feed raw counts, this module computes
 * rates and labels.
 */

export type OutreachMetrics = {
  sent: number;
  delivered: number;
  deliveryTracked: boolean;
  deliveryRate: number | null;
  opens: number;
  opensTracked: boolean;
  openRate: number | null;
  replies: number;
  replyRate: number | null;
  unsubscribes: number;
  unsubscribeRate: number | null;
  bounces: number;
  bounceRate: number | null;
  failed: number;
  notReached: number;
  suppressedOrSkipped: number;
  sendProofMissing: number;
  totalContacts: number;
  emailSendable: number;
};

export type RawMetricsCounts = {
  sentWithProof: number;
  sentProofMissing: number;
  delivered: number;
  deliveryTracked: boolean;
  opens: number;
  opensTracked: boolean;
  replies: number;
  unsubscribes: number;
  bounces: number;
  failed: number;
  suppressedOrSkipped: number;
  totalContacts: number;
  emailSendable: number;
};

function safeRate(numerator: number, denominator: number): number | null {
  if (denominator === 0) return null;
  return Math.round((numerator / denominator) * 1000) / 10;
}

export function deriveOutreachMetrics(raw: RawMetricsCounts): OutreachMetrics {
  const sent = raw.sentWithProof;
  const notReached =
    raw.failed +
    raw.bounces +
    raw.suppressedOrSkipped +
    raw.sentProofMissing;

  return {
    sent,
    delivered: raw.deliveryTracked ? raw.delivered : 0,
    deliveryTracked: raw.deliveryTracked,
    deliveryRate: raw.deliveryTracked ? safeRate(raw.delivered, sent) : null,
    opens: raw.opensTracked ? raw.opens : 0,
    opensTracked: raw.opensTracked,
    openRate: raw.opensTracked
      ? safeRate(raw.opens, raw.delivered > 0 ? raw.delivered : sent)
      : null,
    replies: raw.replies,
    replyRate: safeRate(raw.replies, sent),
    unsubscribes: raw.unsubscribes,
    unsubscribeRate: safeRate(raw.unsubscribes, sent),
    bounces: raw.bounces,
    bounceRate: safeRate(raw.bounces, sent),
    failed: raw.failed,
    notReached,
    suppressedOrSkipped: raw.suppressedOrSkipped,
    sendProofMissing: raw.sentProofMissing,
    totalContacts: raw.totalContacts,
    emailSendable: raw.emailSendable,
  };
}

export type ClientMetricsRow = {
  clientId: string;
  clientName: string;
  metrics: OutreachMetrics;
};

export function formatRate(rate: number | null): string {
  if (rate === null) return "—";
  return `${rate}%`;
}

export function formatTrackedMetric(
  value: number,
  tracked: boolean,
): string {
  return tracked ? value.toLocaleString() : "Not tracked";
}
