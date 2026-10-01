import "server-only";

import {
  resolveBillingMonth,
  summariseAiSpend,
  type AiSpendGroup,
  type AiSpendSummary,
  type BillingMonth,
} from "@/lib/ai/spend-summary";
import { prisma } from "@/lib/db";

/**
 * Reads the AI usage ledger for one billing month.
 *
 * Deliberately thin. All the arithmetic that decides what a client owes lives
 * in `@/lib/ai/spend-summary`, which is pure and has real tests; this file only
 * fetches and joins. The split is the reason the invoice rules are testable
 * without a database.
 *
 * Organisation-scoped. An OpensDoors owner sees every OpensDoors client on one
 * invoice. A platform admin passes no organisation id and sees every
 * organisation. `null` reads nothing. The page still requires super-admin.
 */

export interface AiSpendReport {
  readonly month: BillingMonth;
  readonly summary: AiSpendSummary;
}

export async function getAiSpendReport(
  monthKey: string | undefined,
  now: Date = new Date(),
  /**
   * `undefined` is the platform-admin view (every organisation).
   * A string is one organisation. `null` is no organisation: return an empty
   * month and do not read another organisation's ledger.
   */
  organisationId?: string | null,
): Promise<AiSpendReport> {
  const month = resolveBillingMonth(monthKey, now);
  if (organisationId === null) {
    return { month, summary: summariseAiSpend([]) };
  }

  /**
   * One grouped read rather than one row per call. A month of classification
   * across the estate is tens of thousands of rows and a handful of groups —
   * pulling them all back to sum them in JavaScript would be the same number,
   * slower, and would eventually time the page out.
   */
  const grouped = await prisma.aiUsageEvent.groupBy({
    by: ["clientId", "clientSlugAtCall", "feature", "status", "model", "rateVersion"],
    where: {
      createdAt: { gte: month.start, lt: month.endExclusive },
      ...(organisationId ? { organisationId } : {}),
    },
    _count: { _all: true },
    _sum: { inputTokens: true, outputTokens: true, costMicroUsd: true },
  });

  /**
   * Current names for the clients that still exist. The ledger stores only the
   * slug it saw at call time, so the display name has to be joined — and a
   * renamed workspace should invoice under the name it has TODAY, not the one
   * it had when the call was made.
   */
  const clientIds = [
    ...new Set(grouped.map((row) => row.clientId).filter((id): id is string => id !== null)),
  ];
  const clients = clientIds.length
    ? await prisma.client.findMany({
        where: { id: { in: clientIds } },
        select: { id: true, name: true },
      })
    : [];
  const nameById = new Map(clients.map((client) => [client.id, client.name]));

  const rows: AiSpendGroup[] = grouped.map((row) => ({
    clientId: row.clientId,
    clientSlugAtCall: row.clientSlugAtCall,
    clientName: row.clientId === null ? null : (nameById.get(row.clientId) ?? null),
    feature: row.feature,
    status: row.status,
    model: row.model,
    rateVersion: row.rateVersion,
    calls: row._count._all,
    inputTokens: row._sum.inputTokens ?? 0,
    outputTokens: row._sum.outputTokens ?? 0,
    costMicroUsd: row._sum.costMicroUsd ?? 0,
  }));

  return { month, summary: summariseAiSpend(rows) };
}
