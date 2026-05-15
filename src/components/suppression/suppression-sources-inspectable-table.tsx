"use client";

import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  suppressionKindLabel,
  suppressionSyncStatusBadgeVariant,
  suppressionSyncStatusLabel,
} from "@/lib/suppression/staff-labels";

/**
 * PR #140 (G7) — staff-inspectable Do-not-contact tables.
 *
 * Adds client-side search + kind/sync-status filter + sort to the
 * Connected sheets table on `/suppression`. The Sync button is a
 * standard server-action form; it is NEVER invoked by render. Only
 * an explicit click submits the form, exactly like the pre-PR140
 * implementation.
 */

type SuppressionKind = "EMAIL" | "DOMAIN";

type SuppressionSourceRow = {
  id: string;
  kind: SuppressionKind;
  spreadsheetId: string | null;
  sheetRange: string | null;
  syncStatus: string;
  lastError: string | null;
  client: { id: string; name: string };
  _count: { suppressedEmails: number; suppressedDomains: number };
};

const KIND_OPTIONS = [
  { value: "ALL", label: "All list types" },
  { value: "EMAIL", label: suppressionKindLabel("EMAIL") },
  { value: "DOMAIN", label: suppressionKindLabel("DOMAIN") },
] as const;

type KindFilter = (typeof KIND_OPTIONS)[number]["value"];

type SortColumn = "client" | "kind" | "rows" | "status";
type SortDirection = "asc" | "desc";

const SORT_OPTIONS: Array<{ value: SortColumn; label: string }> = [
  { value: "client", label: "Client" },
  { value: "kind", label: "List type" },
  { value: "rows", label: "Row count" },
  { value: "status", label: "Connection" },
];

function rowCount(s: SuppressionSourceRow): number {
  return s.kind === "EMAIL"
    ? s._count.suppressedEmails
    : s._count.suppressedDomains;
}

function compareString(a: string, b: string): number {
  return a.localeCompare(b, undefined, { sensitivity: "base" });
}

function applyFilters(
  sources: SuppressionSourceRow[],
  query: string,
  kind: KindFilter,
  sortCol: SortColumn,
  sortDir: SortDirection,
): SuppressionSourceRow[] {
  const needle = query.trim().toLowerCase();
  const filtered = sources.filter((s) => {
    if (kind !== "ALL" && s.kind !== kind) return false;
    if (!needle) return true;
    const haystack = [
      s.client.name,
      s.spreadsheetId ?? "",
      s.sheetRange ?? "",
      suppressionKindLabel(s.kind),
      suppressionSyncStatusLabel(s.syncStatus),
    ]
      .filter(Boolean)
      .map((v) => v.toLowerCase());
    return haystack.some((v) => v.includes(needle));
  });
  const sorted = [...filtered];
  sorted.sort((a, b) => {
    let cmp = 0;
    switch (sortCol) {
      case "client":
        cmp = compareString(a.client.name, b.client.name);
        break;
      case "kind":
        cmp = compareString(a.kind, b.kind);
        break;
      case "rows":
        cmp = rowCount(a) - rowCount(b);
        break;
      case "status":
        cmp = compareString(
          suppressionSyncStatusLabel(a.syncStatus),
          suppressionSyncStatusLabel(b.syncStatus),
        );
        break;
    }
    return sortDir === "asc" ? cmp : -cmp;
  });
  return sorted;
}

type Props = {
  sources: SuppressionSourceRow[];
  // Server action — bound on the server, called only when the form is
  // submitted by an explicit user click. NEVER invoked on render.
  runSuppressionSyncAction: (formData: FormData) => Promise<void> | void;
};

export function SuppressionSourcesInspectableTable({
  sources,
  runSuppressionSyncAction,
}: Props) {
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<KindFilter>("ALL");
  const [sortCol, setSortCol] = useState<SortColumn>("client");
  const [sortDir, setSortDir] = useState<SortDirection>("asc");

  const filtered = useMemo(
    () => applyFilters(sources, query, kind, sortCol, sortDir),
    [sources, query, kind, sortCol, sortDir],
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3 rounded-md border border-border/60 bg-muted/10 px-3 py-2 text-xs">
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Search
          </span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Client, spreadsheet, range, status"
            className="w-64 rounded border border-border/60 bg-background px-2 py-1 text-xs"
            aria-label="Search connected do-not-contact sheets"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            List type
          </span>
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as KindFilter)}
            className="rounded border border-border/60 bg-background px-2 py-1 text-xs"
            aria-label="Filter by list type"
          >
            {KIND_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Sort by
          </span>
          <select
            value={sortCol}
            onChange={(e) => setSortCol(e.target.value as SortColumn)}
            className="rounded border border-border/60 bg-background px-2 py-1 text-xs"
            aria-label="Sort column"
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Direction
          </span>
          <select
            value={sortDir}
            onChange={(e) => setSortDir(e.target.value as SortDirection)}
            className="rounded border border-border/60 bg-background px-2 py-1 text-xs"
            aria-label="Sort direction"
          >
            <option value="asc">A → Z / low → high</option>
            <option value="desc">Z → A / high → low</option>
          </select>
        </label>
        <p className="ml-auto text-[11px] text-muted-foreground">
          Showing{" "}
          <span className="font-semibold tabular-nums text-foreground">
            {filtered.length}
          </span>{" "}
          of{" "}
          <span className="font-semibold tabular-nums text-foreground">
            {sources.length}
          </span>
        </p>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Client</TableHead>
            <TableHead>List type</TableHead>
            <TableHead>Spreadsheet</TableHead>
            <TableHead>Range</TableHead>
            <TableHead>Connection</TableHead>
            <TableHead className="text-right">Rows</TableHead>
            <TableHead className="w-[100px]" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {filtered.map((s) => (
            <TableRow key={s.id}>
              <TableCell>{s.client.name}</TableCell>
              <TableCell>
                <Badge variant={s.kind === "EMAIL" ? "default" : "secondary"}>
                  {suppressionKindLabel(s.kind)}
                </Badge>
              </TableCell>
              <TableCell className="max-w-[200px] truncate font-mono text-xs">
                {s.spreadsheetId ?? "—"}
              </TableCell>
              <TableCell className="max-w-[140px] truncate font-mono text-xs">
                {s.sheetRange ?? "Sheet1!A1:Z50000"}
              </TableCell>
              <TableCell>
                <Badge variant={suppressionSyncStatusBadgeVariant(s.syncStatus)}>
                  {suppressionSyncStatusLabel(s.syncStatus)}
                </Badge>
                {s.lastError ? (
                  <p className="mt-1 max-w-[200px] truncate text-[10px] text-destructive">
                    {s.lastError}
                  </p>
                ) : null}
              </TableCell>
              <TableCell className="text-right text-muted-foreground">
                {rowCount(s)}
              </TableCell>
              <TableCell>
                <form action={runSuppressionSyncAction}>
                  <input type="hidden" name="sourceId" value={s.id} />
                  <Button type="submit" size="sm" variant="outline">
                    Sync
                  </Button>
                </form>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {sources.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          No do-not-contact sheets connected yet. Connect one from a
          client&rsquo;s Do-not-contact tab.
        </p>
      ) : filtered.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted-foreground">
          No sheets match the current filters.
        </p>
      ) : null}
    </div>
  );
}

export const __test__ = {
  applyFilters,
  KIND_OPTIONS,
  SORT_OPTIONS,
};
