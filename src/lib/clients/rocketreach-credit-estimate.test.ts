import { describe, expect, it } from "vitest";
import {
  previewMaySearchRocketReach,
  rocketReachClickCostEstimate,
  rocketReachPersonSearchCostsCredits,
} from "./rocketreach-credit-estimate";

describe("rocketReachClickCostEstimate", () => {
  it("states the worst-case credit cost for the chosen max results", () => {
    expect(rocketReachClickCostEstimate(5)).toMatchObject({
      maxCredits: 5,
      headline: "This click can use up to 5 RocketReach credits.",
    });
    expect(rocketReachClickCostEstimate(1).headline).toBe(
      "This click can use up to 1 RocketReach credit.",
    );
  });

  it("treats classic People Search as free so preview may search, and blocks preview when a search would spend credits", () => {
    expect(rocketReachPersonSearchCostsCredits()).toBe(false);
    expect(previewMaySearchRocketReach(false)).toBe(true);
    expect(previewMaySearchRocketReach(true)).toBe(false);
    expect(rocketReachClickCostEstimate(5).detail).toMatch(/Search is free/);
  });

  it("never estimates more than the import cap", () => {
    expect(rocketReachClickCostEstimate(100).maxCredits).toBe(10);
    expect(rocketReachClickCostEstimate(Number.NaN).maxCredits).toBe(10);
  });
});
