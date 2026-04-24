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
    case "mock_dev":
      return (
        <Badge variant="secondary" title="EMAIL_PROVIDER=mock — no external delivery">
          No external delivery
        </Badge>
      );
    case "needs_verification":
      return <Badge variant="outline" className="border-amber-500/50 text-amber-800 dark:text-amber-200">
        Needs attention
      </Badge>;
    case "not_configured":
      return <Badge variant="outline">Missing</Badge>;
    case "blocked_by_domain_policy":
      return <Badge variant="destructive">Blocked</Badge>;
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

export function SenderReadinessPanel({
  report,
  compact,
}: {
  report: SenderReadinessReport;
  compact?: boolean;
}) {
  const providerLabel =
    report.providerMode === "resend"
      ? "Resend"
      : report.providerMode === "mock"
        ? "Mock transport (not delivered externally)"
        : report.providerMode;

  return (
    <div className={cn("space-y-3 text-sm", compact && "text-xs")}>
      <div className="flex flex-wrap items-center gap-2">
        {headlineBadge(report.headline)}
        <span className="text-muted-foreground">
          Delivery: <span className="text-foreground">{providerLabel}</span>
        </span>
      </div>
      <p className="text-foreground">{report.summary}</p>
      <p>
        <span className="text-muted-foreground">Sends as: </span>
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
              A sender is <strong className="text-foreground">ready</strong>{" "}
              when the workspace has a default From address, an operator has
              marked it verified inside OpensDoors, and the sending domain is
              verified with the email provider (DKIM, etc.).
            </p>
            <p>
              Operators can update readiness from the{" "}
              <Link className="underline" href="/operations/outbound">
                operations area
              </Link>
              . Sending-domain verification happens in the email provider&apos;s
              dashboard.
            </p>
          </div>
        </details>
      ) : null}
    </div>
  );
}
