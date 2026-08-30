/**
 * Colour-vision maths for the chart-palette gate.
 *
 * `oklch.ts` answers "is this pair readable" (WCAG contrast). This file
 * answers a different question: "are these two chart series still tellable
 * apart" — for a full-colour reader, and for a reader with red-green or
 * blue-yellow colour-blindness. Neither question can be answered from the
 * `L` component of an `oklch()` token alone, so both convert all the way to
 * the linear-light sRGB a screen actually paints (via `oklchToLinearRgb`,
 * which already clips to gamut) before measuring anything.
 *
 * The method — OKLab Euclidean distance under Machado, Oliveira & Fernandes
 * (2009) colour-blindness simulation at severity 1.0 — is the one documented
 * by this project's `dataviz` skill (`references/color-formula.md`), not
 * invented here. The thresholds it defines (target 8.0, floor 6.0 for CVD
 * separation; 15.0 for the normal-vision floor) live with the callers that
 * apply them, not in this file — this file only computes the number.
 */

import type { LinearRgb } from "@/lib/design/oklch";

/** A colour in OKLab space: `L` perceptual lightness, `a`/`b` opponent axes. */
export type Oklab = {
  readonly L: number;
  readonly a: number;
  readonly b: number;
};

/**
 * Forward OKLab transform from linear-light sRGB.
 *
 * The inverse of `oklchToLinearRgb`'s OKLab-to-linear-RGB half — cube-root
 * LMS, then the OKLab mixing matrix. Takes linear (not gamma-encoded) RGB,
 * matching what `oklchToLinearRgb` returns.
 */
export function linearRgbToOklab(colour: LinearRgb): Oklab {
  const l = Math.cbrt(
    0.4122214708 * colour.r + 0.5363325363 * colour.g + 0.0514459929 * colour.b,
  );
  const m = Math.cbrt(
    0.2119034982 * colour.r + 0.6806995451 * colour.g + 0.1073969566 * colour.b,
  );
  const s = Math.cbrt(
    0.0883024619 * colour.r + 0.2817188376 * colour.g + 0.6299787005 * colour.b,
  );

  return {
    L: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  };
}

/** Euclidean distance between two OKLab colours, ×100 — this skill's ΔE convention. */
export function oklabDeltaE(first: Oklab, second: Oklab): number {
  return (
    100 *
    Math.hypot(first.L - second.L, first.a - second.a, first.b - second.b)
  );
}

export type ColorBlindnessKind = "protan" | "deutan" | "tritan";

/**
 * Machado, Oliveira & Fernandes (2009) colour-blindness simulation
 * matrices at severity 1.0, applied in linear-light sRGB.
 *
 * The CVD thresholds this project asserts against are calibrated to this
 * specific simulation model — swapping in a different one (e.g. Viénot 1999)
 * would move borderline pairs and require re-deriving the thresholds, so the
 * model is fixed here rather than made pluggable.
 */
const MACHADO_2009: Record<ColorBlindnessKind, readonly (readonly number[])[]> = {
  protan: [
    [0.152286, 1.052583, -0.204868],
    [0.114503, 0.786281, 0.099216],
    [-0.003882, -0.048116, 1.051998],
  ],
  deutan: [
    [0.367322, 0.860646, -0.227968],
    [0.280085, 0.672501, 0.047413],
    [-0.01182, 0.04294, 0.968881],
  ],
  tritan: [
    [1.255528, -0.076749, -0.178779],
    [-0.078411, 0.930809, 0.147602],
    [0.004733, 0.691367, 0.3039],
  ],
};

function clamp01(value: number): number {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

/**
 * Simulate how `colour` would appear to a viewer with the given colour
 * vision deficiency, at full severity.
 *
 * Clamped to [0,1] per channel after the matrix multiply — the same clamp a
 * browser applies, so the result matches what a simulated screenshot (or a
 * browser's own CVD emulation) would actually show.
 */
export function simulateColorBlindness(
  colour: LinearRgb,
  kind: ColorBlindnessKind,
): LinearRgb {
  const matrix = MACHADO_2009[kind];
  return {
    r: clamp01(
      matrix[0][0] * colour.r + matrix[0][1] * colour.g + matrix[0][2] * colour.b,
    ),
    g: clamp01(
      matrix[1][0] * colour.r + matrix[1][1] * colour.g + matrix[1][2] * colour.b,
    ),
    b: clamp01(
      matrix[2][0] * colour.r + matrix[2][1] * colour.g + matrix[2][2] * colour.b,
    ),
  };
}
