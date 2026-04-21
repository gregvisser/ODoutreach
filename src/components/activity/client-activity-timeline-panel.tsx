import { format } from "date-fns";

import { Badge } from "@/components/ui/badge";
import {
  eventTypeLabel,
  severityLabel,
  UNTRACKED_EVENT_TYPES,
  type BuildTimelineResult,
  type TimelineEvent,
  type TimelineEventSeverity,
} from "@/lib/activity/client-activity-timeline";
import { cn } from "@/lib/utils";

/**
 * PR H — Activity timeline panel.
 *
 * Pure presentational component. Takes the already-built
 * `BuildTimelineResult` from `loadClientActivityTimeline` and renders a
 * responsive summary strip plus a vertical event list. Does not fetch
 * data and does not mutate anything.
 */

const SEVERITY_BADGE_VARIANT: Record<
  TimelineEventSeverity,
  "default" | "secondary" | "destructive" | "outline" | "ghost"
> = {
  info: "secondary",
  success: "default",
  warning: "outline",
  error: "destructive",
};

const SEVERITY_DOT_CLASS: Record<TimelineEventSeverity, string> = {
  info: "bg-muted-foreground/50",
  success: "bg-emerald-500",
  warning: "bg-amber-500",
  error: "bg-destructive",
};

function eventTimestamp(date: Date): string {
  try {
    return format(date, "yyyy-MM-dd HH:mm") + " UTC";
  } catch {
    return date.toISOString();
  }
}

function SummaryTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "default" | "warning" | "error";
}) {
  return (
    <div
      className={cn(
        "rounded-md border border-border/80 bg-card px-3 py-2 shadow-sm",
        tone === "warning" && "border-amber-400/60",
        tone === "error" && "border-destructive/50",
      )}
    >
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p
        className={cn(
          "mt-1 text-xl font-semibold tabular-nums",
          tone === "warning" && "text-amber-600",
          tone === "error" && "text-destructive",
        )}
      >
        {value}
      </p>
    </div>
  );
}

export function ClientActivityTimelinePanel({
  timeline,
}: {
  timeline: BuildTimelineResult;
}) {
  const { events, summary, capped } = timeline;

  const byType = summary.byType;
  const sendCount = byType.send ?? 0;
  const replyCount = byType.reply ?? 0;
  const inboundCount = byType.inbound_message ?? 0;
  const bounceCount = byType.bounce ?? 0;
  const importCount = byType.csv_import ?? 0;
  const templateCount = byType.template ?? 0;
  const sequenceCount = byType.sequence ?? 0;
  const enrollmentCount = byType.enrollment ?? 0;
  const listCount = byType.contact_list ?? 0;
  const mailboxCount = byType.mailbox_oauth ?? 0;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <SummaryTile label="Total events" value={summary.totalEvents} />
        <SummaryTile label="Sends" value={sendCount} />
        <SummaryTile label="Replies" value={replyCount + inboundCount} />
        <SummaryTile label="Imports" value={importCount} />
        <SummaryTile
          label="Templates / sequences"
          value={templateCount + sequenceCount}
        />
        <SummaryTile
          label="Warnings / errors"
          value={summary.warnings + summary.errors}
          tone={
            summary.errors > 0
              ? "error"
              : summary.warnings > 0
                ? "warning"
                : "default"
          }
        />
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground sm:grid-cols-4">
        <span>
          Bounces: <span className="font-medium text-foreground">{bounceCount}</span>
        </span>
        <span>
          Enrollments:{" "}
          <span className="font-medium text-foreground">{enrollmentCount}</span>
        </span>
        <span>
          Contact lists:{" "}
          <span className="font-medium text-foreground">{listCount}</span>
        </span>
        <span>
          Mailbox events:{" "}
          <span className="font-medium text-foreground">{mailboxCount}</span>
        </span>
      </div>

      {events.length === 0 ? (
        <div className="rounded-md border border-dashed border-border/80 bg-muted/20 px-4 py-8 text-center text-sm text-muted-foreground">
          No activity yet for this client.
        </div>
      ) : (
        <ol className="space-y-0 divide-y divide-border/70 rounded-md border border-border/80 bg-card">
          {events.map((event) => (
            <TimelineRow key={event.id} event={event} />
          ))}
        </ol>
      )}

      {capped ? (
        <p className="text-xs text-muted-foreground">
          Showing the most recent {events.length} events. Older activity is not
          listed here yet.
        </p>
      ) : null}

      <p className="rounded-md border border-dashed border-border/70 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
        Some operational events may appear here only after their feature starts
        writing audit records. Not yet tracked as discrete events:{" "}
        {UNTRACKED_EVENT_TYPES.map((t) => eventTypeLabel(t)).join(", ")}.
      </p>
    </div>
  );
}

function TimelineRow({ event }: { event: TimelineEvent }) {
  return (
    <li className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-start sm:gap-4">
      <div className="flex items-center gap-2 sm:w-48 sm:shrink-0">
        <span
          className={cn(
            "inline-block h-2 w-2 shrink-0 rounded-full",
            SEVERITY_DOT_CLASS[event.severity],
          )}
          aria-hidden="true"
        />
        <time
          className="font-mono text-xs text-muted-foreground"
          dateTime={event.occurredAt.toISOString()}
        >
          {eventTimestamp(event.occurredAt)}
        </time>
      </div>
      <div className="flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="font-normal">
            {eventTypeLabel(event.type)}
          </Badge>
          <Badge
            variant={SEVERITY_BADGE_VARIANT[event.severity]}
            className="font-normal"
          >
            {severityLabel(event.severity)}
          </Badge>
          <p className="text-sm font-medium text-foreground">{event.title}</p>
        </div>
        {event.description ? (
          <p className="text-xs text-muted-foreground">{event.description}</p>
        ) : null}
        {event.actorLabel &&
        event.description &&
        !event.description.includes(event.actorLabel) ? (
          <p className="text-[11px] text-muted-foreground">
            {event.actorLabel}
          </p>
        ) : null}
      </div>
    </li>
  );
}
