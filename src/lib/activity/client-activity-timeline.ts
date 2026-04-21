/**
 * PR H — pure view-model helpers for the client Activity timeline.
 *
 * The Activity page aggregates events from several tables (`OutboundEmail`,
 * `InboundMailboxMessage`, `InboundReply`, `ContactImportBatch`,
 * `ContactList`, `ClientEmailTemplate`, `ClientEmailSequence`,
 * `ClientEmailSequenceEnrollment`, `AuditLog`). The server query layer
 * (`src/server/activity/client-activity.ts`) converts each row into a
 * uniform `TimelineEvent` shape, then this helper sorts, caps, and
 * summarizes them without touching Prisma.
 *
 * Honesty rule: event types that have no persistence source today are
 * listed in `UNTRACKED_EVENT_TYPES` so the UI can render a small
 * "not yet tracked" note instead of silently pretending they don't
 * exist. We do NOT fabricate events for those types.
 */

export type TimelineEventType =
  | "send"
  | "reply"
  | "bounce"
  | "error"
  | "inbound_message"
  | "csv_import"
  | "rocketreach_import"
  | "contact_list"
  | "list_membership"
  | "suppression_sync"
  | "mailbox_oauth"
  | "template"
  | "sequence"
  | "enrollment"
  | "step_send"
  | "audit";

export type TimelineEventSeverity = "info" | "success" | "warning" | "error";

export type TimelineEvent = {
  id: string;
  occurredAt: Date;
  type: TimelineEventType;
  title: string;
  description?: string;
  actorLabel?: string;
  severity: TimelineEventSeverity;
  href?: string;
  /** The Prisma model the event was derived from, for debugging/UX copy. */
  sourceModel: string;
};

/**
 * Event types we intentionally do NOT render today because no table
 * writes a row per run. These surface as a small "tracked elsewhere"
 * advisory on the UI — we never synthesize fake events.
 *
 *   - `rocketreach_import`: RocketReach imports run inline and do not
 *     create a ContactImportBatch row today. They'll be first-class
 *     once the importer shares the CSV batch pipeline.
 *   - `suppression_sync`: `SuppressionSource.lastSyncedAt` is a pointer,
 *     not an event log. Historical runs aren't preserved.
 *   - `list_membership`: `ContactListMember.addedAt` is per-row. The
 *     timeline rolls these up into the parent `csv_import` event
 *     summary instead of exploding into per-contact events.
 */
export const UNTRACKED_EVENT_TYPES: readonly TimelineEventType[] = [
  "rocketreach_import",
  "suppression_sync",
  "list_membership",
] as const;

export type TimelineEventCounts = Partial<Record<TimelineEventType, number>>;

export type TimelineSummary = {
  totalEvents: number;
  byType: TimelineEventCounts;
  warnings: number;
  errors: number;
  /** ISO string of the most recent event, or null when empty. */
  latestAtIso: string | null;
};

export type BuildTimelineResult = {
  events: TimelineEvent[];
  summary: TimelineSummary;
  capped: boolean;
};

export const DEFAULT_TIMELINE_LIMIT = 100;

function isValidDate(d: Date): boolean {
  return d instanceof Date && !Number.isNaN(d.getTime());
}

/**
 * Sort by `occurredAt` desc, then by id desc for stable ordering across
 * events that share a timestamp (e.g. batched enrollments). Cap the list
 * at `limit` and build a roll-up summary the UI can render as the top
 * strip. Events with invalid timestamps are dropped so the timeline is
 * never polluted by source-data corruption.
 */
