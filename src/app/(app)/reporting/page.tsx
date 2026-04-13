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
import { requireStaffUser } from "@/server/auth/staff";
import { listClientsForStaff } from "@/server/queries/clients";
import { getLiveSendReplyStats } from "@/server/queries/live-stats";
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

  const [snapshots, live] = await Promise.all([
    getReportingSnapshotsForStaff(accessible, clientFilter, from),
    getLiveSendReplyStats(accessible, from, clientFilter),
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
          <h1 className="text-3xl font-semibold tracking-tight">Reporting</h1>
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
