// Every relay spec that starts a PowerShell host must declare its own time
// budget. This test fails if one does not.
//
// WHY THIS EXISTS
//
// `main` went red twice on 2026-08-27 - commits `2de37ff` and `b7ef2a4` - and
// neither time was anything broken. Both runs failed the same way:
//
//   × relay queue parser under pwsh > Get-QueueRows > reads the real status
//     when the status cell itself contains a pipe            5864ms
//     → Test timed out in 5000ms.
//   × Get-GateVerdict under pwsh > does not call it live while the site still
//     reports the gate ON                                    5798ms
//     → Test timed out in 5000ms.
//
// Not an assertion failure. The tests ran, did their work, and were killed for
// taking 5.8 seconds against vitest's 5000ms default. The very next commit ran
// the identical tests green on the same runner.
//
// In BOTH files the test that blew the budget is the FIRST `it()` in the file,
// which is the tell: it is not per-assertion cost, it is the cold start of the
// first real `pwsh` invocation. The module-load probe only runs `-Command exit
// 0`; the first test is the first time the host has to load the runtime, JIT,
// and parse a multi-hundred-line script. Later spawns in the same file average
// ~1.2s. The first costs ~5.9s on a cold Linux runner.
//
// WHY A GUARD RATHER THAN JUST FIXING THE TWO FILES
//
// Fixing the two files fixes today. The defect that comes back is the THIRD
// relay spec: somebody adds `relay/whatever.test.ts`, drives a real PowerShell
// host from it because that is the house pattern the other two established, and
// `main` starts flickering red again for reasons nobody connects to the new
// file. A red CI that is red for no reason trains people to ignore CI, which is
// the actual cost here - far more than the minutes.
//
// WHY NOT A GLOBAL `testTimeout` BUMP IN vitest.config.ts
//
// Because it would apply to all ~2700 tests. The relay's PowerShell specs are
// the only ones paying process-spawn cost; everything else is pure and runs in
// single-digit milliseconds. Raising the global default would mean a genuinely
// hung test anywhere in the suite sits there burning the budget instead of
// failing fast, and the one useful thing a timeout does - telling you something
// is stuck - would be blunted everywhere to accommodate two files.
//
// WHY ONE ACCEPTED IDIOM AND NOT "ANY WAY OF SETTING A TIMEOUT"
//
// A timeout can be set per-test, per-describe, or per-file. Accepting all three
// would mean this guard has to parse them all, and a new spec could satisfy it
// by putting a budget on one test while the rest of the file keeps the default -
// which is exactly the shape of the bug (one slow test in a file of fast ones).
// So the file-wide form is the only one accepted, and a red line here has one
// fix: declare the budget for the whole file.

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const RELAY_DIR = __dirname;

// The floor, not the exact value. This guard's job is "did you think about
// process-spawn cost", not "did you pick the number I picked". 20s is ~3.4x the
// worst first-spawn actually observed on CI (5864ms), which leaves room for a
// loaded runner while staying far below anything that would look like a hang.
const MINIMUM_BUDGET_MS = 20_000;

// Vitest's default. Quoted here so the number this exists to escape is on the
// page next to the floor.
const VITEST_DEFAULT_TIMEOUT_MS = 5_000;

// This file talks ABOUT PowerShell without ever starting one, so it would match
// its own detector. Excluded by name rather than by making the needle harder to
// read - the exclusion is the honest thing to write down.
const SELF = path.basename(__filename).replace(/\.[cm]?[jt]s$/, "");

/**
 * A spec "drives PowerShell" if it names a PowerShell host at all. Both current
 * specs resolve their hosts from the literal list `["pwsh", "powershell"]`, and
 * any future spec that starts a host has to name one somewhere to start it.
 *
 * Deliberately crude: a false positive costs somebody one line of config, while
 * a false negative is a `main` that flickers red for a fortnight.
 */
function drivesPowerShell(source: string): boolean {
  return /\bpwsh\b|\bpowershell\b/i.test(source);
}

/**
 * Pull the file-wide budget out of `vi.setConfig({ testTimeout: N })`.
 * Tolerates numeric separators (`30_000`), which is how the specs write it.
 */
function declaredBudgetMs(source: string): number | null {
  const match = source.match(
    /vi\s*\.\s*setConfig\s*\(\s*\{[^}]*\btestTimeout\s*:\s*([\d_]+)/,
  );
  if (!match) return null;
  const parsed = Number(match[1].replace(/_/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

const POWERSHELL_SPECS = readdirSync(RELAY_DIR)
  .filter((name) => name.endsWith(".test.ts"))
  .filter((name) => !name.startsWith(SELF))
  .map((name) => ({
    name,
    source: readFileSync(path.join(RELAY_DIR, name), "utf8"),
  }))
  .filter((spec) => drivesPowerShell(spec.source));

describe("relay specs that start a PowerShell host", () => {
  // If the detector ever matches nothing, every assertion below would vacuously
  // pass and this whole file would become decoration - built, wired, reporting
  // success, and never firing. It must find the three that exist.
  it("finds the specs that drive PowerShell, so the checks below are not vacuous", () => {
    expect(POWERSHELL_SPECS.map((s) => s.name).sort()).toEqual([
      "cycle-log-preserved.test.ts",
      "gate-switch.test.ts",
      "queue-parser.test.ts",
    ]);
  });

  it.each(POWERSHELL_SPECS.map((s) => [s.name, s.source] as const))(
    "%s declares a file-wide time budget above vitest's default",
    (name, source) => {
      const budget = declaredBudgetMs(source);

      expect(
        budget,
        `relay/${name} starts a real PowerShell host but never declares a time ` +
          `budget, so every test in it runs against vitest's ${VITEST_DEFAULT_TIMEOUT_MS}ms ` +
          `default. A cold first spawn on a CI runner costs ~5.9s, which is how ` +
          `main went red on 2de37ff and b7ef2a4 with nothing broken. Add ` +
          `\`vi.setConfig({ testTimeout: 30_000 })\` near the top of the file.`,
      ).not.toBeNull();

      expect(
        budget,
        `relay/${name} declares a ${budget}ms budget, which is below the ` +
          `${MINIMUM_BUDGET_MS}ms floor. The worst first-spawn measured on CI was ` +
          `5864ms; a budget that does not clear it with room to spare will go red ` +
          `on a loaded runner and teach people to re-run CI instead of reading it.`,
      ).toBeGreaterThanOrEqual(MINIMUM_BUDGET_MS);
    },
  );
});
