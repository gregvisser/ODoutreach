import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
    <Card className="border-border/80 shadow-sm">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>Command center</CardTitle>
            <CardDescription>
              Operating pathway: Brief → Mailboxes → Sources → Suppression → Contacts → Outreach →
              Activity. Open any step to run that module for this workspace.
            </CardDescription>
          </div>
          <Badge variant="secondary" className="shrink-0">
            {launchStageLabel}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <p className="text-lg font-semibold tracking-tight">{clientName}</p>
          <p className="text-sm text-muted-foreground">
            Slug <span className="font-mono text-foreground">{clientSlug}</span> ·{" "}
            <Badge variant="outline">{clientStatus}</Badge>
          </p>
        </div>
        <ClientWorkflowStrip steps={steps} />
      </CardContent>
    </Card>
  );
}
