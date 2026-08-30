import { describe, expect, it } from "vitest";

import { oklchToLinearRgb, parseOklch } from "@/lib/design/oklch";
import {
  linearRgbToOklab,
  oklabDeltaE,
  simulateColorBlindness,
} from "@/lib/design/color-vision";

describe("linearRgbToOklab", () => {
  it("maps a neutral grey to near-zero a/b (no hue)", () => {
    const grey = linearRgbToOklab({ r: 0.5, g: 0.5, b: 0.5 });
    expect(Math.abs(grey.a)).toBeLessThan(1e-6);
    expect(Math.abs(grey.b)).toBeLessThan(1e-6);
  });

  it("maps black to L=0 and white to L=1", () => {
    expect(linearRgbToOklab({ r: 0, g: 0, b: 0 }).L).toBeCloseTo(0, 5);
    expect(linearRgbToOklab({ r: 1, g: 1, b: 1 }).L).toBeCloseTo(1, 5);
  });
});

describe("oklabDeltaE", () => {
  it("is zero for identical colours", () => {
    const lab = linearRgbToOklab({ r: 0.3, g: 0.5, b: 0.7 });
    expect(oklabDeltaE(lab, lab)).toBe(0);
  });

  it("is symmetric", () => {
    const a = linearRgbToOklab({ r: 0.8, g: 0.2, b: 0.1 });
    const b = linearRgbToOklab({ r: 0.1, g: 0.6, b: 0.9 });
    expect(oklabDeltaE(a, b)).toBeCloseTo(oklabDeltaE(b, a), 10);
  });

  it("scales as expected between a known-distant and known-close pair", () => {
    const red = linearRgbToOklab(oklchToLinearRgb(parseOklch("oklch(0.55 0.22 27)")!));
    const orange = linearRgbToOklab(oklchToLinearRgb(parseOklch("oklch(0.6 0.2 45)")!));
    const blue = linearRgbToOklab(oklchToLinearRgb(parseOklch("oklch(0.55 0.2 250)")!));
    // red and orange are 18deg apart in hue; red and blue are ~137deg apart.
    // The nearer hue must measure a smaller OKLab distance than the far one.
    expect(oklabDeltaE(red, orange)).toBeLessThan(oklabDeltaE(red, blue));
  });
});

describe("simulateColorBlindness", () => {
  it("clamps every channel to [0,1]", () => {
    for (const kind of ["protan", "deutan", "tritan"] as const) {
      const result = simulateColorBlindness({ r: 1, g: 0, b: 1 }, kind);
      for (const channel of [result.r, result.g, result.b]) {
        expect(channel).toBeGreaterThanOrEqual(0);
        expect(channel).toBeLessThanOrEqual(1);
      }
    }
  });

  it("leaves true achromatic grey unchanged (no hue for CVD to remove)", () => {
    const grey = { r: 0.5, g: 0.5, b: 0.5 };
    for (const kind of ["protan", "deutan", "tritan"] as const) {
      const result = simulateColorBlindness(grey, kind);
      expect(result.r).toBeCloseTo(grey.r, 2);
      expect(result.g).toBeCloseTo(grey.g, 2);
      expect(result.b).toBeCloseTo(grey.b, 2);
    }
  });

  it("collapses a red/green pair's distance far more under protan than tritan simulation", () => {
    // Protanopia is a red-green deficiency: it should compress the OKLab
    // distance between a saturated red and a saturated green much more
    // aggressively than tritanopia (a blue-yellow deficiency) does.
    const red = oklchToLinearRgb(parseOklch("oklch(0.55 0.22 27)")!);
    const green = oklchToLinearRgb(parseOklch("oklch(0.55 0.15 145)")!);

    const normalDelta = oklabDeltaE(linearRgbToOklab(red), linearRgbToOklab(green));
    const protanDelta = oklabDeltaE(
      linearRgbToOklab(simulateColorBlindness(red, "protan")),
      linearRgbToOklab(simulateColorBlindness(green, "protan")),
    );
    const tritanDelta = oklabDeltaE(
      linearRgbToOklab(simulateColorBlindness(red, "tritan")),
      linearRgbToOklab(simulateColorBlindness(green, "tritan")),
    );

    expect(protanDelta).toBeLessThan(normalDelta);
    expect(protanDelta).toBeLessThan(tritanDelta);
  });
});
