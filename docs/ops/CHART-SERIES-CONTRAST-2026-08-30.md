# Chart series contrast + colour-blind distinguishability — 2026-08-30

Closes `.bidlow/DESIGN.json` `open_defects.chart-series-contrast` (found
2026-08-26, cycle 9). Relay queue row 107, cycle 133.

## What was wrong

`--chart-3` and `--chart-4` failed WCAG 1.4.11 (non-text contrast, 3:1
required for a graphic carrying required information) in light mode. Cycle 9
measured this and deliberately did not apply the naive fix — darkening
`--chart-4` alone — because that move lands it within 0.07 lightness of
`--chart-1` at the same hue (both were hue 162), making the two series hard
to tell apart. That finding was correct and is why this row asked for a full
re-derivation instead of a token nudge.

Nobody had measured colour-blind distinguishability at all. This row does,
computationally, using the method in this project's `dataviz` skill
(OKLab ΔE ×100 under Machado-Oliveira-Fernandes 2009 CVD simulation).

## Method

Re-runnable in `src/lib/design/chart-palette.test.ts` (contrast + CVD/normal-
vision/tritan distinguishability, all-pairs) and `src/lib/design/color-vision.ts`
(the maths: OKLab forward transform, CVD simulation, ΔE). Both were written
and run against the **unchanged** tokens first and failed red — see
"Proof it fires" below — before any token was touched.

Search: grid/hill-climb over hue × lightness × chroma per token, holding
`--chart-1`'s hue fixed at 162 (the brand hue, matching `--primary`) so the
result stays recognisably OpensDoors' palette rather than a generic default,
and excluding two hue bands: 260–320 (the existing `no-default-violet`
anti-goal) and a new ±25° buffer around `--destructive`'s hue (~27°), so a
chart series can never read as an error/critical state. Optimised jointly for
light and dark against the four bars this row set:

