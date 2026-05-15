"use client";

import { useMemo, useState } from "react";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

/**
 * PR #140 (G7) — staff-inspectable Do-not-contact rows.
 *
 * Adds a client-side search + sort to the suppressed emails / domains
 * tables on `/suppression`. No server actions are wired on these
 * tables — the underlying rows are read-only views populated by the
 * Sync action on the parent sources table.
 */

type Row = {
  id: string;
  value: string;
  clientName: string;
};

type SortColumn = "value" | "client";
type SortDirection = "asc" | "desc";

function compareString(a: string, b: string): number {
  return a.localeCompare(b, undefined, { sensitivity: "base" });
}

function applyFilters(
  rows: Row[],
  query: string,
  sortCol: SortColumn,
  sortDir: SortDirection,
): Row[] {
  const needle = query.trim().toLowerCase();
  const filtered = rows.filter((r) => {
    if (!needle) return true;
    return (
      r.value.toLowerCase().includes(needle) ||
      r.clientName.toLowerCase().includes(needle)
    );
  });
  const sorted = [...filtered];
  sorted.sort((a, b) => {
    const cmp =
      sortCol === "value"
        ? compareString(a.value, b.value)
        : compareString(a.clientName, b.clientName);
    return sortDir === "asc" ? cmp : -cmp;
  });
  return sorted;
}

type Props = {
  /** Display label for the row value column header. */
  valueLabel: string;
  /** Type of rows shown ("email" / "domain"). Used in copy. */
  rowKindShort: string;
  rows: Row[];
};

export function SuppressionRowsInspectableTable({
  valueLabel,
  rowKindShort,
  rows,
}: Props) {
  const [query, setQuery] = useState("");
  const [sortCol, setSortCol] = useState<SortColumn>("value");
  const [sortDir, setSortDir] = useState<SortDirection>("asc");

  const filtered = useMemo(
    () => applyFilters(rows, query, sortCol, sortDir),
    [rows, query, sortCol, sortDir],
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
            placeholder={`${valueLabel} or client`}
            className="w-56 rounded border border-border/60 bg-background px-2 py-1 text-xs"
            aria-label={`Search blocked ${rowKindShort.toLowerCase()}s`}
          />
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
            <option value="value">{valueLabel}</option>
            <option value="client">Client</option>
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
            <option value="asc">A → Z</option>
            <option value="desc">Z → A</option>
          </select>
        </label>
        <p className="ml-auto text-[11px] text-muted-foreground">
          Showing{" "}
          <span className="font-semibold tabular-nums text-foreground">
            {filtered.length}
          </span>{" "}
          of{" "}
          <span className="font-semibold tabular-nums text-foreground">
            {rows.length}
          </span>
        </p>
      </div>

      {rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          No {rowKindShort.toLowerCase()}s blocked yet.
        </p>
      ) : filtered.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted-foreground">
          No {rowKindShort.toLowerCase()}s match the current filters.
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{valueLabel}</TableHead>
              <TableHead>Client</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-mono text-sm">{r.value}</TableCell>
                <TableCell>{r.clientName}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

export const __test__ = { applyFilters };
