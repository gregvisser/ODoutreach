/**
 * Turning the AI usage ledger into something Greg can put on an invoice.
 *
 * Cycle 85 built the ledger and nothing displayed it, which is half a billing
 * system: spend was being recorded and nobody could see what to charge. This
 * module is the other half — the pure fold from ledger rows to a per-client
 * bill. It is separate from the Prisma query on purpose, so the arithmetic that
 * decides how much a customer owes can be tested without a database.
 *
 * The rules encoded here are all invoice-correctness rules, and each one is a
 * way the number could come out wrong:
 *
 *   * Bill the CLIENT, not the slug. The ledger stores the slug as it was at
 *     the moment of the call, so a workspace renamed mid-month would otherwise
 *     bill as two customers.
 *   * Never drop a deleted workspace. `clientId` is `onDelete: SetNull`, so a
 *     hard delete leaves the rows with a null id — the money was still spent.
 *   * Refusals and errors are calls with no cost. They must be visible, because
 *     "no usage" and "four hundred refusals" mean opposite things and today,
 *     with no API key in Azure, production is entirely the second one.
 */
import { isRateVersionVerified } from "./model-catalog";

/** One aggregated slice of the ledger, as `groupBy` hands it over. */
export interface AiSpendGroup {
  /** Null once the workspace has been hard-deleted. */
  readonly clientId: string | null;
  /** The slug recorded at call time. Never rewritten. */
  readonly clientSlugAtCall: string;
  /** Resolved from the live `Client` row; null when there is no longer one. */
  readonly clientName: string | null;
  readonly feature: string;
  readonly status: "OK" | "REFUSED" | "ERROR";
  readonly model: string;
  readonly rateVersion: string;
  readonly calls: number;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly costMicroUsd: number;
}

export interface AiSpendFeatureRow {
  readonly feature: string;
  readonly calls: number;
  readonly costMicroUsd: number;
}

export interface AiSpendClientRow {
  /** Stable key for React and for linking. Slug-based once the client is gone. */
  readonly key: string;
  readonly clientId: string | null;
  readonly clientName: string | null;
  /** Every slug this client's calls were recorded under, sorted. */
  readonly slugs: readonly string[];
  readonly okCalls: number;
  readonly refusedCalls: number;
  readonly errorCalls: number;
  readonly totalCalls: number;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly costMicroUsd: number;
  readonly models: readonly string[];
  readonly features: readonly AiSpendFeatureRow[];
}

export interface AiSpendTotals {
  readonly okCalls: number;
  readonly refusedCalls: number;
  readonly errorCalls: number;
  readonly totalCalls: number;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly costMicroUsd: number;
  readonly clientCount: number;
}

export interface AiSpendSummary {
  readonly clients: readonly AiSpendClientRow[];
  readonly totals: AiSpendTotals;
  /** Every price-list version that contributed to these figures, sorted. */
  readonly rateVersions: readonly string[];
  /**
   * True when any row was priced with a rate list nobody has checked against
   * the published prices. The screen must say so rather than present the total
   * as fact — see `isRateVersionVerified`.
   */
  readonly hasUnverifiedRates: boolean;
}

/** Mutable accumulator; frozen into an `AiSpendClientRow` at the end. */
interface Accumulator {
  clientId: string | null;
  clientName: string | null;
  slugs: Set<string>;
  okCalls: number;
  refusedCalls: number;
  errorCalls: number;
  inputTokens: number;
  outputTokens: number;
  costMicroUsd: number;
  models: Set<string>;
  features: Map<string, { calls: number; costMicroUsd: number }>;
}

function emptyAccumulator(clientId: string | null): Accumulator {
  return {
    clientId,
    clientName: null,
    slugs: new Set(),
    okCalls: 0,
    refusedCalls: 0,
    errorCalls: 0,
    inputTokens: 0,
    outputTokens: 0,
    costMicroUsd: 0,
    models: new Set(),
    features: new Map(),
  };
}

/**
 * Which client an aggregate belongs to.
 *
 * Live clients fold on their id, so a rename mid-month stays one bill. Deleted
 * ones have no id left, so they fold on the denormalised slug — which also
 * keeps two different deleted workspaces from merging into one nameless line.
 */
function billingKey(row: AiSpendGroup): string {
  return row.clientId === null ? `slug:${row.clientSlugAtCall}` : `id:${row.clientId}`;
}

