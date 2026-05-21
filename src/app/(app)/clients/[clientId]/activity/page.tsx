import { notFound } from "next/navigation";
import Link from "next/link";

import { ClientActivityTimelinePanel } from "@/components/activity/client-activity-timeline-panel";
import { ClientOutreachRepliesPanel } from "@/components/activity/client-outreach-replies-panel";
import { ClearClientRepliesButton } from "@/components/activity/clear-client-replies-button";
import { ResetClientOutreachPanel } from "@/components/activity/reset-client-outreach-panel";
import { AdminQueueDrainPanel } from "@/components/ops/admin-queue-drain-panel";
import { RecentGovernedSendsPanel } from "@/components/clients/recent-governed-sends-panel";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  formatRate,
  formatTrackedMetric,
} from "@/lib/reports/outreach-metrics";
import { utcDateKeyForInstant } from "@/lib/sending-window";
import { requireOpensDoorsStaff } from "@/server/auth/staff";
import { getStaffRole } from "@/server/auth/staff";
import { loadClientActivityTimeline } from "@/server/activity/client-activity";
import { loadClientOutreachReplies } from "@/server/queries/client-outreach-replies";
import { loadClientOutreachMetrics } from "@/server/queries/outreach-metrics";
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

  const [timeline, replyGroups, metrics] = await Promise.all([
    loadClientActivityTimeline(bundle.client.id, { mode }),
    loadClientOutreachReplies(bundle.client.id),
    loadClientOutreachMetrics(bundle.client.id, accessible),
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

      {/*
        Top strip is driven by the same full-count metrics as the "Outreach
        metrics" card below — NOT the activity timeline (which is capped at 40
        rows/source + 100 total and would under-report at volume).
      */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <SummaryCard label="Emails sent" value={metrics.sent} />
        <SummaryCard label="Replies" value={metrics.replies} />
        <SummaryCard
          label="Bounces"
          value={metrics.bounces}
          tone={metrics.bounces > 0 ? "warning" : undefined}
        />
        <SummaryCard
          label="Unsubscribes"
          value={metrics.unsubscribes}
          tone={metrics.unsubscribes > 0 ? "warning" : undefined}
        />
        <SummaryCard
          label="Failed sends"
          value={metrics.failed}
          tone={metrics.failed > 0 ? "error" : undefined}
        />
      </div>

      <Card className="border-border/80 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Outreach metrics</CardTitle>
          <CardDescription>
            All-time metrics for this client, based on verified send proof only.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm sm:grid-cols-3 lg:grid-cols-4">
            <MetricRow label="Total sent (with proof)" value={metrics.sent.toLocaleString()} />
            <MetricRow label="Queued" value={metrics.queued.toLocaleString()} tone={metrics.queued > 0 ? "warning" : undefined} />
            <MetricRow label="Send proof missing" value={metrics.sendProofMissing.toLocaleString()} tone={metrics.sendProofMissing > 0 ? "error" : undefined} />
            <MetricRow label="Delivery" value={formatTrackedMetric(metrics.delivered, metrics.deliveryTracked)} sub={metrics.deliveryTracked ? `Rate: ${formatRate(metrics.deliveryRate)}` : undefined} />
            <MetricRow label="Opens" value={formatTrackedMetric(metrics.opens, metrics.opensTracked)} sub={metrics.opensTracked ? `Rate: ${formatRate(metrics.openRate)}` : undefined} />
            <MetricRow label="Replies" value={metrics.replies.toLocaleString()} sub={`Rate: ${formatRate(metrics.replyRate)}`} />
            <MetricRow label="Opt-outs" value={metrics.unsubscribes.toLocaleString()} sub={`Rate: ${formatRate(metrics.unsubscribeRate)}`} />
            <MetricRow label="Bounces" value={metrics.bounces.toLocaleString()} sub={`Rate: ${formatRate(metrics.bounceRate)}`} />
            <MetricRow label="Failed" value={metrics.failed.toLocaleString()} />
            <MetricRow label="Not reached" value={metrics.notReached.toLocaleString()} />
            <MetricRow label="Suppressed / skipped" value={metrics.suppressedOrSkipped.toLocaleString()} />
          </div>
          <p className="mt-3 text-xs text-muted-foreground/80">
            &ldquo;Sent from mailbox&rdquo; means ODoutreach handed the email to the
            connected mailbox/provider. It does not guarantee inbox placement.
          </p>
          <p className="mt-1 text-xs text-muted-foreground/80">
            &ldquo;Queued&rdquo; means the email is waiting for the sender to
            process it. It has not been sent by the mailbox yet.
          </p>
        </CardContent>
      </Card>

      <ClientOutreachRepliesPanel
        clientId={bundle.client.id}
        groups={serializedGroups}
        totalReplies={totalReplies}
      />

      <details className="rounded-lg border border-border/60 bg-muted/10" open={mode === "all"}>
        <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-muted-foreground hover:text-foreground">
          {mode === "all" ? "Full workspace history" : "Recent sequence events"}
          <span className="ml-2 text-xs text-muted-foreground/70">
            (newest first — collapsed by default)
          </span>
        </summary>
        <div className="space-y-3 px-4 pb-4 pt-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              {mode === "all"
                ? "All setup, mailbox, audit, and outreach events."
                : "Sequence sends, replies, bounces, unsubscribes, and enrolment activity."}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={mode === "outreach" ? "default" : "outline"}>
                {mode === "all" ? "Full history" : "Outreach view"}
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
          <ClientActivityTimelinePanel
            timeline={timeline}
            variant={mode === "all" ? "full" : "outreach"}
          />
        </div>
      </details>

      {isAdmin && (
        <details className="rounded-lg border border-border/60 bg-muted/20">
          <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-muted-foreground hover:text-foreground">
            Admin diagnostics
          </summary>
          <div className="space-y-6 px-4 pb-4 pt-2">
            <Card className="border-border/80 shadow-sm">
              <CardHeader>
                <CardTitle>Outbound queue</CardTitle>
                <CardDescription>
                  Process queued outbound emails. Admin only — sends real email
                  for QUEUED rows.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <AdminQueueDrainPanel />
              </CardContent>
            </Card>
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
            <Card className="border-destructive/40 shadow-sm">
              <CardHeader>
                <CardTitle>Reset pre-production data</CardTitle>
                <CardDescription>
                  Permanently delete test outreach created before a cutoff date
                  (sends, step-sends, enrollments, replies, events, reservations)
                  so metrics reflect only real production outreach. Preview shows
                  exact counts before anything is deleted. Cannot be undone.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ResetClientOutreachPanel
                  clientId={bundle.client.id}
                  clientName={bundle.client.name}
                  defaultCutoff="2026-05-17"
                />
              </CardContent>
            </Card>
            <Card className="border-destructive/40 shadow-sm">
              <CardHeader>
                <CardTitle>Clear replies</CardTitle>
                <CardDescription>
                  Permanently delete all reply records for this client. Use this
                  to remove historical false-positive replies ingested before
                  the In-Reply-To filter was added. This cannot be undone.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ClearClientRepliesButton
                  clientId={bundle.client.id}
                  clientName={bundle.client.name}
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

function MetricRow({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "error" | "warning";
}) {
  return (
    <div>
      <span className="text-muted-foreground">{label}: </span>
      <span className={`font-semibold tabular-nums ${tone === "error" ? "text-destructive" : tone === "warning" ? "text-amber-600" : ""}`}>
        {value}
      </span>
      {sub && (
        <span className="ml-1 text-xs text-muted-foreground">({sub})</span>
      )}
    </div>
  );
}
