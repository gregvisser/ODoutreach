/**
 * F5 — registry of the Reports metrics that drill down to an underlying row
 * list. Pure + shared by the reporting page (to build the drill-down links)
 * and the detail route/query (to validate the requested metric and label it),
 * so a metric can never be linked one way and rendered another.
 *
 * Only metrics with a well-defined row set are listed. Derived figures (e.g.
 * "send proof missing", which is a computed gap, and "not reached", a sum of
 * other cells) are intentionally NOT drillable — linking them would risk a
 * list that doesn't equal the number it came from.
 *
 * `windowed` mirrors `gatherRawCounts` in server/queries/outreach-metrics.ts:
 * event metrics honour the selected date range; state metrics ("right now"
 * values: queued, suppressed/skipped) ignore it. Keep the two in lock-step.
 */

export type ReportDetailMetricKey =
  | "sent"
  | "queued"
  | "delivered"
  | "opens"
  | "replies"
  | "unsubscribes"
  | "bounces"
  | "failed"
  | "suppressed";

export type ReportDetailMetricDef = {
  key: ReportDetailMetricKey;
  /** Matches the card/cell label on the Reports page. */
  label: string;
  /** True if the selected date range filters this metric's rows. */
  windowed: boolean;
  /** One-line description of what each row represents. */
  rowsDescription: string;
};

export const REPORT_DETAIL_METRICS: Record<
  ReportDetailMetricKey,
  ReportDetailMetricDef
> = {
  sent: {
    key: "sent",
    label: "Sent, confirmed",
    windowed: true,
    rowsDescription:
      "Emails the mailbox confirmed it took.",
  },
  queued: {
    key: "queued",
    label: "Queued / preparing",
    windowed: false,
    rowsDescription:
      "Outbound emails still waiting on the sender — a live snapshot, no history.",
  },
  delivered: {
    key: "delivered",
    label: "Delivered",
    windowed: true,
    rowsDescription: "Outbound emails a provider webhook confirmed delivered.",
  },
  opens: {
    key: "opens",
    label: "Opens",
    windowed: true,
    rowsDescription:
      "Outbound emails whose tracking pixel loaded at least once (approximate).",
  },
  replies: {
    key: "replies",
    label: "Replies",
    windowed: true,
    rowsDescription: "Inbound replies linked to one of this scope's sends.",
  },
  unsubscribes: {
    key: "unsubscribes",
    label: "Opt-outs",
    windowed: true,
    rowsDescription: "Recipients who used a one-click unsubscribe link.",
  },
  bounces: {
    key: "bounces",
    label: "Bounces",
    windowed: true,
    rowsDescription: "Outbound emails the provider reported as bounced.",
  },
  failed: {
    key: "failed",
    label: "Failed",
    windowed: true,
    rowsDescription: "Outbound emails that failed before/at send.",
  },
  suppressed: {
    key: "suppressed",
    label: "Suppressed / skipped",
    windowed: false,
    rowsDescription:
      "Sequence sends held back by suppression/skip/block (excludes cooldown deferrals).",
  },
};

export const REPORT_DETAIL_METRIC_KEYS = Object.keys(
  REPORT_DETAIL_METRICS,
) as ReportDetailMetricKey[];

/** True if `value` names a metric that supports a row-level drill-down. */
export function isReportDetailMetric(
  value: string,
): value is ReportDetailMetricKey {
  return Object.prototype.hasOwnProperty.call(REPORT_DETAIL_METRICS, value);
}

/** Validate an untrusted `?metric=` query value; null when not drillable. */
export function parseReportDetailMetric(
  value: string | null | undefined,
): ReportDetailMetricKey | null {
  if (!value) return null;
  return isReportDetailMetric(value) ? value : null;
}

/** Display label for a metric key (falls back to the raw key defensively). */
export function reportDetailMetricLabel(value: string): string {
  return isReportDetailMetric(value)
    ? REPORT_DETAIL_METRICS[value].label
    : value;
}
