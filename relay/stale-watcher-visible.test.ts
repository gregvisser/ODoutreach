// A watcher running a STALE copy of its own script must SAY SO in the cycle log.
//
// WHAT WENT WRONG
//
// Queue row 52 cost roughly ten cycles, and not one of them was spent on a hard
// problem. The fix for the log-destroying writer was written, tested green and
// merged as `3d7fef6` on 2026-08-28. It then did nothing at all for four more
// cycles, because PowerShell parses a script ONCE, AT LAUNCH: the watcher
// process already running had the pre-fix code in memory and merging a new
// `relay-watch.ps1` could not reach it. The deploy step for a local script is a
// process restart, and nobody performed one.
//
// That is instance ELEVEN of this repository's worst recorded defect, and the
// nastiest variant of it - not "built, wired, reports success, never fired" but
// "built, wired, TESTED GREEN, MERGED, and still not running". Cycles 64, 65,
// 70 and 71 each rediscovered it from scratch by noticing a clobbered log in
// `git status`, because nothing anywhere stated which version of the script the
// running process actually held.
//
// WHAT THIS FIXES
//
// `Get-StaleWatcherNote` compares the hash of the script AS LOADED AT LAUNCH
// against the hash of the file on disk NOW, and returns lines for the cycle
// log. Matching, it stamps the version - that stamp alone would have answered
// the question in one glance. Differing, it says plainly that the process is
// stale, that merged changes are inert, and that a restart is the fix.
//
// It cannot make a stale watcher run new code. Nothing can, short of a restart.
// It makes staleness VISIBLE in the artefact Greg already reads, so instance
// twelve is caught on the first cycle instead of the tenth.
//
// WHY THIS DRIVES POWERSHELL INSTEAD OF ASSERTING ON THE SOURCE TEXT
//
// Same reason `cycle-log-preserved.test.ts` and `queue-parser.test.ts` give:
// the code that runs overnight is the PowerShell. A TypeScript
// re-implementation would be this repository's worst defect wearing a lab coat.
// Every behavioural assertion below dot-sources the shipped `relay-watch.ps1`
// with `-LoadOnly` and calls the real function.

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// See the long note in `queue-parser.test.ts`: the first cold PowerShell spawn
// costs ~5.9s on CI, well past vitest's 5000ms default.
// `powershell-timeout-budget.test.ts` fails if this line is removed.
vi.setConfig({ testTimeout: 30_000 });

// The budget above is a claim; this is the receipt.
it("runs under the raised time budget, not vitest's 5s default", (ctx) => {
  expect(ctx.task.timeout).toBe(30_000);
});

const REPO_ROOT = path.resolve(__dirname, "..");
const WATCHER = path.join(REPO_ROOT, "relay-watch.ps1");

// Both hosts wherever both exist: `relay-start.cmd` uses `powershell` (5.1), a
// developer shell finds `pwsh` (7.x) first. A missing host FAILS rather than
// skips - a relay test that quietly opts out is indistinguishable from one that
// passes.
function resolvePowerShellHosts(): string[] {
  const found = ["pwsh", "powershell"].filter((candidate) => {
    try {
      execFileSync(candidate, ["-NoProfile", "-Command", "exit 0"], { stdio: "ignore" });
      return true;
    } catch {
      return false;
    }
  });

  if (found.length === 0) {
    throw new Error(
      "Neither `pwsh` nor `powershell` is available, so the watcher's staleness " +
        "check could not be exercised. This is a failure, not a skip.",
    );
  }
  return found;
}

const POWERSHELL_HOSTS = resolvePowerShellHosts();

let workDir: string;
let runSeq = 0;

beforeAll(() => {
  workDir = mkdtempSync(path.join(tmpdir(), "relay-stale-"));
});

afterAll(() => {
  rmSync(workDir, { recursive: true, force: true });
});

