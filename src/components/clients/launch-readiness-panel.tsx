import Link from "next/link";
import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import {
  launchReadinessPillLabel,
  type LaunchReadinessPillStatus,
  type LaunchReadinessRow,
} from "@/lib/client-launch-state";
import { cn } from "@/lib/utils";

function pillBadgeProps(status: LaunchReadinessPillStatus): {
  variant: "default" | "secondary" | "destructive" | "outline";
  className?: string;
} {
  switch (status) {
    case "ready":
      return { variant: "default" };
    case "needs_attention":
      return { variant: "outline", className: "border-amber-500/50 text-amber-950 dark:text-amber-100" };
    case "not_started":
      return { variant: "secondary" };
    case "reduced_capacity":
      return { variant: "outline" };
    case "monitoring":
      return { variant: "outline", className: "border-sky-500/40 text-sky-950 dark:text-sky-100" };
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

export function LaunchReadinessPanel({
  rows,
  technicalChecks,
}: {
  rows: LaunchReadinessRow[];
  technicalChecks: ReactNode;
}) {
  return (
    <div className="space-y-4">
      <ul className="divide-y rounded-lg border border-border/80">
        {rows.map((row) => {
          const pill = pillBadgeProps(row.pillStatus);
          return (
            <li
              key={row.id}
              className="flex flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
            >
              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
                <span className="w-24 shrink-0 text-sm font-medium text-foreground">{row.label}</span>
                <Badge
                  variant={pill.variant}
                  className={cn("shrink-0", pill.className)}
                >
                  {launchReadinessPillLabel(row.pillStatus)}
                </Badge>
                <span className="min-w-0 text-sm text-muted-foreground">{row.metric}</span>
              </div>
              <Link
                href={row.href}
                className="shrink-0 text-sm font-medium text-primary underline-offset-4 hover:underline sm:text-right"
              >
                {row.actionLabel}
              </Link>
            </li>
          );
        })}
      </ul>

      <details className="rounded-lg border border-border/80 bg-muted/20">
        <summary className="cursor-pointer list-none px-3 py-2.5 text-sm font-medium text-foreground select-none marker:hidden [&::-webkit-details-marker]:hidden">
          View technical checks
        </summary>
        <div className="border-t border-border/80 px-3 py-3">{technicalChecks}</div>
      </details>
    </div>
  );
}
