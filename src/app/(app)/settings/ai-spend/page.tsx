import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatMicroUsd } from "@/lib/ai/model-catalog";
import { aiFeatureLabel } from "@/lib/ai/spend-summary";
import { areAiFeaturesEnabled } from "@/lib/ai/ai-switch";
import { cn } from "@/lib/utils";
import { requireOpensDoorsStaff } from "@/server/auth/staff";
import { getAiSpendReport } from "@/server/queries/ai-spend";

export const dynamic = "force-dynamic";

type Props = { searchParams?: Promise<{ month?: string }> };

/** Thousands separators, fixed locale so the server never renders two ways. */
const NUMBER = new Intl.NumberFormat("en-GB");

/**
 * AI spend — what to invoice, per client, per month.
 *
 * Cycle 85 built the usage ledger and shipped no way to read it, which meant
 * spend was being recorded and nobody could see what to charge. This is that
 * screen, and it is the other half of the queue's billing requirement.
 *
 * Owner only. It is cross-client by design — it exists so one person can raise
 * one invoice — so it deliberately does NOT go through `getAccessibleClientIds`
 * the way tenant-scoped screens do, and the super-admin check below is the only
 * thing standing between staff and every client's numbers. That is why the
 * check is first, before any query runs.
 *
 * The route is not listed in `mainNav`; it is reached from Settings, like the
 * other owner-only administration surfaces.
 */
