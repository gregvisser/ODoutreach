/**
 * The design-system gate.
 *
 * `.bidlow/DESIGN.json` is the design direction of record. A direction nobody
 * reads and nothing enforces is this project's single worst defect class —
 * eight instances this week of something built, wired, reporting success and
 * never firing — and a design document is an unusually easy ninth.
 *
 * So this file makes the artefact load-bearing. It reads DESIGN.json and the
 * real stylesheet and asserts they agree, that every contrast pair the artefact
 * commits to actually holds at WCAG 2.2 AA, and that the machine-checkable
 * anti-goals are true of the shipped code.
 *
 * When this fails, the fix is usually to change the CSS. If the design has
 * genuinely moved on, change DESIGN.json in the same commit and say why in
 * `decisions_taken_this_cycle` — that record is the point of the artefact.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";
import { z } from "zod";

import { contrastRatioBetweenOklch, parseOklch } from "@/lib/design/oklch";

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
);

const DESIGN_JSON_PATH = path.join(REPO_ROOT, ".bidlow", "DESIGN.json");
const GLOBALS_CSS_PATH = path.join(REPO_ROOT, "src", "app", "globals.css");

/**
 * Validated at the boundary rather than cast. A malformed artefact must fail
 * loudly here; a gate that shrugs at a file it cannot read is not a gate.
 */
const designSchema = z.object({
  tokens: z.object({
    colour: z.object({
      light: z.record(z.string(), z.string()),
      dark: z.record(z.string(), z.string()),
      hue_policy: z.object({ forbidden_hues: z.string() }),
    }),
  }),
  contrast_pairs: z
    .array(
      z.object({
        foreground: z.string(),
        background: z.string(),
        role: z.enum(["text", "ui_component"]),
        min_ratio: z.number(),
      }),
    )
    .min(1),
  accessibility: z.object({
    standard: z.string(),
    commitments: z
      .array(z.object({ sc: z.string(), level: z.string() }))
      .min(1),
  }),
});

const design = designSchema.parse(
  JSON.parse(readFileSync(DESIGN_JSON_PATH, "utf8")),
);

const globalsCss = readFileSync(GLOBALS_CSS_PATH, "utf8");

/**
 * Pull the custom properties out of one selector block in globals.css.
 *
 * Deliberately literal rather than a real CSS parse: the two blocks we care
 * about are hand-authored, flat, and adjacent at the top of the file. Adding a
 * CSS parser dependency to read two blocks would fail the tooling test in
 * CLAUDE.md (stdlib before a dependency).
 */
function readTokenBlock(selector: string): Record<string, string> {
  const start = globalsCss.indexOf(`${selector} {`);
  if (start === -1) {
    throw new Error(`No "${selector}" block in globals.css`);
  }
  const end = globalsCss.indexOf("\n}", start);
  if (end === -1) {
    throw new Error(`Unterminated "${selector}" block in globals.css`);
  }

  const block = globalsCss.slice(start, end);
  const tokens: Record<string, string> = {};
  for (const match of block.matchAll(/(--[a-z0-9-]+):\s*([^;]+);/g)) {
    tokens[match[1]] = match[2].trim();
  }
  return tokens;
}

/** Only the colour tokens — `--radius` is a length and is not a contrast concern. */
function colourTokensOnly(
  tokens: Record<string, string>,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(tokens).filter(([, value]) => value.startsWith("oklch(")),
  );
}

const THEMES = [
  { name: "light", selector: ":root", declared: design.tokens.colour.light },
  { name: "dark", selector: ".dark", declared: design.tokens.colour.dark },
] as const;

describe("DESIGN.json is the design direction of record", () => {
  it("commits to WCAG 2.2 Level AA, not a superseded version", () => {
    expect(design.accessibility.standard).toBe("WCAG 2.2 Level AA");
  });

  it("names the success criteria that are new in WCAG 2.2", () => {
    // These four are the AA criteria WCAG 2.2 added. Quoting "2.2" while only
    // covering the 2.1 criteria would be a claim the artefact does not meet.
    const named = new Set(design.accessibility.commitments.map((c) => c.sc));
    for (const sc of ["2.4.11", "2.5.7", "2.5.8", "3.3.8"]) {
      expect(named).toContain(sc);
    }
  });
});

describe.each(THEMES)("$name theme tokens match globals.css", (theme) => {
  const actual = colourTokensOnly(readTokenBlock(theme.selector));

  it("declares every colour token the stylesheet defines", () => {
    // Drift in this direction means somebody added a token without recording
    // it — so it has no contrast commitment and no design rationale.
    expect(Object.keys(actual).sort()).toEqual(
      Object.keys(theme.declared).sort(),
    );
  });

  it("declares each one with the value the stylesheet actually ships", () => {
    expect(actual).toEqual(theme.declared);
  });

  it("declares only parseable oklch colours", () => {
    for (const [token, value] of Object.entries(theme.declared)) {
      expect(parseOklch(value), `${token} = ${value}`).not.toBeNull();
    }
  });
});

