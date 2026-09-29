/**
 * Staff-facing dates that render on both the server and the client.
 *
 * `Intl` and `date-fns` `format` use the machine's local zone. Azure runs UTC
 * and a London browser is an hour ahead in summer, so the server HTML and the
 * hydrated client disagree (React error #418). UTC calendar parts are the same
 * number in both places. Callers that already name a zone (Europe/London on a
 * sending calendar) should keep that zone and not use these helpers.
 */

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

function asDate(value: Date | string | number): Date | null {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function pad2(n: number): string {
  return n < 10 ? `0${String(n)}` : String(n);
}

/** "29 Sep 2026", or an em dash when the value is missing or unreadable. */
export function formatStaffDate(value: Date | string | number | null | undefined): string {
  if (value == null || value === "") return "—";
  const date = asDate(value);
  if (!date) return "—";
  const month = MONTHS[date.getUTCMonth()] ?? "Jan";
  return `${String(date.getUTCDate())} ${month} ${String(date.getUTCFullYear())}`;
}

/** "29 Sep 2026, 23:30 UTC", or an em dash when the value is missing or unreadable. */
export function formatStaffDateTime(value: Date | string | number | null | undefined): string {
  if (value == null || value === "") return "—";
  const date = asDate(value);
  if (!date) return "—";
  return `${formatStaffDate(date)}, ${pad2(date.getUTCHours())}:${pad2(date.getUTCMinutes())} UTC`;
}
