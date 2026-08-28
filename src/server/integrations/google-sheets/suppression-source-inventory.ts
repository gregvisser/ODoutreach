import "server-only";

import { prisma } from "@/lib/db";
import { suppressionKindLabel } from "@/lib/suppression/staff-labels";

/**
 * What do-not-contact sheets exist, and how many rows does each list hold
 * RIGHT NOW — answered without calling Google at all.
 *
 * ## Why this is separate from the dry run
 *
 * "Which sheets are configured?" and "what does each sheet hold?" had been the
 * same question, and only the expensive one was ever asked. The dry run resolves
 * a tab and reads cells for every source: sixty-eight Google requests, paced at
 * 1.1s to stay under a 60-per-minute ceiling, inside ONE HTTP request. On
 * 2026-08-28 that answered 502, 207, 499 and 504 across four attempts — three of
 * the four hit Azure's ~230s limit.
 *
 * The consequence was worse than slow. The source id is the handle you need to
 * repair one client's list, and the only place it appeared was the output of
 * the call that kept timing out. So the tool for fixing a broken blocklist was
 * unreachable exactly when blocklists were broken.
 *
 * This asks the database and nothing else. It is milliseconds, it cannot exceed
 * a quota, and it cannot time out. It also cannot tell you what the SHEET holds
 * — only what the list holds — and that division is the point: `previousCount`
 * from a dry run and `storedRows` here are the same number by a different
 * route, so this is how you check a sync actually landed.
 */
export type SuppressionSourceInventoryEntry = {
  /** The handle needed to sync this one sheet on its own. */
  sourceId: string;
  client: string;
  /** "Whole domains" / "Email addresses", as staff see it. */
  kind: string;
  /**
   * Rows in the blocklist for this source today.
   *
   * The number that matters: zero here means that client has no protection of
   * this kind, whatever the sheet says and whatever the last run reported.
   */
  storedRows: number;
  /** False when no spreadsheet is linked — the sync would never pick it up. */
  spreadsheetLinked: boolean;
  /**
   * True when an operator has saved an explicit tab/range, so the sync does not
   * resolve one. Reported because a saved range OVERRIDES tab resolution, which
   * makes it the first thing to check when a sheet reads the wrong tab.
   */
  rangeSaved: boolean;
  syncStatus: string;
  lastSyncedAt: string | null;
  /** The stored failure reason, when the last run left one. */
  lastError: string | null;
};

export type SuppressionSourceInventory = {
  sources: number;
  /**
   * How many configured lists hold ZERO rows.
   *
   * Surfaced as its own number because it is the one an operator should react
   * to and the one an aggregate hides: a total of 50,692 stored rows looked
   * healthy for weeks while Pareto FM's domain list sat empty inside it.
   */
  empty: number;
  entries: SuppressionSourceInventoryEntry[];
};

export async function listSuppressionSourceInventory(): Promise<SuppressionSourceInventory> {
  const sources = await prisma.suppressionSource.findMany({
    select: {
      id: true,
      kind: true,
      spreadsheetId: true,
      sheetRange: true,
      syncStatus: true,
      lastSyncedAt: true,
      lastError: true,
      client: { select: { name: true } },
      _count: { select: { suppressedEmails: true, suppressedDomains: true } },
    },
    orderBy: [{ client: { name: "asc" } }, { kind: "asc" }],
  });

  const entries = sources.map((s): SuppressionSourceInventoryEntry => {
    // A source counts rows in the table matching its OWN kind. Summing both
    // would report a domain list as populated because the same client's email
    // list has rows in it — which is precisely the confusion that let "this
    // client is protected" be believed about a list holding nothing.
    const storedRows =
      s.kind === "EMAIL"
        ? s._count.suppressedEmails
        : s._count.suppressedDomains;

    return {
      sourceId: s.id,
      client: s.client.name,
      kind: suppressionKindLabel(s.kind),
      storedRows,
      spreadsheetLinked: Boolean(s.spreadsheetId),
      rangeSaved: Boolean(s.sheetRange?.trim()),
      syncStatus: s.syncStatus,
      lastSyncedAt: s.lastSyncedAt ? s.lastSyncedAt.toISOString() : null,
      lastError: s.lastError,
    };
  });

  return {
    sources: entries.length,
    empty: entries.filter((e) => e.storedRows === 0).length,
    entries,
  };
}
