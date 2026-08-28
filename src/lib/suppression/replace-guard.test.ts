import { describe, expect, it } from "vitest";

import { allowedRemovals, decideSuppressionReplace } from "./replace-guard";

describe("decideSuppressionReplace", () => {
  it("allows a sync into a list that holds nothing", () => {
    // Pareto FM's real state: never synced, so no protection can be lost.
    expect(decideSuppressionReplace("DOMAIN", 480, 0).allowed).toBe(true);
    expect(decideSuppressionReplace("DOMAIN", 0, 0).allowed).toBe(true);
  });

  it("allows a list that grew or stayed the same", () => {
    expect(decideSuppressionReplace("EMAIL", 1000, 900).allowed).toBe(true);
    expect(decideSuppressionReplace("EMAIL", 900, 900).allowed).toBe(true);
  });

  it("refuses to empty a list that has entries", () => {
    // Train Hugger: 373 blocked domains becoming sendable in one click.
    const d = decideSuppressionReplace("DOMAIN", 0, 373);
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
    const d = decideSuppressionReplace("DOMAIN", 200, 373);
    expect(d.allowed).toBe(false);
    if (d.allowed) throw new Error("expected a refusal");
    expect(d.refusal.removed).toBe(173);
  });

  it("allows an ordinary edit that removes a few rows from a big list", () => {
    // 10% of 373 is 37, so removing 30 is somebody maintaining the sheet.
    expect(decideSuppressionReplace("DOMAIN", 343, 373).allowed).toBe(true);
  });

  it("allows small lists to shrink by the absolute floor", () => {
    // 10% of 6 rounds to 0; without a floor no small list could ever be edited.
    expect(decideSuppressionReplace("EMAIL", 1, 6).allowed).toBe(true);
    expect(decideSuppressionReplace("EMAIL", 0, 6).allowed).toBe(false);
  });

  it("names the right thing in each list's refusal", () => {
    const email = decideSuppressionReplace("EMAIL", 0, 50);
    const domain = decideSuppressionReplace("DOMAIN", 0, 50);
    if (email.allowed || domain.allowed) throw new Error("expected refusals");
    expect(email.refusal.reason).toContain("addresses");
    expect(domain.refusal.reason).toContain("domains");
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