export default async function AiSpendPage({ searchParams }: Props) {
  const staff = await requireOpensDoorsStaff();

  if (!staff.isSuperAdmin) {
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <h1 className="text-2xl font-semibold">AI spend</h1>
        <p className="text-muted-foreground">
          Only the owner account can see AI spend across clients.
        </p>
        <Link
          prefetch={false}
          href="/settings"
          className={cn(buttonVariants({ variant: "outline" }), "inline-flex")}
        >
          Back to settings
        </Link>
      </div>
    );
  }

  const params = await searchParams;
  const { month, summary } = await getAiSpendReport(params?.month);
  const { totals } = summary;

  const featuresSwitchedOn = areAiFeaturesEnabled();

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">AI spend</h1>
          <p className="mt-1 text-muted-foreground">
            What each client&apos;s AI usage cost in <strong>{month.label}</strong>,
            for invoicing. Every AI call is recorded as it happens — including
            the ones that were refused or failed, which cost nothing. Months run
            from midnight to midnight <abbr title="Coordinated Universal Time">UTC</abbr>.
          </p>
        </div>
        <Link
          prefetch={false}
          href="/settings"
          className={cn(buttonVariants({ variant: "ghost" }), "shrink-0 text-sm")}
        >
          ← Back to settings
        </Link>
      </div>

      {/*
        The unverified-rates warning. This is the single most important thing on
        the page: the per-token prices were never checked against the published
        price list, so the money column is an ESTIMATE. The token columns are
        not — they come straight from the API — which is why the banner points
        at them as the thing to trust.
      */}
      {summary.hasUnverifiedRates ? (
        <div
          data-testid="ai-spend-rate-warning"
          className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900"
        >
          <strong>Do not invoice these amounts yet.</strong> The per-token prices
          behind the cost column have not been checked against the published
          price list, so the money is an estimate. The token counts ARE exact —
          they come from the API on every call — and the rates used are stored
          on each row, so every figure here can be recalculated once the prices
          are confirmed. Rate list in use:{" "}
          <code>{summary.rateVersions.join(", ") || "none yet"}</code>.
        </div>
      ) : null}

      {!featuresSwitchedOn ? (
        <div className="rounded-md border border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-800">
          <strong>AI features are switched off.</strong> <code>AI_FEATURES</code>{" "}
          is set to off, so calls are being refused rather than made. Refusals
          still appear below, costing nothing, so an intentional pause never
          looks the same as a silent failure.
        </div>
      ) : null}

      {totals.totalCalls > 0 && totals.okCalls === 0 ? (
        <div
          data-testid="ai-spend-all-refused"
          className="rounded-md border border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-800"
        >
          <strong>Nothing was charged this month.</strong> All{" "}
          {NUMBER.format(totals.totalCalls)} calls were refused or failed, so
          there is nothing to invoice. If that is not deliberate, the usual cause
          is a missing <code>ANTHROPIC_API_KEY</code> in the Azure app settings.
        </div>
      ) : null}

      <section className="grid gap-3 sm:grid-cols-4">
        <Stat label="To invoice" value={formatMicroUsd(totals.costMicroUsd)} emphasis />
        <Stat label="Charged calls" value={NUMBER.format(totals.okCalls)} />
        <Stat label="Refused" value={NUMBER.format(totals.refusedCalls)} />
        <Stat label="Failed" value={NUMBER.format(totals.errorCalls)} />
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-muted-foreground">Month</span>
          {month.recentKeys.map((key) => (
            <Link
              key={key}
              prefetch={false}
              href={`/settings/ai-spend?month=${key}`}
              className={cn(
                buttonVariants({
                  variant: key === month.key ? "default" : "outline",
                  size: "sm",
                }),
              )}
            >
              {key}
            </Link>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium">
          By client ({NUMBER.format(totals.clientCount)})
        </h2>

        {summary.clients.length === 0 ? (
          <p
            data-testid="ai-spend-empty"
            className="rounded-md border border-dashed px-4 py-6 text-sm text-muted-foreground"
          >
            No AI calls were recorded in {month.label}. Nothing to invoice.
          </p>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Client</TableHead>
                  <TableHead className="text-right">Charged</TableHead>
                  <TableHead className="text-right">Refused</TableHead>
                  <TableHead className="text-right">Failed</TableHead>
                  <TableHead className="text-right">Tokens in</TableHead>
                  <TableHead className="text-right">Tokens out</TableHead>
                  <TableHead className="text-right">Cost</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {summary.clients.map((row) => (
                  <TableRow key={row.key} data-testid="ai-spend-client-row">
                    <TableCell className="align-top">
                      <div className="font-medium">
                        {row.clientName ?? row.slugs[0]}
                        {row.clientId === null ? (
                          <span className="ml-2 rounded-full bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-700">
                            Workspace deleted
                          </span>
                        ) : null}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {row.features
                          .map(
                            (feature) =>
                              `${aiFeatureLabel(feature.feature)} · ${NUMBER.format(feature.calls)}`,
                          )
                          .join(" — ")}
                      </div>
                    </TableCell>
                    <TableCell className="text-right align-top tabular-nums">
                      {NUMBER.format(row.okCalls)}
                    </TableCell>
                    <TableCell className="text-right align-top tabular-nums">
                      {NUMBER.format(row.refusedCalls)}
                    </TableCell>
                    <TableCell className="text-right align-top tabular-nums">
                      {NUMBER.format(row.errorCalls)}
                    </TableCell>
                    <TableCell className="text-right align-top tabular-nums">
                      {NUMBER.format(row.inputTokens)}
                    </TableCell>
                    <TableCell className="text-right align-top tabular-nums">
                      {NUMBER.format(row.outputTokens)}
                    </TableCell>
                    <TableCell
                      data-testid="ai-spend-client-cost"
                      className="text-right align-top font-medium tabular-nums"
                    >
                      {formatMicroUsd(row.costMicroUsd)}
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow className="bg-muted/40">
                  <TableCell className="font-semibold">Total</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {NUMBER.format(totals.okCalls)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {NUMBER.format(totals.refusedCalls)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {NUMBER.format(totals.errorCalls)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {NUMBER.format(totals.inputTokens)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {NUMBER.format(totals.outputTokens)}
                  </TableCell>
                  <TableCell
                    data-testid="ai-spend-total-cost"
                    className="text-right font-semibold tabular-nums"
                  >
                    {formatMicroUsd(totals.costMicroUsd)}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        )}
      </section>
    </div>
  );
}

function Stat({
  label,
  value,
  emphasis = false,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
}) {
  return (
    <div className="rounded-md border px-4 py-3">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div
        className={cn(
          "mt-1 tabular-nums",
          emphasis ? "text-2xl font-semibold" : "text-xl font-medium",
        )}
      >
        {value}
      </div>
    </div>
  );
}
