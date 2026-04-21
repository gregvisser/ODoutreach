import { notFound } from "next/navigation";

import { ClientActivityTimelinePanel } from "@/components/activity/client-activity-timeline-panel";
import { ClientMailboxInboxPanel } from "@/components/clients/client-mailbox-inbox-panel";
import { RecentGovernedSendsPanel } from "@/components/clients/recent-governed-sends-panel";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { utcDateKeyForInstant } from "@/lib/sending-window";
import { requireOpensDoorsStaff } from "@/server/auth/staff";
import { loadClientActivityTimeline } from "@/server/activity/client-activity";
import { loadClientWorkspaceBundle } from "@/server/queries/client-workspace-bundle";
import { getAccessibleClientIds } from "@/server/tenant/access";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ clientId: string }>;
};

export default async function ClientActivityPage({ params }: Props) {
  const staff = await requireOpensDoorsStaff();
  const accessible = await getAccessibleClientIds(staff);
  const { clientId } = await params;

  const bundle = await loadClientWorkspaceBundle(clientId, accessible, staff);
  if (!bundle.client) notFound();

  const [timeline] = await Promise.all([
    loadClientActivityTimeline(bundle.client.id),
  ]);

  const currentUtcWindowKey = utcDateKeyForInstant(new Date());

  return (
    <div className="space-y-8">
      <div>
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Activity
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">
          {bundle.client.name}
        </h1>
        <p className="mt-1 text-muted-foreground">
          Recent sends, replies, imports, lists, templates, sequences, and
          system events for this client.
        </p>
      </div>

      <Card className="border-border/80 shadow-sm">
        <CardHeader>
          <CardTitle>Activity timeline</CardTitle>
          <CardDescription>
            Unified view of operator and system events across this workspace.
            Read-only — no actions are taken from this page.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ClientActivityTimelinePanel timeline={timeline} />
        </CardContent>
      </Card>

      <Card className="border-border/80 shadow-sm">
        <CardHeader>
          <CardTitle>Recent governed sends (details)</CardTitle>
          <CardDescription>
            Governed test and controlled pilot rows with UTC-day reservation
            detail. Use the timeline above for a chronological view.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RecentGovernedSendsPanel
            rows={bundle.recentGovernedSends}
            currentUtcWindowKey={currentUtcWindowKey}
          />
        </CardContent>
      </Card>

      <Card className="border-border/80 shadow-sm">
        <CardHeader>
          <CardTitle>Mailbox inbox (preview)</CardTitle>
          <CardDescription>
            Recent messages from connected Microsoft 365 or Google Workspace
            mailboxes.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ClientMailboxInboxPanel
            clientId={bundle.client.id}
            messages={bundle.graphInboxRows}
            connectedMailboxes={bundle.connectedMailboxInbox}
            canSync={bundle.canMutateMailboxes}
            oauthMicrosoftReady={bundle.oauthMicrosoftReady}
            oauthGoogleReady={bundle.oauthGoogleReady}
          />
        </CardContent>
      </Card>
    </div>
  );
}
