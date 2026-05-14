import Link from "next/link";
import { format } from "date-fns";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ClientPerformanceChart,
  VolumeTrendChart,
} from "@/components/dashboard/dashboard-charts";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  formatRate,
  formatTrackedMetric,
} from "@/lib/reports/outreach-metrics";
import { requireStaffUser } from "@/server/auth/staff";
import { listClientsForStaff } from "@/server/queries/clients";
import { getLiveSendReplyStats } from "@/server/queries/live-stats";
import { loadGlobalOutreachMetrics, loadClientOutreachMetrics } from "@/server/queries/outreach-metrics";
import { getReportingSnapshotsForStaff } from "@/server/queries/reporting";
import { getAccessibleClientIds } from "@/server/tenant/access";

export const dynamic = "force-dynamic";

type Props = { searchParams?: Promise<{ client?: string }> };

export default async function ReportingPage({ searchParams }: Props) {
  const staff = await requireStaffUser();
  const accessible = await getAccessibleClientIds(staff);
  const sp = (await searchParams) ?? {};
  const rawFilter = sp.client;
  const clientFilter =
    rawFilter && accessible.includes(rawFilter) ? rawFilter : undefined;
  const clients = await listClientsForStaff(accessible);

  const from = new Date();
  from.setDate(from.getDate() - 30);

  const [snapshots, live, metricsData] = await Promise.all([
    getReportingSnapshotsForStaff(accessible, clientFilter, from),
    getLiveSendReplyStats(accessible, from, clientFilter),
    clientFilter
      ? loadClientOutreachMetrics(clientFilter, accessible).then((m) => ({
          global: m,
          byClient: [],
        }))
      : loadGlobalOutreachMetrics(accessible),
  ]);

  const dayTotals = new Map<string, { sent: number; replies: number }>();
  for (const row of snapshots) {
    const key = format(row.date, "MMM d");
    const cur = dayTotals.get(key) ?? { sent: 0, replies: 0 };
    cur.sent += row.emailsSent;
    cur.replies += row.repliesReceived;
    dayTotals.set(key, cur);
  }
  const trendData = Array.from(dayTotals.entries()).map(([label, v]) => ({
    label,
    sent: v.sent,
    replies: v.replies,
  }));

  const clientTotals = new Map<string, number>();
  for (const row of snapshots) {
    const id = row.client.name;
    clientTotals.set(id, (clientTotals.get(id) ?? 0) + row.emailsSent);
  }
  const clientBars = Array.from(clientTotals.entries())
    .map(([name, sent]) => ({ name, sent }))
    .sort((a, b) => b.sent - a.sent)
    .slice(0, 8);

  const totals = snapshots.reduce(
    (acc, s) => {
      acc.sent += s.emailsSent;
      acc.replies += s.repliesReceived;
      return acc;
    },
    { sent: 0, replies: 0 },
  );
  const rr =
    totals.sent > 0 ? Math.round((totals.replies / totals.sent) * 1000) / 10 : 0;

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Reports</h1>
          <p className="mt-1 text-muted-foreground">
            Operational metrics for accessible workspaces only.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/reporting"
            className={cn(
              buttonVariants({
                variant: !clientFilter ? "secondary" : "outline",
                size: "sm",
              }),
            )}
          >
            All (in scope)
          </Link>
          {clients.map((c) => (
            <Link
              key={c.id}
              href={`/reporting?client=${c.id}`}
              className={cn(
                buttonVariants({
                  variant: clientFilter === c.id ? "secondary" : "outline",
                  size: "sm",
                }),
              )}
            >
              {c.name}
            </Link>
          ))}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Emails sent (window)</CardDescription>
            <CardTitle className="text-3xl tabular-nums">
              {totals.sent.toLocaleString()}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Replies</CardDescription>
            <CardTitle className="text-3xl tabular-nums">
              {totals.replies.toLocaleString()}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Reply rate</CardDescription>
            <CardTitle className="text-3xl tabular-nums">{rr}%</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="border-primary/20 bg-primary/5">
          <CardHeader className="pb-2">
            <CardDescription>Live — SENT (30d)</CardDescription>
            <CardTitle className="text-3xl tabular-nums">
              {live.sent.toLocaleString()}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">Provider accepted send.</p>
          </CardContent>
        </Card>
        <Card className="border-primary/20 bg-primary/5">
          <CardHeader className="pb-2">
            <CardDescription>Live — DELIVERED (30d)</CardDescription>
            <CardTitle className="text-3xl tabular-nums">
              {live.delivered.toLocaleString()}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">Webhook or provider event.</p>
          </CardContent>
        </Card>
        <Card className="border-primary/20 bg-primary/5">
          <CardHeader className="pb-2">
            <CardDescription>Live — pipeline (30d)</CardDescription>
            <CardTitle className="text-3xl tabular-nums">
              {live.pipeline.toLocaleString()}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">Queued / processing / requested.</p>
          </CardContent>
        </Card>
        <Card className="border-primary/20 bg-primary/5">
          <CardHeader className="pb-2">
            <CardDescription>Live — REPLIED (30d)</CardDescription>
            <CardTitle className="text-3xl tabular-nums">
              {live.replied.toLocaleString()}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">Outbound marked when reply links.</p>
          </CardContent>
        </Card>
        <Card className="border-primary/20 bg-primary/5">
          <CardHeader className="pb-2">
            <CardDescription>Live — inbound replies (30d)</CardDescription>
            <CardTitle className="text-3xl tabular-nums">
              {live.replies.toLocaleString()}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">InboundReply rows in scope.</p>
          </CardContent>
        </Card>
        <Card className="border-amber-500/20 bg-amber-500/5">
          <CardHeader className="pb-2">
            <CardDescription>Live — blocked (30d)</CardDescription>
            <CardTitle className="text-3xl tabular-nums">
              {live.blocked.toLocaleString()}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">Suppression guard.</p>
          </CardContent>
        </Card>
        <Card className="border-destructive/20 bg-destructive/5">
          <CardHeader className="pb-2">
            <CardDescription>Live — BOUNCED (30d)</CardDescription>
            <CardTitle className="text-3xl tabular-nums">
              {live.bounced.toLocaleString()}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">Provider bounce events.</p>
          </CardContent>
        </Card>
        <Card className="border-destructive/20 bg-destructive/5">
          <CardHeader className="pb-2">
            <CardDescription>Live — FAILED (30d)</CardDescription>
            <CardTitle className="text-3xl tabular-nums">
              {live.failed.toLocaleString()}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">Terminal send failures.</p>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/80 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">
            {clientFilter ? "Client outreach metrics" : "Global outreach metrics"}
          </CardTitle>
          <CardDescription>
            All-time metrics based on verified send proof only.
            {!clientFilter && " Aggregated across all accessible clients."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {(() => {
            const m = metricsData.global;
            return (
              <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm sm:grid-cols-3 lg:grid-cols-5">
                <MetricItem label="Total sent (with proof)" value={m.sent.toLocaleString()} />
                <MetricItem label="Send proof missing" value={m.sendProofMissing.toLocaleString()} tone={m.sendProofMissing > 0 ? "error" : undefined} />
                <MetricItem label="Delivery" value={formatTrackedMetric(m.delivered, m.deliveryTracked)} sub={m.deliveryTracked ? `Rate: ${formatRate(m.deliveryRate)}` : undefined} />
                <MetricItem label="Opens" value={formatTrackedMetric(m.opens, m.opensTracked)} sub={m.opensTracked ? `Rate: ${formatRate(m.openRate)}` : undefined} />
                <MetricItem label="Replies" value={m.replies.toLocaleString()} sub={`Rate: ${formatRate(m.replyRate)}`} />
                <MetricItem label="Opt-outs" value={m.unsubscribes.toLocaleString()} sub={`Rate: ${formatRate(m.unsubscribeRate)}`} />
                <MetricItem label="Bounces" value={m.bounces.toLocaleString()} sub={`Rate: ${formatRate(m.bounceRate)}`} />
                <MetricItem label="Failed" value={m.failed.toLocaleString()} />
                <MetricItem label="Not reached" value={m.notReached.toLocaleString()} />
                <MetricItem label="Suppressed / skipped" value={m.suppressedOrSkipped.toLocaleString()} />
              </div>
            );
          })()}
          <p className="mt-3 text-xs text-muted-foreground/80">
            &ldquo;Sent from mailbox&rdquo; means ODoutreach handed the email to the
            connected mailbox/provider. It does not guarantee inbox placement.
            If no bounce is recorded, the system has not seen a delivery failure.
          </p>
        </CardContent>
      </Card>

      {!clientFilter && metricsData.byClient.length > 0 && (
        <Card className="border-border/80 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Per-client breakdown</CardTitle>
            <CardDescription>Outreach metrics by client — all time, send-proof verified.</CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  <th className="px-3 py-2">Client</th>
                  <th className="px-3 py-2 text-right">Sent</th>
                  <th className="px-3 py-2 text-right">Replies</th>
                  <th className="px-3 py-2 text-right">Reply rate</th>
                  <th className="px-3 py-2 text-right">Bounces</th>
                  <th className="px-3 py-2 text-right">Opt-outs</th>
                  <th className="px-3 py-2 text-right">Failed</th>
                  <th className="px-3 py-2 text-right">Not reached</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {metricsData.byClient.map((row) => (
                  <tr key={row.clientId} className="hover:bg-muted/40">
                    <td className="px-3 py-2 font-medium">{row.clientName}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{row.metrics.sent.toLocaleString()}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{row.metrics.replies.toLocaleString()}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatRate(row.metrics.replyRate)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{row.metrics.bounces.toLocaleString()}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{row.metrics.unsubscribes.toLocaleString()}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{row.metrics.failed.toLocaleString()}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{row.metrics.notReached.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Trend</CardTitle>
            <CardDescription>Daily sends and replies</CardDescription>
          </CardHeader>
          <CardContent>
            {trendData.length === 0 ? (
              <p className="text-sm text-muted-foreground">No snapshot data.</p>
            ) : (
              <VolumeTrendChart data={trendData} />
            )}
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>By client</CardTitle>
            <CardDescription>Sent volume in window</CardDescription>
          </CardHeader>
          <CardContent>
            {clientBars.length === 0 ? (
              <p className="text-sm text-muted-foreground">No data.</p>
            ) : (
              <ClientPerformanceChart data={clientBars} />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function MetricItem({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "error";
}) {
  return (
    <div>
      <span className="text-muted-foreground">{label}: </span>
      <span className={`font-semibold tabular-nums ${tone === "error" ? "text-destructive" : ""}`}>
        {value}
      </span>
      {sub && (
        <span className="ml-1 text-xs text-muted-foreground">({sub})</span>
      )}
    </div>
  );
}
