import { describe, expect, it } from "vitest";

import {
  contrastRatio,
  contrastRatioBetweenOklch,
  oklchToLinearRgb,
  parseOklch,
  relativeLuminance,
} from "@/lib/design/oklch";

const WHITE = "oklch(1 0 0)";
const BLACK = "oklch(0 0 0)";
/** The sRGB primary #ff0000, expressed in OKLCH. */
const SRGB_RED = "oklch(0.628 0.2577 29.23)";

describe("parseOklch", () => {
  it("reads the three components", () => {
    expect(parseOklch("oklch(0.52 0.084 162)")).toEqual({
      l: 0.52,
      c: 0.084,
      h: 162,
    });
  });

  it("tolerates surrounding whitespace", () => {
    expect(parseOklch("  oklch(0.24 0.014 165)  ")).toEqual({
      l: 0.24,
      c: 0.014,
      h: 165,
    });
  });

  it.each([
    ["a hex colour", "#6aa086"],
    ["an rgb colour", "rgb(106 160 134)"],
    ["a percentage lightness", "oklch(52% 0.084 162)"],
    ["an alpha channel", "oklch(0.52 0.084 162 / 50%)"],
    ["a var() reference", "var(--primary)"],
    ["lightness above 1", "oklch(1.4 0.084 162)"],
    ["empty", ""],
  ])("returns null for %s", (_label, value) => {
    expect(parseOklch(value)).toBeNull();
  });
});

describe("relativeLuminance", () => {
  it("puts white at 1 and black at 0", () => {
    const white = oklchToLinearRgb(parseOklch(WHITE)!);
    const black = oklchToLinearRgb(parseOklch(BLACK)!);
    expect(relativeLuminance(white)).toBeCloseTo(1, 6);
    expect(relativeLuminance(black)).toBeCloseTo(0, 6);
  });

  it("recovers the WCAG red coefficient for the sRGB red primary", () => {
    // Independent check on the whole OKLab -> sRGB chain: by definition of the
    // WCAG formula, pure #ff0000 has a relative luminance of exactly 0.2126.
    // If the conversion matrices or the gamut clip were wrong, this would not
    // land on the coefficient.
    const red = oklchToLinearRgb(parseOklch(SRGB_RED)!);
    expect(relativeLuminance(red)).toBeCloseTo(0.2126, 4);
  });
});

describe("contrastRatio", () => {
  it("is 21:1 for black on white", () => {
    expect(contrastRatioBetweenOklch(BLACK, WHITE)).toBeCloseTo(21, 6);
  });

  it("is 1:1 for a colour against itself", () => {
    expect(
      contrastRatioBetweenOklch("oklch(0.52 0.084 162)", "oklch(0.52 0.084 162)"),
    ).toBeCloseTo(1, 6);
  });

  it("is 4:1 for the sRGB red primary on white", () => {
    expect(contrastRatioBetweenOklch(SRGB_RED, WHITE)).toBeCloseTo(4.0, 2);
  });

  it("does not depend on the order of the two colours", () => {
    const forwards = contrastRatioBetweenOklch(BLACK, SRGB_RED);
    const backwards = contrastRatioBetweenOklch(SRGB_RED, BLACK);
    expect(forwards).toBeCloseTo(backwards, 12);
  });

  it("never reports below 1:1", () => {
    const a = oklchToLinearRgb(parseOklch("oklch(0.17 0.012 165)")!);
    const b = oklchToLinearRgb(parseOklch("oklch(0.93 0.006 165)")!);
    expect(contrastRatio(a, a)).toBeGreaterThanOrEqual(1);
    expect(contrastRatio(a, b)).toBeGreaterThanOrEqual(1);
  });

  it("does not read OKLCH lightness as luminance", () => {
    // The trap this module exists to avoid. Two colours with identical `L`
    // differ in WCAG luminance once chroma and hue are applied, so a gate that
    // compared `L` values would wave through a failing pair.
    const grey = oklchToLinearRgb(parseOklch("oklch(0.628 0 0)")!);
    const red = oklchToLinearRgb(parseOklch(SRGB_RED)!);
    expect(relativeLuminance(red)).not.toBeCloseTo(relativeLuminance(grey), 2);
  });
});

describe("contrastRatioBetweenOklch", () => {
  it.each([
    ["the foreground", "#ffffff", WHITE],
    ["the background", WHITE, "var(--background)"],
  ])("throws, naming the value, when %s is unparseable", (_label, fg, bg) => {
    // A build gate must fail loudly on a token it cannot read. Silently
    // skipping it is the "wired up but never fires" defect in miniature.
    expect(() => contrastRatioBetweenOklch(fg, bg)).toThrow(
      /Not a supported oklch\(\) colour/,
    );
  });
});
