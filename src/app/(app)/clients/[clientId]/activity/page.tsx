import { notFound } from "next/navigation";
import Link from "next/link";

import { ClientActivityTimelinePanel } from "@/components/activity/client-activity-timeline-panel";
import { ClientOutreachRepliesPanel } from "@/components/activity/client-outreach-replies-panel";
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
import { getStaffRole } from "@/server/auth/staff";
import { loadClientActivityTimeline } from "@/server/activity/client-activity";
import { loadClientOutreachReplies } from "@/server/queries/client-outreach-replies";
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

  const staffRole = await getStaffRole();
  const isAdmin = staffRole === "ADMIN";

  const [timeline, replyGroups] = await Promise.all([
    loadClientActivityTimeline(bundle.client.id, { mode }),
    loadClientOutreachReplies(bundle.client.id),
  ]);

  const totalReplies = replyGroups.reduce((sum, g) => sum + g.replyCount, 0);
  const currentUtcWindowKey = utcDateKeyForInstant(new Date());

  const serializedGroups = replyGroups.map((g) => ({
    ...g,
    replies: g.replies.map((r) => ({
      ...r,
      receivedAt: r.receivedAt.toISOString(),
    })),
  }));

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
          Outreach sends, sequence replies, and recipient signals for this client
          — read only.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <SummaryCard
          label="Introductions sent"
          value={timeline.summary.byType.send ?? 0}
        />
        <SummaryCard label="Replies" value={totalReplies} />
        <SummaryCard
          label="Bounces"
          value={timeline.summary.byType.bounce ?? 0}
          tone={
            (timeline.summary.byType.bounce ?? 0) > 0 ? "warning" : undefined
          }
        />
        <SummaryCard
          label="Unsubscribes"
          value={timeline.summary.byType.unsubscribe ?? 0}
          tone={
            (timeline.summary.byType.unsubscribe ?? 0) > 0
              ? "warning"
              : undefined
          }
        />
        <SummaryCard
          label="Failed sends"
          value={timeline.summary.byType.error ?? 0}
          tone={
            (timeline.summary.byType.error ?? 0) > 0 ? "error" : undefined
          }
        />
      </div>

      <Card className="border-border/80 shadow-sm">
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle>
                {mode === "all" ? "Full workspace history" : "Sequence timeline"}
              </CardTitle>
              <CardDescription>
                {mode === "all"
                  ? "All setup, mailbox, audit, and outreach events, newest first."
                  : "Sequence sends, replies, bounces, unsubscribes, and enrolment activity — newest first."}
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

      <ClientOutreachRepliesPanel
        groups={serializedGroups}
        totalReplies={totalReplies}
      />

      {isAdmin && (
        <details className="rounded-lg border border-border/60 bg-muted/20">
          <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-muted-foreground hover:text-foreground">
            Admin diagnostics
          </summary>
          <div className="space-y-6 px-4 pb-4 pt-2">
            <Card className="border-border/80 shadow-sm">
              <CardHeader>
                <CardTitle>Recent controlled sends</CardTitle>
                <CardDescription>
                  Internal test and pilot sends for this client, with delivery
                  detail. Visible to admins only.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <RecentGovernedSendsPanel
                  rows={bundle.recentGovernedSends}
                  currentUtcWindowKey={currentUtcWindowKey}
                />
              </CardContent>
            </Card>
          </div>
        </details>
      )}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "warning" | "error";
}) {
  return (
    <div
      className={`rounded-md border border-border/80 bg-card px-3 py-2 shadow-sm ${
        tone === "warning"
          ? "border-amber-400/60"
          : tone === "error"
            ? "border-destructive/50"
            : ""
      }`}
    >
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p
        className={`mt-1 text-xl font-semibold tabular-nums ${
          tone === "warning"
            ? "text-amber-600"
            : tone === "error"
              ? "text-destructive"
              : ""
        }`}
      >
        {value}
      </p>
    </div>
  );
}
