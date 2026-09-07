import { describe, expect, it } from "vitest";

import { allowedRemovals, decideSuppressionReplace } from "./replace-guard";

const entries = (count: number) => Array.from({ length: count }, (_, i) => `entry-${i}.example`);
const next = (count: number) => new Set(entries(count));

describe("decideSuppressionReplace", () => {
  it("allows a sync into a list that holds nothing", () => {
    // Pareto FM's real state: never synced, so no protection can be lost.
    expect(decideSuppressionReplace("DOMAIN", next(480), []).allowed).toBe(true);
    expect(decideSuppressionReplace("DOMAIN", next(0), []).allowed).toBe(true);
  });

  it("allows growth or an unchanged list when previous entries are retained", () => {
    expect(decideSuppressionReplace("EMAIL", next(1000), entries(900)).allowed).toBe(true);
    expect(decideSuppressionReplace("EMAIL", next(900), entries(900)).allowed).toBe(true);
  });

  it("refuses to empty a list that has entries", () => {
    // Train Hugger: 373 blocked domains becoming sendable in one click.
    const d = decideSuppressionReplace("DOMAIN", next(0), entries(373));
    expect(d.allowed).toBe(false);
    if (d.allowed) throw new Error("expected a refusal");
    expect(d.refusal).toMatchObject({
      previousCount: 373,
      wouldWrite: 0,
      removed: 373,
    });
    expect(d.refusal.reason).toContain("373");
    expect(d.refusal.reason).toContain("Nothing was deleted");
  });

  it("refuses a large proportional shrink", () => {
    const d = decideSuppressionReplace("DOMAIN", next(200), entries(373));
    expect(d.allowed).toBe(false);
    if (d.allowed) throw new Error("expected a refusal");
    expect(d.refusal.removed).toBe(173);
  });

  it("allows an ordinary edit that removes a few rows from a big list", () => {
    // 10% of 373 is 37, so removing 30 is somebody maintaining the sheet.
    expect(decideSuppressionReplace("DOMAIN", next(343), entries(373)).allowed).toBe(true);
  });

  it("allows small lists to shrink by the absolute floor", () => {
    // 10% of 6 rounds to 0; without a floor no small list could ever be edited.
    expect(decideSuppressionReplace("EMAIL", next(1), entries(6)).allowed).toBe(true);
    expect(decideSuppressionReplace("EMAIL", next(0), entries(6)).allowed).toBe(false);
  });

  it("names the right thing in each list's refusal", () => {
    const email = decideSuppressionReplace("EMAIL", next(0), entries(50));
    const domain = decideSuppressionReplace("DOMAIN", next(0), entries(50));
    if (email.allowed || domain.allowed) throw new Error("expected refusals");
    expect(email.refusal.reason).toContain("addresses");
    expect(domain.refusal.reason).toContain("domains");
  });

  it.each([100, 150])("counts missing original entries even with %i replacement entries", (size) => {
    const replacement = new Set(Array.from({ length: size }, (_, i) => `new-${i}.example`));
    const result = decideSuppressionReplace("DOMAIN", replacement, entries(100));
    expect(result).toMatchObject({ allowed: false, refusal: { removed: 100, previousCount: 100, wouldWrite: size } });
    if (result.allowed) throw new Error("expected refusal");
    expect(result.refusal.reason).toContain(`replacement list would contain ${size}`);
  });

  it("applies the existing removal threshold to actual missing entries", () => {
    const previous = entries(100);
    const replacement = new Set([...previous.slice(10), "new.example"]);
    expect(decideSuppressionReplace("DOMAIN", replacement, previous).allowed).toBe(true);
    replacement.delete(previous[10]);
    expect(decideSuppressionReplace("DOMAIN", replacement, previous)).toMatchObject({ allowed: false, refusal: { removed: 11 } });
  });
});

describe("allowedRemovals", () => {
  it("never drops below the absolute floor", () => {
    expect(allowedRemovals(0)).toBe(5);
    expect(allowedRemovals(10)).toBe(5);
  });

  it("scales with the list once the list is big enough", () => {
    expect(allowedRemovals(373)).toBe(37);
    expect(allowedRemovals(1000)).toBe(100);
  });
});
