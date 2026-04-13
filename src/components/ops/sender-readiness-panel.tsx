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
      return <Badge variant="secondary">Mock / dev</Badge>;
    case "needs_verification":
      return <Badge variant="outline" className="border-amber-500/50 text-amber-800 dark:text-amber-200">
        Needs verification
      </Badge>;
    case "not_configured":
      return <Badge variant="outline">Not configured</Badge>;
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
  return (
    <div className={cn("space-y-3 text-sm", compact && "text-xs")}>
      <div className="flex flex-wrap items-center gap-2">
        {headlineBadge(report.headline)}
        <span className="text-muted-foreground">
          Provider: <span className="font-mono text-foreground">{report.providerMode}</span>
        </span>
        <span className="text-muted-foreground">
          DB status:{" "}
          <span className="font-mono text-foreground">{report.identityStatus}</span>
        </span>
      </div>
      <p className="text-foreground">{report.summary}</p>
      <p>
        <span className="text-muted-foreground">Effective From (preview): </span>
        <span className="font-mono">{report.effectiveFrom}</span>
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
        <p className="text-xs text-muted-foreground border-t border-border pt-3">
          <strong className="text-foreground">Configured</strong> = workspace has a default From address.{" "}
          <strong className="text-foreground">Verified (app)</strong> = operators marked VERIFIED_READY after
          Resend checks. <strong className="text-foreground">Verified (ESP)</strong> = domain/DKIM in the
          Resend dashboard — still required independently. See{" "}
          <Link className="underline" href="/operations/outbound">
            Outbound ops
          </Link>{" "}
          to mark readiness.
        </p>
      ) : null}
    </div>
  );
}
