/**
 * Outbound cap windows use the UTC calendar day (00:00–24:00 UTC) for all clients.
 * Documented in operator UI: "Sends (UTC day)".
 */
export function utcDateKeyForInstant(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Midnight UTC at the start of `d`'s day — the lower bound of the same window
 * `utcDateKeyForInstant` names. Used where a query needs the boundary as a Date
 * rather than as a key string.
 */
export function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0));
}

/** For tests: advance `d` to next UTC day boundary, return its date key. */
export function addUtcDays(d: Date, n: number): Date {
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + n, 0, 0, 0, 0),
  );
}
