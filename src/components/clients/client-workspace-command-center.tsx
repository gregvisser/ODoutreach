import { Badge } from "@/components/ui/badge";
import { ClientWorkflowStrip } from "@/components/clients/client-workflow-strip";
import type { ClientWorkflowStep } from "@/lib/client-launch-state";

type Props = {
  clientName: string;
  clientSlug: string;
  clientStatus: string;
  launchStageLabel: string;
  steps: ClientWorkflowStep[];
};

export function ClientWorkspaceCommandCenter({
  clientName,
  clientSlug,
  clientStatus,
  launchStageLabel,
  steps,
}: Props) {
  return (
    <section aria-label="Client workspace header" className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1.5">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Client workspace
          </p>
          <h1 className="truncate font-heading text-2xl font-semibold tracking-tight text-foreground">
            {clientName}
          </h1>
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
            <span>
              Slug <span className="font-mono text-foreground">{clientSlug}</span>
            </span>
            <Badge variant="outline">{clientStatus}</Badge>
          </p>
        </div>
        <Badge variant="secondary" className="self-start">
          {launchStageLabel}
        </Badge>
      </div>

      <div className="space-y-2">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 className="text-sm font-semibold text-foreground">Workflow</h2>
          <p className="text-xs text-muted-foreground">
            Follow the client setup path. Open a module to fix details.
          </p>
        </div>
        <ClientWorkflowStrip steps={steps} />
      </div>
    </section>
  );
}