1. Every chart token ≥ 3:1 against `--card`, both themes.
2. Every **pair** of chart series (not just neighbours — this project's charts
   already put non-adjacent slots on screen together, e.g. `chart-1`/`chart-3`
   in the volume trend chart, so the stricter all-pairs check applies) ≥ 8.0
   OKLab ΔE under simulated protanopia and deuteranopia (the skill's target).
3. Same all-pairs set ≥ 15.0 ΔE under normal, unsimulated vision (the skill's
   hard floor — this is what actually forces re-ordering/re-stepping; CVD
   separation alone is not sufficient).
4. Same all-pairs set checked under simulated tritanopia too. The skill's own
   validator reports tritan but does not hard-gate it (tritanopia is ~0.01% of
   the population vs ~8% of males for protan/deutan combined) — this palette
   was tuned to also clear the CVD floor (6.0) under tritan, so
   `chart-palette.test.ts` asserts it there as a regression guard, not
   because the skill requires it.

## Before / after — light mode (card = `oklch(1 0 0)`, `#ffffff`)

| token | before | contrast | after | contrast |
|---|---|---|---|---|
| `--chart-1` | `oklch(0.55 0.09 162)` | 4.64:1 PASS | `oklch(0.594 0.13 162)` | 3.80:1 PASS |
| `--chart-2` | `oklch(0.58 0.08 210)` | 4.15:1 PASS | `oklch(0.62 0.216 58)` | 3.86:1 PASS |
| `--chart-3` | `oklch(0.72 0.12 80)` | **2.51:1 FAIL** | `oklch(0.432 0.22 253.3)` | 7.97:1 PASS |
| `--chart-4` | `oklch(0.72 0.08 162)` | **2.39:1 FAIL** | `oklch(0.447 0.164 326.4)` | 8.26:1 PASS |
| `--chart-5` | `oklch(0.55 0.04 250)` | 4.83:1 PASS | *(removed — see below)* | — |

Distinguishability, all-pairs, light:

| check | before | after |
|---|---|---|
| worst CVD ΔE (protan/deutan) | 2.9 (`chart-2`↔`chart-5`, deutan) — **FAIL, floor 6.0** | 10.9 (`chart-1`↔`chart-2`, protan) — **PASS, target 8.0** |
| worst normal-vision ΔE | 6.3 (`chart-2`↔`chart-5`) — **FAIL, floor 15.0** | 20.0 (`chart-3`↔`chart-4`) — **PASS** |
| worst tritan ΔE | 3.7 (`chart-1`↔`chart-2`) — FAIL vs the 6.0 guard | 14.2 (`chart-1`↔`chart-3`) — PASS |

## Before / after — dark mode (card = `oklch(0.215 0.014 165)`, `#131c18`)

| token | before | contrast | after | contrast |
|---|---|---|---|---|
| `--chart-1` | `oklch(0.68 0.09 162)` | 6.31:1 PASS | `oklch(0.555 0.115 162)` | 3.89:1 PASS |
| `--chart-2` | `oklch(0.68 0.08 210)` | 6.24:1 PASS | `oklch(0.582 0.22 58)` | 3.87:1 PASS |
| `--chart-3` | `oklch(0.78 0.11 80)` | 8.63:1 PASS | `oklch(0.67 0.179 253.3)` | 5.80:1 PASS |
| `--chart-4` | `oklch(0.78 0.07 162)` | 8.98:1 PASS | `oklch(0.593 0.166 326.4)` | 3.94:1 PASS |
| `--chart-5` | `oklch(0.68 0.03 250)` | 6.07:1 PASS | *(removed)* | — |

Dark mode already passed contrast before this row (chart tokens sit lighter
against the dark card by construction); the defect was light-mode-only. The
**distinguishability** failure was present in both modes, and was not
previously measured in either:

| check | before | after |
|---|---|---|
| worst CVD ΔE (protan/deutan) | 1.7 (`chart-2`↔`chart-5`, deutan) — **FAIL** | 10.6 (`chart-1`↔`chart-2`, protan) — **PASS** |
| worst normal-vision ΔE | 6.0 (`chart-2`↔`chart-5`) — **FAIL** | 21.1 (`chart-2`↔`chart-4`) — **PASS** |
| worst tritan ΔE | 2.7 (`chart-1`↔`chart-2`) — FAIL vs the guard | 13.4 (`chart-2`↔`chart-4`) — PASS |

## The bar this row set — scored against all four, honestly

1. **Every chart token ≥ 3:1 against the card, both modes.** Met — see tables
   above. Worst case 3.80:1 (light `chart-1`) / 3.83:1 (dark `chart-2`, before
   the destructive-collision nudge below).
2. **Every pair of series distinguishable from every other.** Met, for the
   four series shipped — all-pairs, both modes, both under normal vision
   (worst 20.0 light / 21.1 dark against a 15.0 floor) and under simulated
   protanopia/deuteranopia (worst 10.9 light / 10.6 dark against an 8.0
   target).
3. **Still distinguishable under deuteranopia, protanopia and tritanopia
   simulation.** Met for all three, for the four series shipped — see the
   tritan rows above (worst 14.2 light / 13.4 dark, comfortably past the 6.0
   guard this project chose to hold itself to even though the skill's own
   validator doesn't hard-gate tritan).
4. **Still recognisably the product's palette.** `--chart-1` was held fixed
   at hue 162 throughout the search — the same hue as `--primary` — so the
   brand green anchors the set rather than being replaced by an optimizer's
   free choice.

**All four, at once, for four series.** Not for five — see below.

## `--chart-5`: dropped, with the numbers

The DESIGN.json token set had five chart slots. An exhaustive search for a
5th hue — anchored on the same brand-green `chart-1` at 162, and satisfying
the same contrast/chroma/CVD constraints as the other four — could not clear
the all-pairs normal-vision floor together with the other four: **best found
was 14.19–14.20 ΔE against a required 15.0**, a real, measured, near miss,
not a hand-wave. (For comparison: this project's `dataviz` skill's own
carefully-engineered 8-hue reference palette also cannot clear the all-pairs
floor past its first three slots — see `references/palette.md` in the skill —
so hitting four here, all-pairs, brand-anchored, is already ahead of that
reference's own ceiling.)

Two things would clear a genuine 5th series if one is ever needed:

- **Drop the exact-162 brand anchor.** An unconstrained 5-hue search (no slot
  pinned to any particular hue) clears both hard floors with margin — ΔE
  ~10.1 CVD / ~18.0 normal-vision in light, ~9.6 / ~17.4 in dark — but
  `chart-1` would no longer be the brand green.
- **Add secondary encoding** (a dash pattern, a distinct marker shape, or a
  direct label) on the 5th series, so identity does not depend on hue alone.
  This is the dataviz skill's own prescribed relief for exactly this
  situation.

Rather than ship a 5th token that is on record as failing a hard accessibility
bar, `--chart-5` and its `@theme inline` Tailwind mapping (`--color-chart-5`)
were removed from `src/app/globals.css`, and the token dropped from
`.bidlow/DESIGN.json`. Nothing in the shipped product referenced `--chart-5`
or `--chart-4` before this row (`src/components/dashboard/dashboard-charts.tsx`
uses only `--chart-1`/`--chart-2`/`--chart-3`), so this is not a visible
regression — it is declining to add a broken slot to a set of four that
now genuinely works.

`chart-palette.test.ts` asserts the chart token count equals
`PROVEN_SAFE_CHART_TOKEN_COUNT` (4) precisely so a future token addition
cannot silently reintroduce this: adding a 5th without re-running this search
fails the count assertion immediately, pointing back at this artefact.

## A near-miss the test caught, live

The first candidate for `--chart-2` (hue 52°) cleared every distinguishability
bar but sat only 24.675° from `--destructive`'s light-mode hue (27.325°) — a
hair under the 25° buffer `chart-palette.test.ts` requires so a chart series
can never be mistaken for an error/critical state. The test failed on this
specific check, `chart-2` was moved to hue 58° (gap widened to 30.675°), and
every other bar was re-verified to still clear with the new hue. This is the
kind of near-miss the "compute it, don't eyeball it" method exists to catch —
24.675° reads as "basically fine" to the eye and would not have been noticed
by inspection.

## Proof it fires

`src/lib/design/chart-palette.test.ts` was written and run against the
**unchanged** tokens before any CSS edit, and failed red — 10 of 22
assertions failed, including `--chart-4` at 2.39:1 (against the required
3:1) and `--chart-1` vs `--chart-2` at 7.6 ΔE (against 8.0/15.0 for CVD and
normal vision respectively — a failure the previous cycle had not measured
at all, on a pair the previous cycle had not even flagged as the worst one).
After the token changes, the same file passes: 20/20 (`npx vitest run
src/lib/design/`, 4 files, 110/110 passing). Cross-checked independently
against the dataviz skill's own `scripts/validate_palette.js` on the hex
equivalents of the final tokens — both light and dark report `ALL CHECKS
PASS`.

## Gates run

- `npx vitest run src/lib/design/` — 110/110 passing (oklch, color-vision,
  chart-palette, design-system).
- `npm test` (full suite) — 3701/3703 passing; the two failures are
  pre-existing and unrelated to this row (a relay-log-tracking check that
  fails by design until the cycle's log is `git add`-ed, and a Sentry
  network-timeout test that passes in isolation).
- `npm run lint` — 0 errors (2 warnings, both in the scratch exploration
  script used to derive this palette, deleted before commit).
- `npx tsc --noEmit` — 0 errors.

## Files touched

- `src/app/globals.css` — chart-1..4 token values (both themes), `--chart-5`
  and its Tailwind mapping removed.
- `.bidlow/DESIGN.json` — token parity, four new `contrast_pairs` entries,
  `chart-series-contrast` moved out of `open_defects` (genuinely closed),
  decision recorded in `decisions_taken_this_cycle`.
- `src/lib/design/color-vision.ts` — new: OKLab transform, CVD simulation
  (Machado 2009), ΔE.
- `src/lib/design/color-vision.test.ts` — new: unit tests for the above.
- `src/lib/design/chart-palette.test.ts` — new: the re-runnable gate.
- This file.

No changes to `src/server/email`, no schema, no send path, no client data.
