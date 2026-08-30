/**
 * The chart-palette gate.
 *
 * `chart-series-contrast` (`.bidlow/DESIGN.json` `open_defects`, found
 * 2026-08-26) was two things at once: `--chart-3` and `--chart-4` failed
 * WCAG 1.4.11 (2.51:1 and 2.39:1 against a card in light mode, against a
 * required 3:1), and `--chart-1`/`--chart-4` shared a hue, so the naive fix
 * — darken `--chart-4` — would have made them indistinguishable instead.
 * `design-system.test.ts` already asserts contrast (once the chart tokens
 * are added to `contrast_pairs`); this file asserts the thing that test
 * cannot: that every pair of chart series stays tellable apart, including
 * under simulated colour blindness. Without it, a future token edit could
 * fix contrast and reintroduce the distinguishability failure with nothing
 * to catch it.
 *
 * Method is the project's `dataviz` skill (`references/color-formula.md`):
 * OKLab ΔE ×100 between slots, measured on the CLIPPED linear-sRGB a screen
 * actually paints (via `oklchToLinearRgb`), under Machado-Oliveira-Fernandes
 * 2009 simulation. Thresholds: CVD separation target 8.0 (protan/deutan,
 * all-pairs — every chart token can end up on screen with every other, not
 * just neighbours, so this project holds itself to the stricter "scatter/
 * small-multiples" pairlist rather than the default "adjacent" one); normal-
 * vision floor 15.0 (hard gate per the skill). Tritanopia is reported by the
 * skill's own validator but not gated (tritanopia is far rarer, ~0.01% of
 * the population, than protan/deutan at ~8% of males) — this project's
 * palette was tuned to also clear the CVD floor (6.0) under tritan, so it is
 * asserted here too, at that floor, as a regression guard.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  contrastRatioBetweenOklch,
  oklchToLinearRgb,
  parseOklch,
} from "@/lib/design/oklch";
import {
  linearRgbToOklab,
  oklabDeltaE,
  simulateColorBlindness,
} from "@/lib/design/color-vision";

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
);
const GLOBALS_CSS_PATH = path.join(REPO_ROOT, "src", "app", "globals.css");
const globalsCss = readFileSync(GLOBALS_CSS_PATH, "utf8");

/** Same literal block-reader as design-system.test.ts — see that file for why. */
function readTokenBlock(selector: string): Record<string, string> {
  const start = globalsCss.indexOf(`${selector} {`);
  if (start === -1) throw new Error(`No "${selector}" block in globals.css`);
  const end = globalsCss.indexOf("\n}", start);
  if (end === -1) throw new Error(`Unterminated "${selector}" block in globals.css`);
  const block = globalsCss.slice(start, end);
  const tokens: Record<string, string> = {};
  for (const match of block.matchAll(/(--[a-z0-9-]+):\s*([^;]+);/g)) {
    tokens[match[1]] = match[2].trim();
  }
  return tokens;
}

function chartTokenNames(tokens: Record<string, string>): string[] {
  return Object.keys(tokens)
    .filter((name) => /^--chart-\d+$/.test(name))
    .sort((a, b) => Number(a.split("-")[2]) - Number(b.split("-")[2]));
}

const THEMES = [
  { name: "light", selector: ":root" as const, card: "--card" },
  { name: "dark", selector: ".dark" as const, card: "--card" },
];

const CVD_TARGET = 8.0;
const CVD_FLOOR = 6.0; // also used as the tritan regression-guard floor
const NORMAL_FLOOR = 15.0;
const CONTRAST_MIN = 3.0;

/**
 * The number of simultaneously-distinguishable chart series this palette is
 * proven to support (`docs/ops/CHART-SERIES-CONTRAST-2026-08-30.md`). An
 * exhaustive search could not find a 5th hue, anchored on the brand green
 * (`--chart-1` at hue 162, matching `--primary`), that clears the all-pairs
 * normal-vision floor — best found was 14.2Δ against a required 15. If this
 * assertion ever fails because a token was added or removed, that is the
 * signal to re-run the search in the artefact above and update both this
 * constant and the artefact, not to silently let the count drift.
 */
const PROVEN_SAFE_CHART_TOKEN_COUNT = 4;

type Analyzed = {
  name: string;
  lrgb: ReturnType<typeof oklchToLinearRgb>;
  normal: ReturnType<typeof linearRgbToOklab>;
  protan: ReturnType<typeof linearRgbToOklab>;
  deutan: ReturnType<typeof linearRgbToOklab>;
  tritan: ReturnType<typeof linearRgbToOklab>;
};

