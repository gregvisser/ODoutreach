/**
 * PR #132 — Outreach metrics contract.
 *
 * Pure derivation from database counts. No DB access here —
 * the server queries feed raw counts, this module computes
 * rates and labels.
 */

export type OutreachMetrics = {
  sent: number;
  queued: number;
  delivered: number;
  deliveryTracked: boolean;
  deliveryRate: number | null;
  opens: number;
  opensTracked: boolean;
  openRate: number | null;
  replies: number;
  /**
   * How many SENT EMAILS drew at least one reply. This is the numerator of
   * `replyRate`; `replies` is the count of reply MESSAGES, which can be
   * larger (one prospect replying three times is three messages on one
   * email). See the note on `replyRate`.
   */
  repliedEmails: number;
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
  queued: number;
  sentProofMissing: number;
  delivered: number;
  deliveryTracked: boolean;
  opens: number;
  opensTracked: boolean;
  replies: number;
  repliedEmails: number;
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
    queued: raw.queued,
    delivered: raw.deliveryTracked ? raw.delivered : 0,
    deliveryTracked: raw.deliveryTracked,
    deliveryRate: raw.deliveryTracked ? safeRate(raw.delivered, sent) : null,
    opens: raw.opensTracked ? raw.opens : 0,
    opensTracked: raw.opensTracked,
    openRate: raw.opensTracked
      ? safeRate(raw.opens, raw.delivered > 0 ? raw.delivered : sent)
      : null,
    replies: raw.replies,
    repliedEmails: raw.repliedEmails,
    // Queue item 27, defect (8). This used to be `replies / sent` — reply
    // MESSAGES over emails SENT, which are different units. Live production
    // showed "reply rate 133.3%" for BidlowAI on 3 sends and 4 messages, and
    // a percentage over 100 teaches a client to distrust the whole page.
    // The numerator is now the count of sent emails that drew at least one
    // reply, which the query layer derives as a strict subset of the same
    // rows that make up `sent` — so this cannot exceed 100%.
    replyRate: safeRate(raw.repliedEmails, sent),
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

/**
 * Queue item 133, finding 3 — "the bounce rate shows nothing." Measured
 * against production (docs/ops/BOUNCE-RATE-DISPLAY-2026-08-31.md): the
 * bounce-detection pipeline is proven firing (real bounces exist and are
 * counted correctly), and a client that has sent mail with zero bounces
 * already shows a real "0%" — that case was never blank.
 *
 * The genuine gap is the OTHER null case `formatRate` collapses onto the
 * same "—": a client that has not sent anything yet. A bare dash next to
 * "Bounce rate" looks identical to a broken metric. This gives that case
 * its own, explained, non-blank label.
 */
export function formatBounceRate(
  bounceRate: number | null,
  sent: number,
): string {
  if (sent === 0) return "No emails sent yet";
  return formatRate(bounceRate);
}
