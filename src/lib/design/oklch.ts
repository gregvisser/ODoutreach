/**
 * Colour maths for the design-system gate.
 *
 * The whole ODoutreach palette is authored in `oklch()` in `globals.css`.
 * OKLCH's `L` is *perceptual* lightness, which is NOT the same quantity as
 * WCAG's relative luminance — two colours with identical `L` can have very
 * different WCAG contrast. So a contrast check cannot read `L` off the token;
 * it has to convert all the way to sRGB and apply the WCAG formula.
 *
 * The chain, in order:
 *   oklch  ->  OKLab  ->  LMS  ->  linear sRGB  ->  gamma-encoded sRGB
 *          ->  clipped to the sRGB gamut  ->  back to linear
 *          ->  relative luminance  ->  contrast ratio
 *
 * The clip matters and is easy to skip. Several brand-green tokens sit
 * slightly outside sRGB, so the un-clipped linear values run past 1.0. What a
 * browser actually paints is the clipped colour, so measuring the un-clipped
 * one would report a contrast nobody can see. We clip in gamma space (which is
 * what a naive browser clamp does) and decode back before measuring.
 *
 * Pure functions, no I/O — the gate in `design-system.test.ts` supplies the
 * strings it has read out of the stylesheet.
 */

/** A colour as linear-light sRGB components, each already clipped to [0, 1]. */
export type LinearRgb = {
  readonly r: number;
  readonly g: number;
  readonly b: number;
};

/** `oklch(L C H)` with L in [0,1], C >= 0 and H in degrees. */
export type Oklch = {
  readonly l: number;
  readonly c: number;
  readonly h: number;
};

const OKLCH_PATTERN =
  /^oklch\(\s*([0-9]*\.?[0-9]+)\s+([0-9]*\.?[0-9]+)\s+([0-9]*\.?[0-9]+)\s*\)$/i;

/**
 * Parse an `oklch(L C H)` string.
 *
 * Deliberately strict: no percentages, no alpha, no `none`. The stylesheet is
 * authored in exactly one format, and a parser that quietly accepts more is a
 * parser that quietly returns the wrong colour when the format drifts.
 * Returns `null` rather than throwing so a caller can report *which* token is
 * malformed instead of dying on the first one.
 */
export function parseOklch(value: string): Oklch | null {
  const match = OKLCH_PATTERN.exec(value.trim());
  if (!match) return null;

  const l = Number(match[1]);
  const c = Number(match[2]);
  const h = Number(match[3]);
  if (!Number.isFinite(l) || !Number.isFinite(c) || !Number.isFinite(h)) {
    return null;
  }
  if (l < 0 || l > 1 || c < 0) return null;

  return { l, c, h };
}

/** Gamma-encode one linear-light channel (the sRGB transfer function). */
function encodeSrgbChannel(linear: number): number {
  return linear <= 0.0031308
    ? 12.92 * linear
    : 1.055 * Math.pow(Math.max(linear, 0), 1 / 2.4) - 0.055;
}

/** Decode one gamma-encoded channel back to linear light. */
function decodeSrgbChannel(encoded: number): number {
  return encoded <= 0.04045
    ? encoded / 12.92
    : Math.pow((encoded + 0.055) / 1.055, 2.4);
}

function clamp01(value: number): number {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

/**
 * Convert OKLCH to the linear sRGB a screen will actually paint.
 *
 * Out-of-gamut colours are clipped per channel in gamma space. That is not a
 * perceptual gamut *mapping* (which would preserve hue better), but it matches
 * the simple clamp browsers apply, and for a contrast check we want the number
 * the user's screen produces, not the prettiest reduction.
 */
export function oklchToLinearRgb(colour: Oklch): LinearRgb {
  const hueRadians = (colour.h * Math.PI) / 180;
  const a = colour.c * Math.cos(hueRadians);
  const b = colour.c * Math.sin(hueRadians);

  const lRoot = colour.l + 0.3963377774 * a + 0.2158037573 * b;
  const mRoot = colour.l - 0.1055613458 * a - 0.0638541728 * b;
  const sRoot = colour.l - 0.0894841775 * a - 1.291485548 * b;

  const long = lRoot * lRoot * lRoot;
  const medium = mRoot * mRoot * mRoot;
  const short = sRoot * sRoot * sRoot;

  const linear = [
    4.0767416621 * long - 3.3077115913 * medium + 0.2309699292 * short,
    -1.2684380046 * long + 2.6097574011 * medium - 0.3413193965 * short,
    -0.0041960863 * long - 0.7034186147 * medium + 1.707614701 * short,
  ].map((channel) => decodeSrgbChannel(clamp01(encodeSrgbChannel(channel))));

  return { r: linear[0], g: linear[1], b: linear[2] };
}

/** WCAG 2.x relative luminance of a linear-light sRGB colour. */
export function relativeLuminance(colour: LinearRgb): number {
  return 0.2126 * colour.r + 0.7152 * colour.g + 0.0722 * colour.b;
}

/**
 * WCAG 2.x contrast ratio between two colours, in the range [1, 21].
 *
 * Order-independent by definition — the formula sorts the two luminances, so
 * `contrastRatio(a, b) === contrastRatio(b, a)`.
 */
export function contrastRatio(first: LinearRgb, second: LinearRgb): number {
  const a = relativeLuminance(first);
  const b = relativeLuminance(second);
  const lighter = Math.max(a, b);
  const darker = Math.min(a, b);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Contrast ratio between two `oklch()` strings.
 *
 * Throws on an unparseable input: this runs inside a build gate, where a
 * silently-skipped token is precisely the "wired up but never fires" failure
 * the gate exists to prevent. The message names the offending value.
 */
export function contrastRatioBetweenOklch(
  foreground: string,
  background: string,
): number {
  const fg = parseOklch(foreground);
  if (!fg) throw new Error(`Not a supported oklch() colour: "${foreground}"`);
  const bg = parseOklch(background);
  if (!bg) throw new Error(`Not a supported oklch() colour: "${background}"`);

  return contrastRatio(oklchToLinearRgb(fg), oklchToLinearRgb(bg));
}
