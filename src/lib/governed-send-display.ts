/**
 * Pure helpers for governed-test send / ledger operator UI (no I/O).
 */

/** Shorten idempotency keys like `governedTest:clientId:uuid` for dense tables. */
export function shortenIdempotencyKey(key: string | null | undefined): string | null {
  if (key == null || key === "") return null;
  const parts = key.split(":");
  if (parts.length >= 3) {
    const tail = parts[parts.length - 1] ?? "";
    if (tail.length >= 8) {
      return `…${tail.slice(-8)}`;
    }
  }
  if (key.length <= 16) return key;
  return `…${key.slice(-12)}`;
}