describe.each(THEMES)("$name theme meets WCAG 2.2 AA contrast", (theme) => {
  // Measured against the STYLESHEET, not against DESIGN.json. Reading the
  // declared values here would assert the artefact against itself and pass
  // even while the shipped CSS failed — the parity block above would still
  // catch it today, but a gate that is only correct because a different gate
  // exists is one refactor away from going quiet.
  const shipped = colourTokensOnly(readTokenBlock(theme.selector));

  it.each(design.contrast_pairs)(
    "$foreground on $background is at least $min_ratio:1 ($role)",
    (pair) => {
      const foreground = shipped[pair.foreground];
      const background = shipped[pair.background];

      // A pair naming a token that does not exist would otherwise pass
      // vacuously — the quiet failure this whole gate exists to prevent.
      expect(foreground, `${pair.foreground} is not a declared token`).toBeDefined();
      expect(background, `${pair.background} is not a declared token`).toBeDefined();

      const ratio = contrastRatioBetweenOklch(foreground, background);
      expect(
        Number(ratio.toFixed(2)),
        `${pair.foreground} on ${pair.background} in ${theme.name}`,
      ).toBeGreaterThanOrEqual(pair.min_ratio);
    },
  );
});

describe("the machine-checkable anti-goals hold", () => {
  // Read from the STYLESHEET for the same reason the contrast block does.
  // Written first against DESIGN.json, this block could not fail on a violet
  // in the shipped CSS at all — only on a violet in the document describing
  // it. Deliberately painting --primary violet and watching only the parity
  // test go red is what exposed it.
  it.each(THEMES)("uses no violet or indigo hue in the $name theme", (theme) => {
    const shipped = colourTokensOnly(readTokenBlock(theme.selector));
    expect(Object.keys(shipped).length).toBeGreaterThan(0);

    for (const [token, value] of Object.entries(shipped)) {
      const colour = parseOklch(value);
      expect(colour, `${token} = ${value}`).not.toBeNull();
      if (!colour || colour.c < 0.02) continue; // near-grey: hue is not visible
      const inViolet = colour.h >= 260 && colour.h <= 320;
      expect(inViolet, `${token} = ${value} is a violet/indigo hue`).toBe(false);
    }
  });

  it("never puts pure black on pure white", () => {
    const shipped = colourTokensOnly(readTokenBlock(":root"));
    expect(shipped["--foreground"]).not.toBe("oklch(0 0 0)");
    expect(shipped["--background"]).not.toBe("oklch(1 0 0)");

    // The canvas carries a trace of hue rather than being a flat white — the
    // cheapest single thing that stops the palette reading as a template.
    const background = parseOklch(shipped["--background"]);
    expect(background).not.toBeNull();
    expect(background!.c).toBeGreaterThan(0);
  });

  it("records the forbidden hue band it is enforcing", () => {
    expect(design.tokens.colour.hue_policy.forbidden_hues).toMatch(/260/);
    expect(design.tokens.colour.hue_policy.forbidden_hues).toMatch(/320/);
  });
});

describe("WCAG 2.2 SC 2.5.8 Target Size (Minimum)", () => {
  /**
   * Tailwind sizes are quarter-rem steps, so `h-6` is 24px — exactly the 2.5.8
   * floor. Anything below `6` ships a control smaller than the criterion allows.
   */
  const MINIMUM_STEP = 6;

  const buttonSource = readFileSync(
    path.join(REPO_ROOT, "src", "components", "ui", "button.tsx"),
    "utf8",
  );

  /** The `size:` variant object, which is where every button dimension lives. */
  function readSizeVariantBlock(): string {
    const start = buttonSource.indexOf("size: {");
    if (start === -1) {
      throw new Error("No size variant block in button.tsx");
    }
    const end = buttonSource.indexOf("\n      },", start);
    if (end === -1) {
      throw new Error("Unterminated size variant block in button.tsx");
    }
    return buttonSource.slice(start, end);
  }

  /**
   * Only the button's OWN dimensions.
   *
   * The lookbehind is load-bearing: the variants also carry
   * `[&_svg:not([class*='size-'])]:size-3`, which sizes the icon *inside* the
   * button, not the target. Icon utilities are always preceded by `]:`, the
   * button's own by a quote or a space. Matching both would fail the gate on a
   * 12px icon that SC 2.5.8 says nothing about.
   */
  function ownSizeUtilities(block: string): { utility: string; step: number }[] {
    return [...block.matchAll(/(?<=["'\s])(h|size)-(\d+)\b/g)].map((match) => ({
      utility: match[0],
      step: Number(match[2]),
    }));
  }

  it("finds the button size variants to check", () => {
    // Guards the assertion below against passing because it matched nothing —
    // the exact way a gate goes quiet when the file it reads is refactored.
    const found = ownSizeUtilities(readSizeVariantBlock());
    expect(found.length).toBeGreaterThanOrEqual(8);
  });

  it("ignores the icon sizes nested inside the variants", () => {
    // Proves the lookbehind actually excludes them, rather than the gate
    // passing because the icons happen to be large enough.
    const found = ownSizeUtilities(readSizeVariantBlock());
    expect(found.map((f) => f.utility)).not.toContain("size-3");
    expect(readSizeVariantBlock()).toContain("size-3");
  });

  it("gives every button variant a target of at least 24px", () => {
    for (const { utility, step } of ownSizeUtilities(readSizeVariantBlock())) {
      expect(
        step,
        `button size "${utility}" is ${step * 4}px, below the 24px minimum`,
      ).toBeGreaterThanOrEqual(MINIMUM_STEP);
    }
  });
});
