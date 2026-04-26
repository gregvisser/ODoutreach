import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import type { SenderReadinessReport } from "@/lib/sender-readiness";
import { cn } from "@/lib/utils";

export function SenderReadinessHeadlineBadge({
  headline,
}: {
  headline: SenderReadinessReport["headline"];
}) {
  return headlineBadge(headline);
}

function headlineBadge(h: SenderReadinessReport["headline"]) {
  switch (h) {
    case "ready":
      return <Badge className="bg-emerald-600/15 text-emerald-800 dark:text-emerald-200">Ready</Badge>;
    case "mailbox_outreach_ready":
      return (
        <Badge className="bg-emerald-600/15 text-emerald-800 dark:text-emerald-200">
          Mailbox outreach ready
        </Badge>
      );
    case "mock_dev":
      return (
        <Badge variant="secondary" title="Legacy global transport (EMAIL_PROVIDER) is mock or unset — not the primary client outreach path when mailboxes are connected">
          Legacy transport: mock
        </Badge>
      );
    case "needs_verification":
      return (
        <Badge variant="outline" className="border-amber-500/50 text-amber-800 dark:text-amber-200">
          Needs attention
        </Badge>
      );
    case "not_configured":
      return <Badge variant="outline">Missing</Badge>;
    case "blocked_by_domain_policy":
      return <Badge variant="destructive">Blocked</Badge>;
    case "mailboxes_need_connection":
      return (
        <Badge variant="outline" className="border-amber-500/50 text-amber-800 dark:text-amber-200">
          Mailboxes need connection
        </Badge>
      );
  }
}

function stateDot(state: SenderReadinessReport["checks"][0]["state"]) {
  const map = {
    pass: "bg-emerald-500",
    warn: "bg-amber-500",
    fail: "bg-red-500",
    na: "bg-muted-foreground/40",
  } as const;
  return <span className={cn("inline-block size-2 shrink-0 rounded-full", map[state])} title={state} />;
}

function deliveryLabel(report: SenderReadinessReport): string {
  if (report.outreachSendsVia === "mailboxes") {
    return "Client outreach: Microsoft / Google (connected mailboxes)";
  }
  if (report.outreachSendsVia === "unassessed") {
    return report.providerMode === "resend"
      ? "Legacy global: Resend (no mailbox data in this view)"
      : "Legacy global: mock or unset (no mailbox data in this view)";
  }
  return report.providerMode === "resend"
    ? "No eligible mailbox — legacy path can use Resend"
    : "No eligible mailbox — legacy path is mock or unset";
}

export function SenderReadinessPanel({
  report,
  compact,
}: {
  report: SenderReadinessReport;
  compact?: boolean;
}) {
  const providerLine = deliveryLabel(report);

  return (
    <div className={cn("space-y-3 text-sm", compact && "text-xs")}>
      <div className="flex flex-wrap items-center gap-2">
        {headlineBadge(report.headline)}
        <span className="text-muted-foreground">
          Delivery: <span className="text-foreground">{providerLine}</span>
        </span>
      </div>
      <p className="text-foreground">{report.summary}</p>
      <p>
        <span className="text-muted-foreground">Sends as (preview): </span>
        <span className="font-medium">{report.effectiveFrom}</span>
      </p>
      <ul className="space-y-2 border-t border-border pt-3">
        {report.checks.map((c) => (
          <li key={c.id} className="flex gap-2">
            {stateDot(c.state)}
            <div>
              <span className="font-medium">{c.label}</span>
              {c.detail ? (
                <p className="text-muted-foreground mt-0.5 leading-snug">{c.detail}</p>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
      {!compact ? (
        <details className="border-t border-border pt-3 text-xs text-muted-foreground">
          <summary className="cursor-pointer font-medium text-foreground">
            About sender readiness
          </summary>
          <div className="mt-2 space-y-1.5 leading-relaxed">
            <p>
              <strong className="text-foreground">Client outreach</strong> sends (sequences, contact
              sends) are designed to go through{" "}
              <strong className="text-foreground">connected Microsoft 365 or Google mailboxes</strong>{" "}
              in the workspace pool — not through a single global email API. Resend /{" "}
              <code className="text-foreground">EMAIL_PROVIDER</code> applies to{" "}
              <strong className="text-foreground">legacy</strong> outbound rows without a mailbox
              link, or platform mail — not the normal prospect path when mailboxes are connected.
            </p>
            <p>
              Mark client-level verification in the{" "}
              <Link className="underline" href="/operations/outbound">
                operations area
              </Link>{" "}
              when your process still uses that signal; per-mailbox setup is on{" "}
              <strong className="text-foreground">Mailboxes</strong>.
            </p>
          </div>
        </details>
      ) : null}
    </div>
  );
}
