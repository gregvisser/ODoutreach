import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import type { SenderReadinessReport } from "@/lib/sender-readiness";
import {
  deliveryLineForMailboxesOperator,
  filterSenderReadinessChecksForMailboxesOperator,
  readinessSummaryForMailboxesOperator,
} from "@/lib/mailboxes/sender-readiness-operator-mailboxes";
import { cn } from "@/lib/utils";

export function SenderReadinessHeadlineBadge({
  headline,
}: {
  headline: SenderReadinessReport["headline"];
}) {
  return headlineBadge(headline, "operations");
}

type ReadinessViewContext = "operations" | "mailboxesClient";

function headlineBadge(h: SenderReadinessReport["headline"], context: ReadinessViewContext) {
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
      return context === "mailboxesClient" ? (
        <Badge
          variant="secondary"
          title="The platform is in a non-production or test style mode. Connect a mailbox in this list for how real outreach sends are delivered."
        >
          Platform: test or mock mode
        </Badge>
      ) : (
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
  viewContext = "operations",
}: {
  report: SenderReadinessReport;
  compact?: boolean;
  /**
   * Mailboxes: strip legacy transport and env-specific wording so operators
   * never see `EMAIL_PROVIDER` or third-party product names in this panel
   * (this panel is already under "Advanced details").
   */
  viewContext?: ReadinessViewContext;
}) {
  const mailboxesPolish = viewContext === "mailboxesClient";
  const providerLine = mailboxesPolish
    ? deliveryLineForMailboxesOperator(report)
    : deliveryLabel(report);
  const summary = mailboxesPolish ? readinessSummaryForMailboxesOperator(report) : report.summary;
  const checks = mailboxesPolish
    ? filterSenderReadinessChecksForMailboxesOperator(report.checks)
    : report.checks;

  return (
    <div className={cn("space-y-3 text-sm", compact && "text-xs")}>
      <div className="flex flex-wrap items-center gap-2">
        {headlineBadge(report.headline, viewContext)}
        <span className="text-muted-foreground">
          Delivery: <span className="text-foreground">{providerLine}</span>
        </span>
      </div>
      <p className="text-foreground">{summary}</p>
      <p>
        <span className="text-muted-foreground">Sends as (preview): </span>
        <span className="font-medium">{report.effectiveFrom}</span>
      </p>
      <ul className="space-y-2 border-t border-border pt-3">
        {checks.map((c) => (
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
      {!compact && mailboxesPolish ? (
        <div className="border-t border-border pt-3 text-xs text-muted-foreground leading-relaxed">
          <p>
            <strong className="text-foreground">About this section:</strong> It summarises
            how sender and preview data fit together. Normal prospect outreach is meant to
            go through the connected mailboxes on this page. If your process still has extra
            governance in the <strong className="text-foreground">operations</strong> area, use{" "}
            <Link className="underline" href="/operations/outbound">
              Outbound
            </Link>{" "}
            with an administrator. Per-mailbox work stays here in{" "}
            <strong className="text-foreground">Mailboxes</strong>.
          </p>
        </div>
      ) : null}
      {!compact && !mailboxesPolish ? (
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
