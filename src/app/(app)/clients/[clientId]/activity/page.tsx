import { notFound } from "next/navigation";
import Link from "next/link";

import { ClientActivityTimelinePanel } from "@/components/activity/client-activity-timeline-panel";
import { ClientMailboxInboxPanel } from "@/components/clients/client-mailbox-inbox-panel";
import { RecentGovernedSendsPanel } from "@/components/clients/recent-governed-sends-panel";
import { Badge } from "@/components/ui/badge";
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
  searchParams?: Promise<{ view?: string }>;
};

export default async function ClientActivityPage({ params, searchParams }: Props) {
  const staff = await requireOpensDoorsStaff();
  const accessible = await getAccessibleClientIds(staff);
  const { clientId } = await params;
  const sp = (await searchParams) ?? {};
  const mode = sp.view === "all" ? "all" : "outreach";

  const bundle = await loadClientWorkspaceBundle(clientId, accessible, staff);
  if (!bundle.client) notFound();

  const [timeline] = await Promise.all([
    loadClientActivityTimeline(bundle.client.id, { mode }),
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
          Recent outreach sends, replies, inbox messages, and recipient signals —
          read only.
        </p>
      </div>

      <Card className="border-border/80 shadow-sm">
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle>
                {mode === "all" ? "Full workspace history" : "Outreach timeline"}
              </CardTitle>
              <CardDescription>
                {mode === "all"
                  ? "All setup, mailbox, audit, and outreach events, newest first."
                  : "Emails, replies, inbox messages, sequence progress, and unsubscribe activity, newest first."}
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={mode === "outreach" ? "default" : "outline"}>
                Outreach view
              </Badge>
              <Link
                href={
                  mode === "all"
                    ? `/clients/${bundle.client.id}/activity`
                    : `/clients/${bundle.client.id}/activity?view=all`
                }
                className="text-xs font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
              >
                {mode === "all" ? "Show outreach only" : "Show full workspace history"}
              </Link>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <ClientActivityTimelinePanel
            timeline={timeline}
            variant={mode === "all" ? "full" : "outreach"}
          />
        </CardContent>
      </Card>

      <Card className="border-border/80 shadow-sm">
        <CardHeader>
          <CardTitle>Recent controlled sends</CardTitle>
          <CardDescription>
            Operator-approved internal checks and first sends for this client,
            with delivery detail.
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
          <CardTitle>Check replies</CardTitle>
          <CardDescription>
            Pull recent inbox messages from connected mailboxes and review any replies.
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
