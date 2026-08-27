import "server-only";

import { prisma } from "@/lib/db";
import { assertClientInAccessibleList, whereInAccessibleClients } from "@/server/tenant/access";

export async function listSuppressionSourcesForStaff(
  accessibleClientIds: string[],
  filterClientId?: string,
) {
  if (accessibleClientIds.length === 0) {
    return [];
  }
  if (filterClientId) {
    assertClientInAccessibleList(filterClientId, accessibleClientIds);
  }

  const where = filterClientId
    ? { clientId: filterClientId }
    : whereInAccessibleClients(accessibleClientIds);

  return prisma.suppressionSource.findMany({
    where,
    orderBy: { updatedAt: "desc" },
    include: {
      client: { select: { name: true, id: true } },
      _count: { select: { suppressedEmails: true, suppressedDomains: true } },
    },
  });
}

/**
 * How many blocked rows one page of /suppression shows.
 *
 * This used to be a bare `take: 200` and the page reported `rows.length` as the
 * total, so a client with 30,229 blocked addresses read "Showing 200 of 200".
 * The limit itself is fine — rendering 30,229 rows is not — but the caller now
 * gets the real count and an offset alongside them, and the search runs in the
 * database rather than over whichever 200 rows happened to load.
 */
export const SUPPRESSION_ROW_PAGE_SIZE = 200;

export type SuppressionRowQuery = {
  accessibleClientIds: string[];
  filterClientId?: string;
  /** Free-text search, run against the value column in the database. */
  search?: string;
  offset?: number;
};

export type SuppressionRowPage<TRow> = {
  rows: TRow[];
  /** Every row matching the filter, counted in the database — not `rows.length`. */
  total: number;
  pageSize: number;
  offset: number;
};

/**
 * The tenant wall plus the optional search term, in one place, so that the
 * `findMany` and the `count` cannot be built differently. If they drifted, the
 * total would describe a different set of rows than the table shows — which is
 * the defect this module was changed to remove.
 */
function suppressionRowWhere(
  { accessibleClientIds, filterClientId, search }: SuppressionRowQuery,
  valueColumn: "email" | "domain",
) {
  if (filterClientId) {
    assertClientInAccessibleList(filterClientId, accessibleClientIds);
  }

  const scope = filterClientId
    ? { clientId: filterClientId }
    : whereInAccessibleClients(accessibleClientIds);

  const needle = search?.trim();
  if (!needle) {
    return scope;
  }
  return {
    ...scope,
    [valueColumn]: { contains: needle, mode: "insensitive" as const },
  };
}

function emptyPage<TRow>(offset: number): SuppressionRowPage<TRow> {
  return { rows: [], total: 0, pageSize: SUPPRESSION_ROW_PAGE_SIZE, offset };
}

export async function listSuppressedEmailsForStaff(
  query: SuppressionRowQuery,
): Promise<SuppressionRowPage<{ id: string; email: string; client: { name: string } }>> {
  const offset = Math.max(0, query.offset ?? 0);
  if (query.accessibleClientIds.length === 0) {
    return emptyPage(0);
  }

  const where = suppressionRowWhere(query, "email");
  const [rows, total] = await Promise.all([
    prisma.suppressedEmail.findMany({
      where,
      // Alphabetical, so "the first 200" is a statement a person can check —
      // the old `syncedAt: desc` produced an arbitrary window that happened to
      // start at songa.co.uk.
      orderBy: [{ email: "asc" }],
      skip: offset,
      take: SUPPRESSION_ROW_PAGE_SIZE,
      include: { client: { select: { name: true } } },
    }),
    prisma.suppressedEmail.count({ where }),
  ]);

  return { rows, total, pageSize: SUPPRESSION_ROW_PAGE_SIZE, offset };
}

export async function listSuppressedDomainsForStaff(
  query: SuppressionRowQuery,
): Promise<SuppressionRowPage<{ id: string; domain: string; client: { name: string } }>> {
  const offset = Math.max(0, query.offset ?? 0);
  if (query.accessibleClientIds.length === 0) {
    return emptyPage(0);
  }

  const where = suppressionRowWhere(query, "domain");
  const [rows, total] = await Promise.all([
    prisma.suppressedDomain.findMany({
      where,
      orderBy: [{ domain: "asc" }],
      skip: offset,
      take: SUPPRESSION_ROW_PAGE_SIZE,
      include: { client: { select: { name: true } } },
    }),
    prisma.suppressedDomain.count({ where }),
  ]);

  return { rows, total, pageSize: SUPPRESSION_ROW_PAGE_SIZE, offset };
}
