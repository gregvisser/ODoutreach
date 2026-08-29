import { describe, expect, it } from "vitest";

import {
  AI_MODELS,
  computeCostMicroUsd,
  formatMicroUsd,
  getModelRate,
  RATE_VERSION,
} from "./model-catalog";

describe("model catalog", () => {
  it("holds a rate for every model the app is allowed to call", () => {
    // A model with no rate cannot be billed, so the two lists must not drift
    // apart. This is the check that fails when someone adds a model and
    // forgets the price.
    for (const model of Object.values(AI_MODELS)) {
      expect(getModelRate(model), `no rate for ${model}`).not.toBeNull();
    }
  });

  it("refuses a model it holds no price for", () => {
    expect(getModelRate("claude-some-unpriced-model")).toBeNull();
  });

  it("names a rate version, so a price change cannot rewrite old invoices", () => {
    expect(RATE_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}/);
  });
});

describe("computeCostMicroUsd", () => {
  const rate = { inputPerMTokMicroUsd: 1_000_000, outputPerMTokMicroUsd: 5_000_000 };

  it("charges input and output at their different rates", () => {
    // 1M in at $1 = $1.00; 1M out at $5 = $5.00; total $6.00 = 6_000_000 micro.
    expect(computeCostMicroUsd({ inputTokens: 1_000_000, outputTokens: 1_000_000 }, rate)).toBe(
      6_000_000,
    );
  });

  it("prices a realistic single classification call", () => {
    // ~700 tokens in, ~40 out — the shape of one reply classification.
    // 700 * 1 + 40 * 5 = 900 micro-USD = $0.0009.
    expect(computeCostMicroUsd({ inputTokens: 700, outputTokens: 40 }, rate)).toBe(900);
  });

  it("is zero for a call that produced no tokens", () => {
    expect(computeCostMicroUsd({ inputTokens: 0, outputTokens: 0 }, rate)).toBe(0);
  });

  it("returns whole micro-USD, never a fraction", () => {
    // 1 input token at $1/MTok is one millionth of a dollar — the smallest unit
    // we store. Anything here that is not an integer would accumulate drift
    // across a month of summing and break invoice reconciliation.
    const cost = computeCostMicroUsd({ inputTokens: 7, outputTokens: 3 }, rate);
    expect(Number.isInteger(cost)).toBe(true);
  });

  it("rounds half-up, so thousands of small calls do not under-bill", () => {
    // 1 output token at a rate of 500_000 micro/MTok is 0.5 micro-USD.
    // Rounding down would bill zero for every one of these.
    const halfRate = { inputPerMTokMicroUsd: 0, outputPerMTokMicroUsd: 500_000 };
    expect(computeCostMicroUsd({ inputTokens: 0, outputTokens: 1 }, halfRate)).toBe(1);
  });
});

describe("formatMicroUsd", () => {
  it("shows a sub-cent call as a real number rather than $0.00", () => {
    // A spend page that renders every classification as $0.00 looks broken and
    // trains staff to distrust the meter.
    expect(formatMicroUsd(900)).toBe("$0.000900");
  });

  it("shows an ordinary total in dollars and cents", () => {
    expect(formatMicroUsd(12_340_000)).toBe("$12.34");
  });

  it("shows exact zero as $0.00", () => {
    expect(formatMicroUsd(0)).toBe("$0.00");
  });
});
