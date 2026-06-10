/**
 * Date-range filter for the Reports page (?from=YYYY-MM-DD&to=YYYY-MM-DD).
 *
 * Both dates are INCLUSIVE calendar days in UTC: `to` becomes an exclusive
 * upper bound of the following midnight, so "from=2026-04-23&to=2026-06-04"
 * covers all of 4 June. Reversed inputs are swapped rather than rejected
 * (staff picking dates backwards shouldn't see an empty report). Invalid
 * or missing values → null → the page falls back to All-time.
 *
 * Pure — exported for unit tests.
 */

export type ReportDateRange = {
  /** Inclusive lower bound (UTC midnight of `fromIso`). */
  gte: Date;
  /** Exclusive upper bound (UTC midnight AFTER `toIso`). */
  lt: Date;
  /** Echoed back into inputs/links. */
  fromIso: string;
  toIso: string;
  /** Staff-facing label, e.g. "23 Apr 2026 – 4 Jun 2026". */
  label: string;
};

const ISO_DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

function parseUtcDay(iso: string): Date | null {
  if (!ISO_DAY_RE.test(iso)) return null;
  const d = new Date(`${iso}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return null;
  // Reject normalised overflow like 2026-02-31 → 2026-03-03.
  if (d.toISOString().slice(0, 10) !== iso) return null;
  return d;
}

function dayLabel(d: Date): string {
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function parseReportDateRange(
  fromRaw: string | null | undefined,
  toRaw: string | null | undefined,
): ReportDateRange | null {
  const from = fromRaw ? parseUtcDay(fromRaw.trim()) : null;
  const to = toRaw ? parseUtcDay(toRaw.trim()) : null;
  if (!from || !to) return null;

  const [lo, hi] = from.getTime() <= to.getTime() ? [from, to] : [to, from];
  const lt = new Date(hi.getTime());
  lt.setUTCDate(lt.getUTCDate() + 1);

  return {
    gte: lo,
    lt,
    fromIso: lo.toISOString().slice(0, 10),
    toIso: hi.toISOString().slice(0, 10),
    label: `${dayLabel(lo)} – ${dayLabel(hi)}`,
  };
}
