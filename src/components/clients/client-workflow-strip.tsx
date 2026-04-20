import Link from "next/link";

import type { ClientWorkflowStep, WorkflowStepStatus } from "@/lib/client-launch-state";
import { cn } from "@/lib/utils";

function statusDotClass(s: WorkflowStepStatus): string {
  switch (s) {
    case "complete":
      return "bg-primary";
    case "ready":
      return "bg-sky-500";
    case "needs_attention":
      return "bg-amber-500";
    default:
      return "bg-muted-foreground/40";
  }
}

function statusSrText(s: WorkflowStepStatus): string {
  switch (s) {
    case "complete":
      return "complete";
    case "ready":
      return "ready";
    case "needs_attention":
      return "needs attention";
    default:
      return "not started";
  }
}

export function ClientWorkflowStrip({ steps }: { steps: ClientWorkflowStep[] }) {
  return (
    <nav aria-label="Client setup workflow" className="-mx-1 overflow-x-auto pb-1">
      <ol className="flex min-w-max gap-1.5 px-1 sm:min-w-0 sm:flex-wrap">
        {steps.map((step, i) => (
          <li key={step.id}>
            <Link
              href={step.href}
              className={cn(
                "inline-flex items-center gap-2 rounded-full border border-border/80 bg-card/80",
                "px-3 py-1.5 text-xs font-medium text-foreground transition-colors",
                "hover:bg-muted/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
              )}
            >
              <span
                aria-hidden
                className={cn("size-2 shrink-0 rounded-full", statusDotClass(step.status))}
              />
              <span className="text-muted-foreground">{i + 1}</span>
              <span>{step.label}</span>
              <span className="sr-only">— {statusSrText(step.status)}</span>
            </Link>
          </li>
        ))}
      </ol>
    </nav>
  );
}