/** Run a PowerShell fragment against the dot-sourced watcher, return its stdout text. */
function runAgainstWatcher(shell: string, body: string): string {
  runSeq += 1;
  const dir = path.join(workDir, `run-${runSeq}`);
  const resultPath = path.join(dir, "result.txt");
  const scriptPath = path.join(dir, "harness.ps1");

  mkdirSync(dir, { recursive: true });

  const harness = `
$ErrorActionPreference = "Stop"
. ${JSON.stringify(WATCHER)} -LoadOnly

$out = ${body}

# @() then -join keeps a single-element return from unwrapping to a bare string,
# and [string] strips the NoteProperties 5.1 hangs off a parenthesised read.
[string]((@($out)) -join "\`n") | Set-Content -Path ${JSON.stringify(resultPath)} -Encoding utf8
`;

  writeFileSync(scriptPath, harness, "utf8");
  execFileSync(shell, ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", scriptPath], {
    stdio: "pipe",
  });

  // Strip the BOM 5.1's `Set-Content -Encoding utf8` always writes.
  return readFileSync(resultPath, "utf8").replace(/^﻿/, "");
}

function note(shell: string, loaded: string | null, current: string | null): string {
  const arg = (v: string | null) => (v === null ? "$null" : `'${v.replace(/'/g, "''")}'`);
  return runAgainstWatcher(
    shell,
    `Get-StaleWatcherNote -LoadedHash ${arg(loaded)} -CurrentHash ${arg(current)}`,
  );
}

// Two distinct, valid-looking SHA256 values. Content is irrelevant to the
// function - only whether they are equal - but using real-shaped hashes keeps
// the fixture honest about what the caller passes.
const HASH_A = "a".repeat(8) + "1b2c3d4e5f60718293a4b5c6d7e8f9012345678998765432101234567".slice(0, 56);
const HASH_B = "b".repeat(8) + "1b2c3d4e5f60718293a4b5c6d7e8f9012345678998765432101234567".slice(0, 56);

describe.each(POWERSHELL_HOSTS)("Get-StaleWatcherNote under %s", (shell) => {
  it("stamps the loaded version when the process matches the file on disk", () => {
    const out = note(shell, HASH_A, HASH_A);

    // It must say SOMETHING. Silence is what cost ten cycles.
    expect(out.trim().length).toBeGreaterThan(0);

    // The stamp the row asked for: which version this process is running.
    expect(out).toContain(HASH_A.slice(0, 12));

    // And it must not cry wolf when everything is fine.
    expect(out.toUpperCase()).not.toContain("RESTART REQUIRED");
    expect(out.toUpperCase()).not.toContain("STALE");
  });

  it("says RESTART REQUIRED, loudly, when the loaded script differs from disk", () => {
    const out = note(shell, HASH_A, HASH_B);

    expect(out.toUpperCase()).toContain("RESTART REQUIRED");
    expect(out.toUpperCase()).toContain("STALE");

    // Both sides, so the reader can see WHICH is which rather than take it on trust.
    expect(out).toContain(HASH_A.slice(0, 12));
    expect(out).toContain(HASH_B.slice(0, 12));

    // The exact misunderstanding that cost row 52 ten cycles: people assumed
    // merging the fix was enough. The note must contradict that in words.
    expect(out.toLowerCase()).toContain("inert");
    expect(out).toContain("relay-start.cmd");
  });

  it("admits it could not check rather than reporting a false all-clear", () => {
    for (const [loaded, current] of [
      [null, HASH_A],
      [HASH_A, null],
      [null, null],
      ["", HASH_A],
    ] as Array<[string | null, string | null]>) {
      const out = note(shell, loaded, current);

      expect(out.trim().length).toBeGreaterThan(0);
      expect(out.toLowerCase()).toContain("could not");

      // An unknown hash is NOT a difference. Claiming a restart is needed on
      // every unreadable read is how a real alarm gets ignored.
      expect(out.toUpperCase()).not.toContain("RESTART REQUIRED");
    }
  });

  // ---------------------------------------------------------------------------
  // PROVE IT FIRES, not that it exists.
  //
  // The function above is useless unless the watcher actually captures its own
  // hash AT LAUNCH. That capture runs at module scope, so dot-sourcing the real
  // script performs the real thing, and this asserts the real value.
  // ---------------------------------------------------------------------------
  it("captures the real script's hash at launch, matching the file byte for byte", () => {
    const captured = runAgainstWatcher(shell, "$script:LoadedScriptHash").trim();

    const actual = createHash("sha256").update(readFileSync(WATCHER)).digest("hex").toUpperCase();

    expect(captured.toUpperCase()).toBe(actual);
  });

  // The one that matters. Everything above either injects hashes or checks the
  // happy path; this reproduces the ACTUAL row-52 scenario with real file I/O -
  // a watcher loads, the script on disk is then replaced by a merge, and the
  // process carries on with the old code in memory. Nothing is faked: a real
  // copy is loaded, really edited underneath itself, and really re-hashed.
  it("fires on a script that is really replaced on disk after the process loaded it", () => {
    runSeq += 1;
    const dir = path.join(workDir, `stale-${runSeq}`);
    mkdirSync(dir, { recursive: true });

    const copy = path.join(dir, "relay-watch.ps1");
    const resultPath = path.join(dir, "result.txt");
    const scriptPath = path.join(dir, "harness.ps1");

    writeFileSync(copy, readFileSync(WATCHER));

    const harness = `
$ErrorActionPreference = "Stop"

# Load the copy. This is the launch, and $script:LoadedScriptHash is taken now.
. ${JSON.stringify(copy)} -LoadOnly
$loaded = $script:LoadedScriptHash

# Now a "merge" lands underneath the already-running process.
Add-Content -Path ${JSON.stringify(copy)} -Value "# a change merged after launch" -Encoding utf8

$current = (Get-FileHash -Path ${JSON.stringify(copy)} -Algorithm SHA256).Hash
$out = Get-StaleWatcherNote -LoadedHash $loaded -CurrentHash $current

[string]((@($out)) -join "\`n") | Set-Content -Path ${JSON.stringify(resultPath)} -Encoding utf8
`;

    writeFileSync(scriptPath, harness, "utf8");
    execFileSync(shell, ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", scriptPath], {
      stdio: "pipe",
    });

    const out = readFileSync(resultPath, "utf8").replace(/^﻿/, "");

    expect(out.toUpperCase()).toContain("RESTART REQUIRED");
    expect(out.toLowerCase()).toContain("inert");
    expect(out).toContain("relay-start.cmd");
  });

  it("reports all-clear when the launch-time capture is compared against the live file", () => {
    // End to end on the REAL script and the REAL file, with nothing injected:
    // a freshly dot-sourced watcher is by definition current, so this is the
    // exact call the loop makes and it must come back clean.
    const out = runAgainstWatcher(
      shell,
      "Get-StaleWatcherNote -LoadedHash $script:LoadedScriptHash " +
        `-CurrentHash (Get-FileHash -Path ${JSON.stringify(WATCHER)} -Algorithm SHA256).Hash`,
    );

    expect(out.toUpperCase()).not.toContain("RESTART REQUIRED");
    expect(out.toLowerCase()).not.toContain("could not");
  });
});

