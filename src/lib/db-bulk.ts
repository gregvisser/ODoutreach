/**
 * Shared helpers for BULK database work (uploading/syncing user-scale
 * lists: DNC/suppression sheets, contact-list members, enrollments).
 *
 * Two failure modes these guard against:
 *
 * 1. Interactive-transaction timeout. Prisma's default interactive
 *    `$transaction(fn)` timeout is 5 seconds. A large delete-and-recreate
 *    (e.g. a big Do-Not-Contact sync) easily runs longer and fails with
 *    "A commit cannot be executed on an expired transaction". Bulk
 *    interactive transactions must pass `BULK_TRANSACTION_OPTIONS`.
 *
 * 2. One oversized statement. `createMany` sends every row in a single
 *    INSERT; a very large upload becomes one huge statement. Insert in
 *    `BULK_WRITE_CHUNK_SIZE` batches via `chunk()` instead.
 */

/**
 * Prisma interactive-transaction options for bulk work. The generous
 * timeout lets a large atomic delete+recreate (suppression sync, sequence
 * delete) commit; maxWait bounds how long we'll queue for a connection.
 */
export const BULK_TRANSACTION_OPTIONS = {
  maxWait: 20_000,
  timeout: 120_000,
} as const;

/** Max rows per `createMany` statement for bulk inserts. */
export const BULK_WRITE_CHUNK_SIZE = 5_000;

/**
 * Split an array into chunks of at most `size`. Returns a single chunk
 * (a copy) when `size <= 0`. Pure — safe to unit test.
 */
export function chunk<T>(
  items: readonly T[],
  size: number = BULK_WRITE_CHUNK_SIZE,
): T[][] {
  if (size <= 0) return [items.slice()];
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}
