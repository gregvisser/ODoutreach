import Link from "next/link";

import { ReportsDateRangePicker } from "@/components/reports/reports-date-range-picker";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  formatBounceRate,
  formatRate,
  formatTrackedMetric,
} from "@/lib/reports/outreach-metrics";
import { parseReportDateRange } from "@/lib/reports/report-date-range";
import { requireStaffUser } from "@/server/auth/staff";
import { listClientsForStaff } from "@/server/queries/clients";
import {
  loadClientOutreachMetrics,
  loadGlobalOutreachMetrics,
} from "@/server/queries/outreach-metrics";
import { getAccessibleClientIds } from "@/server/tenant/access";

export const dynamic = "force-dynamic";

type Props = {
  searchParams?: Promise<{ client?: string; from?: string; to?: string }>;
};

/**
 * PR #136 — Reports is the single trustworthy operational dashboard.
 *
 * The previous implementation mixed three independent data sources on one
 * screen:
 *   1. ReportingDailySnapshot rollups (never written, always zero).
 *   2. A 30-day live counter that filtered `status = "SENT"` only and so
 *      undercounted rows that had progressed to DELIVERED / REPLIED.
 *   3. The all-time outreach metrics card (the only correct surface).
 *
 * That created the "0 sent" vs "live SENT > 0" contradictions staff saw.
 * This page now reads exclusively from `loadGlobalOutreachMetrics` /
 * `loadClientOutreachMetrics` — live counts from OutboundEmail,
 * ClientEmailSequenceStepSend, InboundReply, UnsubscribeToken,
 * OutboundProviderEvent — and labels every metric with its time window
 * and "Not tracked" state where applicable.
 *
 * See `docs/ops/SYSTEM_HANDOVER_READINESS_AUDIT.md` section A.8 and
 * `docs/ops/SYSTEM_HANDOVER_GAPS.md` G1, G2.
 */
