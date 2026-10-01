import { describe, expect, it } from "vitest";

import { decideSuppressionReplace } from "./replace-guard";

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
    expect(d.refusal.reason).toContain("stay blocked");
  });

  it("mirrors a shorter non-empty sheet", () => {
    expect(decideSuppressionReplace("DOMAIN", next(200), entries(373)).allowed).toBe(true);
    expect(decideSuppressionReplace("DOMAIN", next(372), entries(373)).allowed).toBe(true);
    expect(decideSuppressionReplace("EMAIL", next(5), entries(6)).allowed).toBe(true);
    expect(decideSuppressionReplace("EMAIL", next(1), entries(6)).allowed).toBe(true);
  });

  it("still refuses an empty sheet when rows are already stored", () => {
    expect(decideSuppressionReplace("EMAIL", next(0), entries(6)).allowed).toBe(false);
  });

  it("names the right thing in each list's refusal", () => {
    const email = decideSuppressionReplace("EMAIL", next(0), entries(50));
    const domain = decideSuppressionReplace("DOMAIN", next(0), entries(50));
    if (email.allowed || domain.allowed) throw new Error("expected refusals");
    expect(email.refusal.reason).toContain("addresses");
    expect(domain.refusal.reason).toContain("domains");
  });

  it.each([100, 150])("allows a full replacement of %i new rows", (size) => {
    const replacement = new Set(Array.from({ length: size }, (_, i) => `new-${i}.example`));
    expect(decideSuppressionReplace("DOMAIN", replacement, entries(100)).allowed).toBe(true);
  });

  it("allows a sheet that both adds and removes", () => {
    const previous = entries(100);
    const replacement = new Set([...previous.slice(1), "new.example", "another.example"]);
    expect(decideSuppressionReplace("DOMAIN", replacement, previous).allowed).toBe(true);
  });
});