export function buildClientTimeline(
  rawEvents: readonly TimelineEvent[],
  limit: number = DEFAULT_TIMELINE_LIMIT,
): BuildTimelineResult {
  const filtered = rawEvents.filter((e) => isValidDate(e.occurredAt));
  const sorted = [...filtered].sort((a, b) => {
    const tb = b.occurredAt.getTime();
    const ta = a.occurredAt.getTime();
    if (tb !== ta) return tb - ta;
    return b.id.localeCompare(a.id);
  });

  const effectiveLimit = Math.max(1, Math.min(limit, 500));
  const capped = sorted.length > effectiveLimit;
  const events = capped ? sorted.slice(0, effectiveLimit) : sorted;

  const byType: TimelineEventCounts = {};
  let warnings = 0;
  let errors = 0;
  for (const evt of events) {
    byType[evt.type] = (byType[evt.type] ?? 0) + 1;
    if (evt.severity === "warning") warnings += 1;
    else if (evt.severity === "error") errors += 1;
  }

  const latestAtIso = events.length > 0 ? events[0]!.occurredAt.toISOString() : null;

  return {
    events,
    summary: {
      totalEvents: events.length,
      byType,
      warnings,
      errors,
      latestAtIso,
    },
    capped,
  };
}

/** Stable display label for each event type (also used by the summary strip). */
const EVENT_TYPE_LABELS: Record<TimelineEventType, string> = {
  send: "Send",
  reply: "Reply",
  bounce: "Bounce",
  error: "Error",
  inbound_message: "Inbound message",
  csv_import: "CSV import",
  rocketreach_import: "RocketReach import",
  contact_list: "Contact list",
  list_membership: "List membership",
  suppression_sync: "Suppression sync",
  mailbox_oauth: "Mailbox connection",
  template: "Template",
  sequence: "Sequence",
  enrollment: "Enrollment",
  step_send: "Sequence step send",
  audit: "Audit",
};

export function eventTypeLabel(type: TimelineEventType): string {
  return EVENT_TYPE_LABELS[type];
}

const SEVERITY_LABELS: Record<TimelineEventSeverity, string> = {
  info: "Info",
  success: "Success",
  warning: "Warning",
  error: "Error",
};

export function severityLabel(severity: TimelineEventSeverity): string {
  return SEVERITY_LABELS[severity];
}

/**
 * Map an `OutboundEmail.status` string to the right event type + severity
 * so a single raw row produces one row-appropriate timeline entry.
 *
 * Supported statuses (mirrors `OutboundEmailStatus` in prisma/schema):
 *   PREPARING / REQUESTED / QUEUED / PROCESSING → send (info)
 *   SENT / DELIVERED                             → send (success)
 *   REPLIED                                      → send (success)
 *   BOUNCED                                      → bounce (warning)
 *   BLOCKED_SUPPRESSION                          → send (warning)
 *   FAILED                                       → error (error)
 *
 * Any unknown status collapses to `send` / `info` rather than throwing,
 * so a new ESP state can appear without breaking the Activity page.
 */
export function classifyOutboundStatus(status: string): {
  type: TimelineEventType;
  severity: TimelineEventSeverity;
} {
  switch (status) {
    case "SENT":
    case "DELIVERED":
    case "REPLIED":
      return { type: "send", severity: "success" };
    case "BOUNCED":
      return { type: "bounce", severity: "warning" };
    case "FAILED":
      return { type: "error", severity: "error" };
    case "BLOCKED_SUPPRESSION":
      return { type: "send", severity: "warning" };
    case "PREPARING":
    case "REQUESTED":
    case "QUEUED":
    case "PROCESSING":
    default:
      return { type: "send", severity: "info" };
  }
}

/**
 * Map a `ContactImportBatch.status` to event severity. The event type is
 * always `csv_import` — status drives the badge colour and copy.
 */
export function classifyImportBatchStatus(status: string): TimelineEventSeverity {
  switch (status) {
    case "COMPLETED":
      return "success";
    case "FAILED":
      return "error";
    case "PROCESSING":
      return "info";
    case "PENDING":
    default:
      return "info";
  }
}

/**
 * PR D4e.1 — classify a `ClientEmailSequenceStepSend.status` for the
 * Activity timeline. Records-only statuses (PLANNED/READY/SKIPPED)
 * render as info; SUPPRESSED/BLOCKED as warning; FAILED as error;
 * SENT as success (D4e.2+).
 */
export function classifyStepSendStatus(
  status: string,
): TimelineEventSeverity {
  switch (status) {
    case "SENT":
      return "success";
    case "SUPPRESSED":
    case "BLOCKED":
      return "warning";
    case "FAILED":
      return "error";
    case "PLANNED":
    case "READY":
    case "SKIPPED":
    default:
      return "info";
  }
}