export function summariseAiSpend(rows: readonly AiSpendGroup[]): AiSpendSummary {
  const byClient = new Map<string, Accumulator>();
  const rateVersions = new Set<string>();

  for (const row of rows) {
    rateVersions.add(row.rateVersion);

    const key = billingKey(row);
    const acc = byClient.get(key) ?? emptyAccumulator(row.clientId);
    byClient.set(key, acc);

    acc.slugs.add(row.clientSlugAtCall);
    acc.models.add(row.model);
    if (row.clientName !== null) acc.clientName = row.clientName;

    if (row.status === "OK") acc.okCalls += row.calls;
    else if (row.status === "REFUSED") acc.refusedCalls += row.calls;
    else acc.errorCalls += row.calls;

    acc.inputTokens += row.inputTokens;
    acc.outputTokens += row.outputTokens;
    acc.costMicroUsd += row.costMicroUsd;

    const feature = acc.features.get(row.feature) ?? { calls: 0, costMicroUsd: 0 };
    feature.calls += row.calls;
    feature.costMicroUsd += row.costMicroUsd;
    acc.features.set(row.feature, feature);
  }

  const clients: AiSpendClientRow[] = [...byClient.entries()]
    .map(([key, acc]) => ({
      key,
      clientId: acc.clientId,
      clientName: acc.clientName,
      slugs: [...acc.slugs].sort(),
      okCalls: acc.okCalls,
      refusedCalls: acc.refusedCalls,
      errorCalls: acc.errorCalls,
      totalCalls: acc.okCalls + acc.refusedCalls + acc.errorCalls,
      inputTokens: acc.inputTokens,
      outputTokens: acc.outputTokens,
      costMicroUsd: acc.costMicroUsd,
      models: [...acc.models].sort(),
      features: [...acc.features.entries()]
        .map(([feature, totals]) => ({ feature, ...totals }))
        .sort((a, b) => b.costMicroUsd - a.costMicroUsd || a.feature.localeCompare(b.feature)),
    }))
    // Biggest bill first. Ties fall back to the display label and then the key,
    // so the order never changes between two renders of the same data — a table
    // that reshuffles on refresh is one nobody trusts to read a number off.
    .sort(
      (a, b) =>
        b.costMicroUsd - a.costMicroUsd ||
        (a.clientName ?? a.slugs[0] ?? "").localeCompare(b.clientName ?? b.slugs[0] ?? "") ||
        a.key.localeCompare(b.key),
    );

  const totals = clients.reduce<AiSpendTotals>(
    (sum, row) => ({
      okCalls: sum.okCalls + row.okCalls,
      refusedCalls: sum.refusedCalls + row.refusedCalls,
      errorCalls: sum.errorCalls + row.errorCalls,
      totalCalls: sum.totalCalls + row.totalCalls,
      inputTokens: sum.inputTokens + row.inputTokens,
      outputTokens: sum.outputTokens + row.outputTokens,
      costMicroUsd: sum.costMicroUsd + row.costMicroUsd,
      clientCount: sum.clientCount + 1,
    }),
    {
      okCalls: 0,
      refusedCalls: 0,
      errorCalls: 0,
      totalCalls: 0,
      inputTokens: 0,
      outputTokens: 0,
      costMicroUsd: 0,
      clientCount: 0,
    },
  );

  return {
    clients,
    totals,
    rateVersions: [...rateVersions].sort(),
    hasUnverifiedRates: [...rateVersions].some((version) => !isRateVersionVerified(version)),
  };
}

/**
 * What a feature is called on an invoice.
 *
 * The database value is a screaming-snake enum. Staff and the client see this
 * string, and "REPLY_CLASSIFICATION" on a bill is the kind of leaked internal
 * that this repository has spent whole cycles removing. Unknown values are
 * humanised rather than dropped, so a feature added later shows up as something
 * readable instead of vanishing from the breakdown.
 */
const FEATURE_LABELS: Readonly<Record<string, string>> = {
  REPLY_CLASSIFICATION: "Reply classification",
};

export function aiFeatureLabel(feature: string): string {
  const known = FEATURE_LABELS[feature];
  if (known) return known;
  const words = feature.toLowerCase().replaceAll("_", " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/* -------------------------------------------------------------------------- */
/* Billing period                                                              */
/* -------------------------------------------------------------------------- */

/**
 * How many months back the picker offers. Twelve covers a full billing year,
 * which is as far back as a queried invoice realistically reaches.
 */
const RECENT_MONTH_COUNT = 12;

export interface BillingMonth {
  /** `YYYY-MM`. Also the query-string value. */
  readonly key: string;
  /** "August 2026" — what a human reads at the top of the screen. */
  readonly label: string;
  readonly start: Date;
  /** Exclusive, so the query is a half-open range and midnight belongs to one month only. */
  readonly endExclusive: Date;
  /** Newest first, for the picker. Never contains a future month. */
  readonly recentKeys: readonly string[];
}

const MONTH_KEY = /^(\d{4})-(\d{2})$/;

function monthKey(year: number, monthIndex: number): string {
  return `${year}-${String(monthIndex + 1).padStart(2, "0")}`;
}

function monthLabel(year: number, monthIndex: number): string {
  // Fixed locale rather than the server's: an invoice heading that reads
  // differently depending on which machine rendered it is a support ticket.
  return new Date(Date.UTC(year, monthIndex, 1)).toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/**
 * Resolve the month being invoiced.
 *
 * Boundaries are UTC. Every timestamp on the ledger is UTC, and a billing month
 * that shifted with British Summer Time would move an hour of calls between two
 * invoices twice a year — the heading says UTC so the choice is visible.
 *
 * `raw` arrives from a query string, so it is untrusted text. Anything that is
 * not a real `YYYY-MM` falls back to the month in progress: a hand-typed URL
 * should show the current bill, not a 500.
 */
export function resolveBillingMonth(raw: string | undefined, now: Date): BillingMonth {
  const currentYear = now.getUTCFullYear();
  const currentMonth = now.getUTCMonth();

  let year = currentYear;
  let monthIndex = currentMonth;

  const match = raw?.match(MONTH_KEY);
  if (match) {
    const parsedYear = Number(match[1]);
    const parsedMonth = Number(match[2]);
    if (parsedMonth >= 1 && parsedMonth <= 12) {
      year = parsedYear;
      monthIndex = parsedMonth - 1;
    }
  }

  const recentKeys: string[] = [];
  for (let back = 0; back < RECENT_MONTH_COUNT; back += 1) {
    const date = new Date(Date.UTC(currentYear, currentMonth - back, 1));
    recentKeys.push(monthKey(date.getUTCFullYear(), date.getUTCMonth()));
  }

  return {
    key: monthKey(year, monthIndex),
    label: monthLabel(year, monthIndex),
    start: new Date(Date.UTC(year, monthIndex, 1)),
    // Month 12 rolls into January of the next year — `Date.UTC` normalises it.
    endExclusive: new Date(Date.UTC(year, monthIndex + 1, 1)),
    recentKeys,
  };
}
