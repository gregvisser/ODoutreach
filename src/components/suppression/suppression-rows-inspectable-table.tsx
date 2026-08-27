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
import { cn } from "@/lib/utils";
import { describeRowWindow, type RowNoun } from "@/lib/suppression/row-window";

/**
 * The blocked emails / blocked domains tables on /suppression.
 *
 * Originally (PR #140) a client component that searched and sorted whatever
 * rows the server had already sent. That was wrong in a way that mattered:
 * the server sent an arbitrary 200 rows, so searching for an address that was
 * genuinely blocked — but not in those 200 — answered "no matches". On a
 * do-not-contact screen the whole point is to be able to ask "is this person
 * blocked?" and be told the truth.
 *
 * It is now a server component. Search and paging are URL parameters handled by
 * the database, so the search covers every blocked row, and the count under the
 * table is the real count rather than `rows.length`.
 *
 * The sort controls were dropped rather than moved. Re-ordering the 200 rows in
 * front of you, out of 30,229, is the same lie in a different shape; the rows
 * are alphabetical and searchable, which is what the screen is actually for.
 */

type Row = {
  id: string;
  value: string;
  clientName: string;
};

type Props = {
  /** Display label for the row value column header, e.g. "Email". */
  valueLabel: string;
  /** Singular / plural noun used in the count sentence. */
  noun: RowNoun;
  rows: Row[];
  /** Real number of matching rows, counted in the database. */
  total: number;
  pageSize: number;
  offset: number;
  /** Current search term, if any. */
  search: string;
  /** Prefix for this table's URL params, e.g. "email" → emailQ / emailFrom. */
  paramPrefix: string;
  /**
   * The page's other current params (the client filter, and the *other*
   * table's search and page), so navigating one table does not silently
   * reset the other.
   */
  carryParams: Record<string, string>;
};

function hrefWithOffset(
  carryParams: Record<string, string>,
  paramPrefix: string,
  search: string,
  offset: number,
): string {
  const params = new URLSearchParams(carryParams);
  if (search) params.set(`${paramPrefix}Q`, search);
  if (offset > 0) params.set(`${paramPrefix}From`, String(offset));
  const qs = params.toString();
  return qs ? `/suppression?${qs}` : "/suppression";
}

export function SuppressionRowsInspectableTable({
  valueLabel,
  noun,
  rows,
  total,
  pageSize,
  offset,
  search,
  paramPrefix,
  carryParams,
}: Props) {
  const searching = search.trim().length > 0;
  const searchInputId = `${paramPrefix}-search`;
  const summary = describeRowWindow({
    total,
    shown: rows.length,
    offset,
    searching,
    noun,
  });

  const hasPrev = offset > 0;
  const hasNext = offset + rows.length < total;

  return (
    <div className="space-y-3">
      <form
        method="GET"
        action="/suppression"
        className="flex flex-wrap items-end gap-2 rounded-md border border-border/60 bg-muted/10 px-3 py-2"
      >
        {/*
          Carry the client filter and the other table's state through the
          submit. Deliberately NOT this table's own offset — a new search
          starts at the first page.
        */}
        {Object.entries(carryParams).map(([key, value]) => (
          <input key={key} type="hidden" name={key} value={value} />
        ))}
        <label className="flex flex-col gap-1" htmlFor={searchInputId}>
          <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Search every {noun.one}
          </span>
          <input
            id={searchInputId}
            type="search"
            name={`${paramPrefix}Q`}
            defaultValue={search}
            placeholder={`${valueLabel} or part of one`}
            className="w-56 rounded border border-border/60 bg-background px-2 py-1 text-xs"
          />
        </label>
        <button
          type="submit"
          className={cn(buttonVariants({ variant: "secondary", size: "sm" }))}
        >
          Search
        </button>
        {searching ? (
          <Link prefetch={false}
            href={hrefWithOffset(carryParams, paramPrefix, "", 0)}
            className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
          >
            Clear
          </Link>
        ) : null}
      </form>

      <p className="text-[11px] text-muted-foreground">{summary}</p>

      {rows.length === 0 ? null : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{valueLabel}</TableHead>
              <TableHead>Client</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-mono text-sm">{r.value}</TableCell>
                <TableCell>{r.clientName}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {hasPrev || hasNext ? (
        <div className="flex items-center justify-between gap-2">
          {hasPrev ? (
            <Link prefetch={false}
              href={hrefWithOffset(
                carryParams,
                paramPrefix,
                search,
                Math.max(0, offset - pageSize),
              )}
              className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
            >
              ← Previous
            </Link>
          ) : (
            <span />
          )}
          {hasNext ? (
            <Link prefetch={false}
              href={hrefWithOffset(
                carryParams,
                paramPrefix,
                search,
                offset + pageSize,
              )}
              className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
            >
              Next →
            </Link>
          ) : (
            <span />
          )}
        </div>
      ) : null}
    </div>
  );
}

export const __test__ = { hrefWithOffset };
