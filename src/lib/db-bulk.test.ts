import { describe, expect, it } from "vitest";

import {
  BULK_TRANSACTION_OPTIONS,
  BULK_WRITE_CHUNK_SIZE,
  chunk,
} from "./db-bulk";

describe("chunk", () => {
  it("splits into batches of at most `size`", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it("returns one batch when items fit", () => {
    expect(chunk([1, 2, 3], 10)).toEqual([[1, 2, 3]]);
  });

  it("returns no batches for an empty array", () => {
    expect(chunk([], 100)).toEqual([]);
  });

  it("covers every item exactly once across batches", () => {
    const items = Array.from({ length: 12_345 }, (_, i) => i);
    const batches = chunk(items, BULK_WRITE_CHUNK_SIZE);
    expect(batches.flat()).toEqual(items);
    for (const b of batches) expect(b.length).toBeLessThanOrEqual(BULK_WRITE_CHUNK_SIZE);
  });

  it("falls back to a single chunk when size <= 0", () => {
    expect(chunk([1, 2, 3], 0)).toEqual([[1, 2, 3]]);
  });
});

describe("BULK_TRANSACTION_OPTIONS", () => {
  it("raises the interactive-transaction timeout well above Prisma's 5s default", () => {
    expect(BULK_TRANSACTION_OPTIONS.timeout).toBeGreaterThanOrEqual(60_000);
    expect(BULK_TRANSACTION_OPTIONS.maxWait).toBeGreaterThan(0);
  });
});