// -----------------------------------------------------------------------------
// WIRING BACKSTOP
//
// The two tests above prove the function behaves and that the launch-time
// capture fires. Neither can prove the LOOP puts the result in the cycle log,
// because that call site sits inside the main loop rather than in a function,
// and running the loop means running a live cycle.
//
// So this asserts the wiring at source level. It is deliberately the weakest
// test in the file and is not a substitute for the behavioural ones - it exists
// only to fail loudly if someone deletes the call while leaving the function in
// place, which is precisely how instance eleven happened.
//
// THE REAL RECEIPT IS THE NEXT CYCLE LOG. `.bidlow/relay/log/cycle-082.md` will
// contain the stamp - and it will only do so after the watcher is RESTARTED,
// because this change is subject to the very defect it reports.
// -----------------------------------------------------------------------------
it("feeds the staleness note into the cycle log the watcher writes", () => {
  const source = readFileSync(WATCHER, "utf8");

  // The note is computed into a variable just above the call and passed in by
  // name, so wiring means BOTH halves: the variable holds the function's
  // result, and the log body actually includes the variable. Asserting only
  // the first would pass while the note went nowhere - which is the exact
  // shape of this repository's worst defect.
  expect(source).toMatch(/\$stalenessNote\s*=\s*Get-StaleWatcherNote\b/);

  const callSiteStart = source.indexOf("$wrote = Write-CycleLog");
  expect(callSiteStart).toBeGreaterThan(-1);

  const linesArg = source.slice(callSiteStart, source.indexOf("\n    )", callSiteStart));
  expect(linesArg).toContain("$stalenessNote");

  // And the assignment must come BEFORE the call, or it passes an empty value.
  expect(source.indexOf("$stalenessNote = Get-StaleWatcherNote")).toBeLessThan(callSiteStart);
});
