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
import { requireStaffUser } from "@/server/auth/staff";
import { getDashboardSummaryForStaff } from "@/server/queries/dashboard";
import { getAccessibleClientIds } from "@/server/tenant/access";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const staff = await requireStaffUser();
  const accessible = await getAccessibleClientIds(staff);
  const summary = await getDashboardSummaryForStaff(accessible);

  const dayTotals = new Map<string, { sent: number; replies: number }>();
  for (const row of summary.snapshots) {
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
  for (const row of summary.snapshots) {
    const id = row.client.name;
    clientTotals.set(id, (clientTotals.get(id) ?? 0) + row.emailsSent);
  }
  const clientBars = Array.from(clientTotals.entries())
    .map(([name, sent]) => ({ name, sent }))
    .sort((a, b) => b.sent - a.sent)
    .slice(0, 6);

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Dashboard</h1>
        <p className="mt-1 text-muted-foreground">
          Metrics and activity limited to workspaces you can access. Operations only — not
          a sales pipeline.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Emails sent (14d)"
          value={summary.sentTotal.toLocaleString()}
          hint="Outbound sends tracked"
        />
        <StatCard
          label="Replies (14d)"
          value={summary.replyTotal.toLocaleString()}
          hint="Inbound replies logged"
        />
        <StatCard
          label="Reply rate (approx)"
          value={`${summary.replyRate}%`}
          hint="Replies ÷ sends (window)"
        />
        <StatCard
          label="Active clients (in scope)"
          value={summary.clientCount.toLocaleString()}
          hint={`${summary.campaignsActive} active campaigns`}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <Card className="border-border/80 shadow-sm lg:col-span-3">
          <CardHeader>
            <CardTitle>Send & reply trend</CardTitle>
            <CardDescription>
              Daily totals for accessible workspaces only.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {trendData.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No reporting snapshots yet — run seed or nightly rollups.
              </p>
            ) : (
              <VolumeTrendChart data={trendData} />
            )}
          </CardContent>
        </Card>
        <Card className="border-border/80 shadow-sm lg:col-span-2">
          <CardHeader>
            <CardTitle>By client</CardTitle>
            <CardDescription>Sent volume (14d)</CardDescription>
          </CardHeader>
          <CardContent>
            {clientBars.length === 0 ? (
              <p className="text-sm text-muted-foreground">No data yet.</p>
            ) : (
              <ClientPerformanceChart data={clientBars} />
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="border-border/80 shadow-sm">
          <CardHeader>
            <CardTitle>Recent sends</CardTitle>
            <CardDescription>Latest outbound activity (scoped)</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {summary.recentOutbound.length === 0 ? (
              <EmptyRow />
            ) : (
              summary.recentOutbound.map((row) => (
                <div
                  key={row.id}
                  className="flex items-start justify-between gap-4 rounded-lg border border-border/60 bg-card/50 px-3 py-2"
                >
                  <div className="min-w-0">
                    <Link
                      href={`/activity/outbound/${row.id}`}
                      className="truncate text-sm font-medium underline-offset-2 hover:underline"
                    >
                      {row.toEmail}
                    </Link>
                    <p className="text-xs text-muted-foreground">
                      {row.client.name}
                      {row.subject ? ` · ${row.subject}` : ""}
                    </p>
                    <p className="mt-0.5 text-[10px] uppercase text-muted-foreground">
                      {row.status.replace(/_/g, " ")}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {row.sentAt
                      ? format(row.sentAt, "MMM d HH:mm")
                      : format(row.createdAt, "MMM d HH:mm")}
                  </span>
                </div>
              ))
            )}
          </CardContent>
        </Card>
        <Card className="border-border/80 shadow-sm">
          <CardHeader>
            <CardTitle>Recent replies</CardTitle>
            <CardDescription>Inbound reply log</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {summary.recentReplies.length === 0 ? (
              <EmptyRow />
            ) : (
              summary.recentReplies.map((row) => (
                <div
                  key={row.id}
                  className="rounded-lg border border-border/60 bg-card/50 px-3 py-2"
                >
                  <div className="flex justify-between gap-2">
                    <p className="truncate text-sm font-medium">{row.fromEmail}</p>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {format(row.receivedAt, "MMM d")}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">{row.client.name}</p>
                  {row.snippet ? (
                    <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                      {row.snippet}
                    </p>
                  ) : null}
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <Card className="border-border/80 shadow-sm">
      <CardHeader className="pb-2">
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-3xl font-semibold tabular-nums">{value}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  );
}

function EmptyRow() {
  return (
    <p className="text-sm text-muted-foreground">
      No rows yet — seed the database or connect sending/reply webhooks.
    </p>
  );
}