export default async function ReportingPage({ searchParams }: Props) {
  const staff = await requireStaffUser();
  const accessible = await getAccessibleClientIds(staff);
  const sp = (await searchParams) ?? {};
  const rawFilter = sp.client;
  const clientFilter =
    rawFilter && accessible.includes(rawFilter) ? rawFilter : undefined;
  // Optional ?from=YYYY-MM-DD&to=YYYY-MM-DD window (inclusive days).
  // Invalid/missing → null → All-time, exactly as before.
  const range = parseReportDateRange(sp.from, sp.to);
  const window = range ? { gte: range.gte, lt: range.lt } : undefined;

  const [clients, metricsData] = await Promise.all([
    listClientsForStaff(accessible),
    clientFilter
      ? loadClientOutreachMetrics(clientFilter, accessible, window).then(
          (m) => ({
            global: m,
            byClient: [],
          }),
        )
      : loadGlobalOutreachMetrics(accessible, window),
  ]);

  const m = metricsData.global;
  const scopeLabel = clientFilter
    ? clients.find((c) => c.id === clientFilter)?.name ?? "Selected client"
    : "All accessible clients";
  const timeLabel = range ? range.label : "All-time";
  // Keep the active range on client-chip and table links so switching
  // client doesn't silently reset the dates.
  const rangeQuery = range ? `&from=${range.fromIso}&to=${range.toIso}` : "";

  // F5 — drill-down link for a metric, preserving the active scope + date range.
  const detailHref = (metric: string, forClientId?: string) => {
    const p = new URLSearchParams();
    p.set("metric", metric);
    const cid = forClientId ?? clientFilter;
    if (cid) p.set("client", cid);
    if (range) {
      p.set("from", range.fromIso);
      p.set("to", range.toIso);
    }
    return `/reporting/detail?${p.toString()}`;
  };

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Reports</h1>
          <p className="mt-1 text-muted-foreground">
            Operational outreach metrics for accessible workspaces. Live
            counts from the database — no rollup tables.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link prefetch={false}
            href={range ? `/reporting?from=${range.fromIso}&to=${range.toIso}` : "/reporting"}
            className={cn(
              buttonVariants({
                variant: !clientFilter ? "secondary" : "outline",
                size: "sm",
              }),
            )}
          >
            All accessible clients
          </Link>
          {clients.map((c) => (
            <Link prefetch={false}
              key={c.id}
              href={`/reporting?client=${c.id}${rangeQuery}`}
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

      <ReportsDateRangePicker
        clientId={clientFilter ?? null}
        fromIso={range?.fromIso ?? null}
        toIso={range?.toIso ?? null}
      />

      <Card className="border-border/80 shadow-sm">
        <CardHeader className="pb-2">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <CardTitle className="text-base">Outreach metrics</CardTitle>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Scope: {scopeLabel} · {timeLabel}
            </p>
          </div>
          <CardDescription>
            Every count below is a live database read. Sends are only counted
            when the provider returned a message id or recorded a send time.
            {range ? (
              <>
                {" "}
                Sent, replies, opt-outs, opens, bounces and failures are
                filtered to the selected dates. Queued, Suppressed / skipped
                and Contacts are live right-now values — they have no
                history, so the date range doesn&apos;t change them.
              </>
            ) : null}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <HeadlineMetric
              // Renamed with its sibling below. The old hint quoted two of our
              // own database column names at the client.
              label="Sent, confirmed"
              value={m.sent.toLocaleString()}
              hint="The mailbox confirmed it took the email"
              href={detailHref("sent")}
            />
            <HeadlineMetric
              label="Queued / preparing"
              value={m.queued.toLocaleString()}
              hint="Waiting on the sender — not yet handed off"
              tone={m.queued > 0 ? "warning" : undefined}
              href={detailHref("queued")}
            />
            <HeadlineMetric
              label="Replies"
              value={m.replies.toLocaleString()}
              hint={`Reply rate: ${formatRate(m.replyRate)}`}
              tone={m.replies > 0 ? "positive" : undefined}
              href={detailHref("replies")}
            />
            <HeadlineMetric
              label="Delivered"
              // A headline number may not BE the words "Not tracked" — at 30px
              // that reads as a broken page, not as "nobody reports this".
              // A dash reads as "no figure"; the hint says why.
              value={m.deliveryTracked ? m.delivered.toLocaleString() : "—"}
              hint={
                m.deliveryTracked
                  ? `Delivery rate: ${formatRate(m.deliveryRate)}`
                  : "Outlook and Gmail do not report this back"
              }
              tone={
                m.deliveryTracked && m.delivered > 0 ? "positive" : undefined
              }
              href={m.deliveryTracked ? detailHref("delivered") : undefined}
            />
          </div>

          <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm sm:grid-cols-3 lg:grid-cols-4">
            <MetricItem
              // Was "Send proof missing", in red. "Proof" is our word for a
              // provider message id, and red says "these failed" when what we
              // actually know is that we cannot tell either way.
              label="Sent, not confirmed"
              value={m.sendProofMissing.toLocaleString()}
              sub="The mailbox never sent back a receipt"
              tone={m.sendProofMissing > 0 ? "warning" : undefined}
            />
            <MetricItem
              label="Bounces"
              value={m.bounces.toLocaleString()}
              sub={
                m.sent === 0
                  ? formatBounceRate(m.bounceRate, m.sent)
                  : `Rate: ${formatBounceRate(m.bounceRate, m.sent)}`
              }
              tone={m.bounces > 0 ? "error" : undefined}
              href={detailHref("bounces")}
            />
            <MetricItem
              label="Opt-outs"
              value={m.unsubscribes.toLocaleString()}
              sub={`Rate: ${formatRate(m.unsubscribeRate)}`}
              href={detailHref("unsubscribes")}
            />
            <MetricItem
              label="Failed"
              value={m.failed.toLocaleString()}
              tone={m.failed > 0 ? "error" : undefined}
              href={detailHref("failed")}
            />
            <MetricItem
              label="Suppressed / skipped"
              value={m.suppressedOrSkipped.toLocaleString()}
              href={detailHref("suppressed")}
            />
            <MetricItem
              label="Not reached"
              value={m.notReached.toLocaleString()}
              // Was the formula itself. A client wants to know what the number
              // means, not how it was added up.
              sub="Blocked, bounced, failed or unconfirmed"
              tone={m.notReached > 0 ? "warning" : undefined}
            />
            <MetricItem
              label="Opens"
              value={formatTrackedMetric(m.opens, m.opensTracked)}
              sub={m.opensTracked ? `Rate: ${formatRate(m.openRate)}` : undefined}
              tone={!m.opensTracked ? "muted" : undefined}
              href={m.opensTracked ? detailHref("opens") : undefined}
            />
            <MetricItem
              label="Contacts (sendable)"
              value={`${m.emailSendable.toLocaleString()} / ${m.totalContacts.toLocaleString()}`}
              sub="Have an email and not suppressed"
            />
          </div>
        </CardContent>
      </Card>

      {!clientFilter && metricsData.byClient.length > 0 && (
        <Card className="border-border/80 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Per-client breakdown</CardTitle>
            <CardDescription>
              Open a row by selecting that workspace in the filter chips above.
              {" "}{timeLabel}, send-proof verified.
            </CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  <th className="px-3 py-2">Client</th>
                  <th className="px-3 py-2 text-right">Sent</th>
                  <th className="px-3 py-2 text-right">Queued</th>
                  <th className="px-3 py-2 text-right">Replies</th>
                  <th className="px-3 py-2 text-right">Reply rate</th>
                  <th className="px-3 py-2 text-right">Opt-outs</th>
                  <th className="px-3 py-2 text-right">Bounces</th>
                  <th className="px-3 py-2 text-right">Failed</th>
                  <th className="px-3 py-2 text-right">Not reached</th>
                  <th className="px-3 py-2 text-right">Not confirmed</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {metricsData.byClient.map((row) => (
                  <tr key={row.clientId} className="hover:bg-muted/40">
                    <td className="px-3 py-2 font-medium">
                      <Link prefetch={false}
                        className="underline-offset-2 hover:underline"
                        href={`/reporting?client=${row.clientId}${rangeQuery}`}
                      >
                        {row.clientName}
                      </Link>
                    </td>
                    <DrillCell
                      href={detailHref("sent", row.clientId)}
                      value={row.metrics.sent.toLocaleString()}
                    />
                    <DrillCell
                      href={detailHref("queued", row.clientId)}
                      value={row.metrics.queued.toLocaleString()}
                    />
                    <DrillCell
                      href={detailHref("replies", row.clientId)}
                      value={row.metrics.replies.toLocaleString()}
                    />
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatRate(row.metrics.replyRate)}
                    </td>
                    <DrillCell
                      href={detailHref("unsubscribes", row.clientId)}
                      value={row.metrics.unsubscribes.toLocaleString()}
                    />
                    <DrillCell
                      href={detailHref("bounces", row.clientId)}
                      value={row.metrics.bounces.toLocaleString()}
                    />
                    <DrillCell
                      href={detailHref("failed", row.clientId)}
                      value={row.metrics.failed.toLocaleString()}
                    />
                    <td className="px-3 py-2 text-right tabular-nums">
                      {row.metrics.notReached.toLocaleString()}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {row.metrics.sendProofMissing.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function HeadlineMetric({
  label,
  value,
  hint,
  tone,
  href,
}: {
  label: string;
  value: string;
  hint: string;
  tone?: "error" | "warning" | "positive" | "muted";
  href?: string;
}) {
  const valueTone =
    tone === "error"
      ? "text-destructive"
      : tone === "warning"
        ? "text-amber-600"
        : tone === "positive"
          ? "text-emerald-600"
          : tone === "muted"
            ? "text-muted-foreground"
            : "";
  return (
    <Card className="border-border/80 shadow-sm">
      <CardHeader className="pb-2">
        <CardDescription>
          {href ? (
            <Link prefetch={false}
              href={href}
              className="underline-offset-2 hover:text-foreground hover:underline"
            >
              {label}
            </Link>
          ) : (
            label
          )}
        </CardDescription>
        <CardTitle className={`text-3xl tabular-nums ${valueTone}`}>
          {href ? (
            <Link prefetch={false} href={href} className="hover:underline">
              {value}
            </Link>
          ) : (
            value
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  );
}

function MetricItem({
  label,
  value,
  sub,
  tone,
  href,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "error" | "warning" | "muted";
  href?: string;
}) {
  const valueTone =
    tone === "error"
      ? "text-destructive"
      : tone === "warning"
        ? "text-amber-600"
        : tone === "muted"
          ? "text-muted-foreground"
          : "";
  return (
    <div>
      {href ? (
        <Link prefetch={false}
          href={href}
          className="text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
        >
          {label}:{" "}
        </Link>
      ) : (
        <span className="text-muted-foreground">{label}: </span>
      )}
      <span className={`font-semibold tabular-nums ${valueTone}`}>{value}</span>
      {sub ? (
        <span className="ml-1 text-xs text-muted-foreground">({sub})</span>
      ) : null}
    </div>
  );
}

/** F5 — a right-aligned per-client table cell whose number drills into detail. */
function DrillCell({ href, value }: { href: string; value: string }) {
  return (
    <td className="px-3 py-2 text-right tabular-nums">
      <Link prefetch={false} href={href} className="underline-offset-2 hover:underline">
        {value}
      </Link>
    </td>
  );
}
