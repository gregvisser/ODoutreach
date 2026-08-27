import Link from "next/link";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import {
  REPORT_DETAIL_METRICS,
  parseReportDetailMetric,
} from "@/lib/reports/report-detail-metrics";
import { parseReportDateRange } from "@/lib/reports/report-date-range";
import { cn } from "@/lib/utils";
import { prisma } from "@/lib/db";
import { requireStaffUser } from "@/server/auth/staff";
import { loadReportDetail } from "@/server/queries/report-detail";
import { getAccessibleClientIds } from "@/server/tenant/access";

export const dynamic = "force-dynamic";

type Props = {
  searchParams?: Promise<{
    metric?: string;
    client?: string;
    from?: string;
    to?: string;
  }>;
};

function formatWhen(iso: string | null): string {
  if (!iso) return "—";
  return iso.slice(0, 16).replace("T", " ");
}

export default async function ReportDetailPage({ searchParams }: Props) {
  const staff = await requireStaffUser();
  const accessible = await getAccessibleClientIds(staff);
  const sp = (await searchParams) ?? {};

  const metric = parseReportDetailMetric(sp.metric);
  const clientFilter =
    sp.client && accessible.includes(sp.client) ? sp.client : undefined;
  const range = parseReportDateRange(sp.from, sp.to);
  const backParams = new URLSearchParams();
  if (clientFilter) backParams.set("client", clientFilter);
  if (range) {
    backParams.set("from", range.fromIso);
    backParams.set("to", range.toIso);
  }
  const backHref = backParams.toString()
    ? `/reporting?${backParams.toString()}`
    : "/reporting";

  const backLink = (
    <Link prefetch={false}
      href={backHref}
      className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
    >
      ← Back to Reports
    </Link>
  );

  if (!metric) {
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <h1 className="text-2xl font-semibold">Metric detail</h1>
        <p className="text-muted-foreground">
          That metric doesn&apos;t have a row-level breakdown.
        </p>
        {backLink}
      </div>
    );
  }

  const def = REPORT_DETAIL_METRICS[metric];
  const window = range ? { gte: range.gte, lt: range.lt } : undefined;

  const [{ rows, truncated, cap }, clientRow] = await Promise.all([
    loadReportDetail({
      metric,
      clientId: clientFilter ?? null,
      accessibleClientIds: accessible,
      window,
    }),
    clientFilter
      ? prisma.client.findFirst({
          where: { id: clientFilter, deletedAt: null },
          select: { name: true },
        })
      : Promise.resolve(null),
  ]);

  const scopeLabel = clientFilter
    ? (clientRow?.name ?? "Selected client")
    : "All accessible clients";
  const timeLabel = def.windowed ? (range ? range.label : "All-time") : "Live now";
  const showClientColumn = !clientFilter;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{def.label}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {def.rowsDescription}
          </p>
          <p className="mt-1 text-xs uppercase tracking-wide text-muted-foreground">
            Scope: {scopeLabel} · {timeLabel}
          </p>
        </div>
        {backLink}
      </div>

      {!def.windowed && range ? (
        <p className="rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          This is a live &ldquo;right now&rdquo; metric — it has no history, so
          the selected date range doesn&apos;t change it.
        </p>
      ) : null}

      {truncated ? (
        <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
          Showing the most recent {cap.toLocaleString()} rows. Narrow the date
          range or pick a single client to see the rest.
        </p>
      ) : null}

      <Card className="border-border/80 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">
            {rows.length.toLocaleString()} row{rows.length === 1 ? "" : "s"}
          </CardTitle>
          <CardDescription>
            Each row is a record behind the {def.label.toLowerCase()} count.
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {rows.length === 0 ? (
            <p className="rounded-md border border-dashed border-border/80 bg-muted/40 px-4 py-8 text-center text-sm text-muted-foreground">
              No matching records for this scope and period.
            </p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  <th className="px-3 py-2">When</th>
                  <th className="px-3 py-2">Recipient</th>
                  <th className="px-3 py-2">Subject</th>
                  <th className="px-3 py-2">Detail</th>
                  {showClientColumn ? <th className="px-3 py-2">Client</th> : null}
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {rows.map((row) => (
                  <tr key={row.id} className="hover:bg-muted/40">
                    <td className="whitespace-nowrap px-3 py-2 tabular-nums text-muted-foreground">
                      {formatWhen(row.whenIso)}
                    </td>
                    <td className="px-3 py-2 font-medium">
                      {row.href ? (
                        <Link prefetch={false}
                          href={row.href}
                          className="underline-offset-2 hover:underline"
                        >
                          {row.email ?? "—"}
                        </Link>
                      ) : (
                        (row.email ?? "—")
                      )}
                    </td>
                    <td className="max-w-xs truncate px-3 py-2 text-muted-foreground">
                      {row.subject ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {row.detail ?? "—"}
                    </td>
                    {showClientColumn ? (
                      <td className="px-3 py-2 text-muted-foreground">
                        {row.clientName}
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