function analyze(name: string, oklchValue: string): Analyzed {
  const parsed = parseOklch(oklchValue);
  if (!parsed) throw new Error(`${name} = ${oklchValue} is not a parseable oklch() colour`);
  const lrgb = oklchToLinearRgb(parsed);
  return {
    name,
    lrgb,
    normal: linearRgbToOklab(lrgb),
    protan: linearRgbToOklab(simulateColorBlindness(lrgb, "protan")),
    deutan: linearRgbToOklab(simulateColorBlindness(lrgb, "deutan")),
    tritan: linearRgbToOklab(simulateColorBlindness(lrgb, "tritan")),
  };
}

function allPairs<T>(items: readonly T[]): [T, T][] {
  const pairs: [T, T][] = [];
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      pairs.push([items[i], items[j]]);
    }
  }
  return pairs;
}

describe.each(THEMES)("$name chart palette", (theme) => {
  const shipped = readTokenBlock(theme.selector);
  const names = chartTokenNames(shipped);
  const analyzed = names.map((name) => analyze(name, shipped[name]));

  it("declares chart tokens to analyse", () => {
    // Guards every assertion below against passing vacuously because the
    // block-reader regex stopped matching.
    expect(analyzed.length).toBeGreaterThanOrEqual(2);
  });

  it(`ships exactly the proven-safe chart token count (${PROVEN_SAFE_CHART_TOKEN_COUNT})`, () => {
    expect(analyzed.length).toBe(PROVEN_SAFE_CHART_TOKEN_COUNT);
  });

  it.each(names)("%s is at least 3:1 against --card (WCAG 1.4.11)", (name) => {
    const ratio = contrastRatioBetweenOklch(shipped[name], shipped[theme.card]);
    expect(Number(ratio.toFixed(2)), name).toBeGreaterThanOrEqual(CONTRAST_MIN);
  });

  it("every pair of chart series clears the CVD separation target under protan/deutan simulation (all-pairs)", () => {
    for (const [a, b] of allPairs(analyzed)) {
      for (const kind of ["protan", "deutan"] as const) {
        const delta = oklabDeltaE(a[kind], b[kind]);
        expect(
          delta,
          `${a.name} vs ${b.name} under simulated ${kind}: ΔE ${delta.toFixed(1)}, need >= ${CVD_TARGET}`,
        ).toBeGreaterThanOrEqual(CVD_TARGET);
      }
    }
  });

  it("every pair of chart series clears the normal-vision floor (all-pairs, hard gate)", () => {
    for (const [a, b] of allPairs(analyzed)) {
      const delta = oklabDeltaE(a.normal, b.normal);
      expect(
        delta,
        `${a.name} vs ${b.name} unsimulated: ΔE ${delta.toFixed(1)}, need >= ${NORMAL_FLOOR}`,
      ).toBeGreaterThanOrEqual(NORMAL_FLOOR);
    }
  });

  it("every pair of chart series clears the CVD floor under tritan simulation (all-pairs, regression guard)", () => {
    for (const [a, b] of allPairs(analyzed)) {
      const delta = oklabDeltaE(a.tritan, b.tritan);
      expect(
        delta,
        `${a.name} vs ${b.name} under simulated tritan: ΔE ${delta.toFixed(1)}, need >= ${CVD_FLOOR}`,
      ).toBeGreaterThanOrEqual(CVD_FLOOR);
    }
  });

  it("no chart token's hue reads as the destructive/error colour", () => {
    // Status colour is reserved (DESIGN.json anti-goals / dataviz skill "Status
    // is fixed") — a categorical chart series must not sit close enough in hue
    // to --destructive that it could be mistaken for an error state.
    const destructive = parseOklch(shipped["--destructive"]);
    expect(destructive).not.toBeNull();
    const DESTRUCTIVE_HUE_BUFFER = 25;

    for (const name of names) {
      const chart = parseOklch(shipped[name]);
      expect(chart, name).not.toBeNull();
      if (!chart || !destructive) continue;
      // near-grey chart tokens have no visible hue to collide with
      if (chart.c < 0.02) continue;
      const raw = Math.abs(chart.h - destructive.h) % 360;
      const angularGap = Math.min(raw, 360 - raw);
      expect(
        angularGap,
        `${name} (hue ${chart.h}) is within ${DESTRUCTIVE_HUE_BUFFER}deg of --destructive (hue ${destructive.h})`,
      ).toBeGreaterThanOrEqual(DESTRUCTIVE_HUE_BUFFER);
    }
  });
});
