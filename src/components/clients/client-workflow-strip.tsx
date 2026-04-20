import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import type { ClientWorkflowStep, WorkflowStepStatus } from "@/lib/client-launch-state";
import { cn } from "@/lib/utils";

function statusLabel(s: WorkflowStepStatus): string {
  switch (s) {
    case "complete":
      return "Complete";
    case "ready":
      return "Ready";
    case "needs_attention":
      return "Needs attention";
    default:
      return "Not started";
  }
}

function statusBadgeClass(s: WorkflowStepStatus): string {
  switch (s) {
    case "complete":
      return "bg-primary text-primary-foreground hover:bg-primary/90";
    case "ready":
      return "bg-secondary text-secondary-foreground";
    case "needs_attention":
      return "border-amber-500/60 bg-amber-500/10 text-amber-950 dark:text-amber-100";
    default:
      return "";
  }
}

export function ClientWorkflowStrip({ steps }: { steps: ClientWorkflowStep[] }) {
  return (
    <div className="overflow-x-auto pb-1">
      <ol className="flex min-w-[720px] gap-2 md:min-w-0 md:flex-wrap">
        {steps.map((step, i) => (
          <li key={step.id} className="flex min-w-[140px] flex-1 flex-col gap-1.5 rounded-lg border border-border/80 bg-card p-3 shadow-sm">
            <div className="flex items-start justify-between gap-2">
              <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                {i + 1}. {step.label}
              </span>
              <Badge
                variant="outline"
                className={cn("shrink-0 text-[10px] font-normal", statusBadgeClass(step.status))}
              >
                {statusLabel(step.status)}
              </Badge>
            </div>
            <p className="line-clamp-2 text-xs text-muted-foreground">{step.metric}</p>
            <Link
              href={step.href}
              className="text-xs font-medium text-primary underline-offset-4 hover:underline"
            >
              Open →
            </Link>
          </li>
        ))}
      </ol>
    </div>
  );
}
