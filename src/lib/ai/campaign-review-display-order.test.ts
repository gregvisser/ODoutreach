import { describe, expect, it } from "vitest";

import {
  isMostRecentlyReviewed,
  orderSequencesByReviewRecency,
} from "./campaign-review-display-order";

/**
 * Queue item 133, finding 1 — "grading five sequences becomes one massive
 * screen and I have to hunt for the one just graded." These tests lock in
 * the fix: the most recently reviewed sequence sorts to the top and is the
 * only one open by default.
 */

describe("orderSequencesByReviewRecency", () => {
  it("puts the most recently reviewed sequence first", () => {
    const sequences = [{ id: "a" }, { id: "b" }, { id: "c" }];
    const reviewedAt = new Map([
      ["a", new Date("2026-08-01T00:00:00Z")],
      ["b", new Date("2026-08-30T00:00:00Z")],
      ["c", new Date("2026-08-15T00:00:00Z")],
    ]);

    const ordered = orderSequencesByReviewRecency(sequences, reviewedAt);

    expect(ordered.map((s) => s.id)).toEqual(["b", "c", "a"]);
  });

  it("keeps never-reviewed sequences after all reviewed ones, original order preserved", () => {
    const sequences = [
      { id: "never-1" },
      { id: "reviewed" },
      { id: "never-2" },
    ];
    const reviewedAt = new Map([
      ["reviewed", new Date("2026-08-20T00:00:00Z")],
    ]);

    const ordered = orderSequencesByReviewRecency(sequences, reviewedAt);

    expect(ordered.map((s) => s.id)).toEqual([
      "reviewed",
      "never-1",
      "never-2",
    ]);
  });

  it("is a no-op when nothing has been reviewed", () => {
    const sequences = [{ id: "x" }, { id: "y" }];
    const ordered = orderSequencesByReviewRecency(sequences, new Map());
    expect(ordered.map((s) => s.id)).toEqual(["x", "y"]);
  });
});

describe("isMostRecentlyReviewed", () => {
  it("is true only for the single newest review", () => {
    const order = ["b", "c", "a"];
    const reviewedAt = new Map([
      ["a", new Date("2026-08-01T00:00:00Z")],
      ["b", new Date("2026-08-30T00:00:00Z")],
      ["c", new Date("2026-08-15T00:00:00Z")],
    ]);

    expect(isMostRecentlyReviewed("b", order, reviewedAt)).toBe(true);
    expect(isMostRecentlyReviewed("c", order, reviewedAt)).toBe(false);
    expect(isMostRecentlyReviewed("a", order, reviewedAt)).toBe(false);
  });

  it("is false for every sequence when nothing has been reviewed", () => {
    const order = ["x", "y"];
    expect(isMostRecentlyReviewed("x", order, new Map())).toBe(false);
    expect(isMostRecentlyReviewed("y", order, new Map())).toBe(false);
  });
});
