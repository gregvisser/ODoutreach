// The watcher reloading itself when its own script changes on disk.
//
// WHAT WENT WRONG, REPEATEDLY
//
// Queue row 52 cost roughly ten cycles because PowerShell reads a script once,
// at launch, and a merge to relay-watch.ps1 does nothing to a process already
// running the old code (see the long comment above Get-StaleWatcherNote in
// relay-watch.ps1). `.bidlow/relay/RESTART-REQUIRED.md` records FOUR more
// restarts of exactly this shape, the worst costing six cycles (185-190)
// re-verifying work that had already correctly merged. Every one of those was
// closed only because a human noticed and ran relay-start.cmd by hand. Greg
// asked for this directly on 31 August 2026: a stale watcher is a blocker he
// cannot see, and he should not have to notice it.
//
// WHY THIS DRIVES POWERSHELL INSTEAD OF RE-IMPLEMENTING IT IN TS
//
// Same reason every other relay spec in this directory gives: the code that
// runs overnight is the PowerShell. A TypeScript re-implementation with green
// tests beside an unfixed script is this repository's worst recorded defect
// wearing a lab coat. Every behavioural assertion below dot-sources the
// shipped `relay-watch.ps1` with `-LoadOnly` and calls the real functions.
//
// FOUR THINGS THIS FILE MUST PROVE, PER THE BRIEF, ALL FAILING RED WITHOUT
// THE CHANGE THEY TEST:
//   1. an unchanged file does NOT trigger a reload
//   2. a changed file DOES trigger a reload
//   3. the reload cannot fire mid-cycle
//   4. a failed spawn leaves the current process running, not exited

import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// See queue-parser.test.ts's long note on the ~5.9s cold first spawn.
// `powershell-timeout-budget.test.ts` fails if this line is removed.
vi.setConfig({ testTimeout: 30_000 });

it("runs under the raised time budget, not vitest's 5s default", (ctx) => {
  expect(ctx.task.timeout).toBe(30_000);
});

const REPO_ROOT = path.resolve(__dirname, "..");
const WATCHER = path.join(REPO_ROOT, "relay-watch.ps1");
const RELAY_START_CMD = path.join(REPO_ROOT, "relay-start.cmd");

// Both hosts wherever both exist - relay-start.cmd uses `powershell` (5.1), a
// developer shell finds `pwsh` (7.x) first. A missing host FAILS rather than
// skips - a relay test that quietly opts out is indistinguishable from one
// that passes.
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
      "Neither `pwsh` nor `powershell` is available, so the watcher's self-reload " +
        "could not be exercised. This is a failure, not a skip.",
    );
  }
  return found;
}

const POWERSHELL_HOSTS = resolvePowerShellHosts();

let workDir: string;
let runSeq = 0;

beforeAll(() => {
  workDir = mkdtempSync(path.join(tmpdir(), "relay-reload-"));
});

afterAll(() => {
  rmSync(workDir, { recursive: true, force: true });
});

/**
 * Dot-source the REAL relay-watch.ps1 with -LoadOnly and run `body` against
 * its real functions. `body` must write its result, as JSON, to $ResultPath.
 *
 * Dot-sourcing the shipped file directly (not a copy) is safe here because
 * -LoadOnly stops before MAIN ever creates a directory or touches a live
 * path, and every test below either calls pure functions or explicitly
 * repoints $StatusFile at a scratch path before calling anything that writes.
 */
function runAgainstWatcher(shell: string, body: string): unknown {
  runSeq += 1;
  const dir = path.join(workDir, `run-${runSeq}`);
  const resultPath = path.join(dir, "result.json");
  const scriptPath = path.join(dir, "harness.ps1");
  mkdirSync(dir, { recursive: true });

  const harness = `
$ErrorActionPreference = "Stop"
. ${JSON.stringify(WATCHER)} -LoadOnly
$ResultPath = ${JSON.stringify(resultPath)}

${body}
`;
  writeFileSync(scriptPath, harness, "utf8");
  execFileSync(shell, ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", scriptPath], {
    stdio: "pipe",
  });

  // Strip the BOM 5.1's `-Encoding utf8` always writes.
  return JSON.parse(readFileSync(resultPath, "utf8").replace(/^\uFEFF/, ""));
}

describe.each(POWERSHELL_HOSTS)("Test-WatcherSelfReloadNeeded under %s", (shell) => {
  // -----------------------------------------------------------------------
  // 1. AN UNCHANGED FILE DOES NOT TRIGGER A RELOAD.
  // -----------------------------------------------------------------------
  it("does not flag a reload when the hash on disk matches what was loaded", () => {
    const out = runAgainstWatcher(
      shell,
      `
$hashCheck = { param($p) 'SAMEHASH0000000000000000000000000000000000000000000000000000' }
$out = Test-WatcherSelfReloadNeeded -LoadedHash 'SAMEHASH0000000000000000000000000000000000000000000000000000' -ScriptPath 'C:\\does-not-matter.ps1' -HashCheck $hashCheck
$out | ConvertTo-Json -Depth 6 | Set-Content -Path $ResultPath -Encoding utf8
`,
    ) as { ShouldReload: boolean };

    expect(out.ShouldReload).toBe(false);
  });

  // -----------------------------------------------------------------------
  // 2. A CHANGED FILE DOES TRIGGER A RELOAD.
  // -----------------------------------------------------------------------
  it("flags a reload when the hash on disk differs from what was loaded", () => {
    const out = runAgainstWatcher(
      shell,
      `
$hashCheck = { param($p) 'DIFFERENTHASH11111111111111111111111111111111111111111111111' }
$out = Test-WatcherSelfReloadNeeded -LoadedHash 'SAMEHASH0000000000000000000000000000000000000000000000000000' -ScriptPath 'C:\\does-not-matter.ps1' -HashCheck $hashCheck
$out | ConvertTo-Json -Depth 6 | Set-Content -Path $ResultPath -Encoding utf8
`,
    ) as { ShouldReload: boolean; CurrentHash: string };

    expect(out.ShouldReload).toBe(true);
    expect(out.CurrentHash).toBe("DIFFERENTHASH11111111111111111111111111111111111111111111111");
  });

  // Fail safe, not fail shut: an unreadable hash must never be read as "reload".
  it.each([
    ["the loaded hash is missing", "$null", "{ param($p) 'ANYTHING' }"],
    ["the disk read throws", "'SAMEHASH0000000000000000000000000000000000000000000000000000'", "{ param($p) throw 'disk unreadable' }"],
    ["the disk read returns nothing", "'SAMEHASH0000000000000000000000000000000000000000000000000000'", "{ param($p) '' }"],
  ])("does not reload when %s - admits it cannot tell instead", (_label, loadedHashExpr, hashCheckExpr) => {
    const out = runAgainstWatcher(
      shell,
      `
$hashCheck = ${hashCheckExpr}
$out = Test-WatcherSelfReloadNeeded -LoadedHash ${loadedHashExpr} -ScriptPath 'C:\\does-not-matter.ps1' -HashCheck $hashCheck
$out | ConvertTo-Json -Depth 6 | Set-Content -Path $ResultPath -Encoding utf8
`,
    ) as { ShouldReload: boolean; Note: string };

    expect(out.ShouldReload).toBe(false);
    expect(out.Note.toLowerCase()).toContain("cannot tell");
  });

  // -----------------------------------------------------------------------
  // THE ONE THAT MATTERS: reproduces row 52's actual scenario with real file
  // I/O, no injected hashes. A copy is loaded (the "launch"), the copy is
  // really edited on disk afterwards (the "merge"), and the function is
  // asked whether ITS OWN copy is now stale using its real default HashCheck.
  // -----------------------------------------------------------------------
  it("fires against a script that is really replaced on disk after the process loaded it", () => {
    runSeq += 1;
    const dir = path.join(workDir, `real-stale-${runSeq}`);
    mkdirSync(dir, { recursive: true });

    const copy = path.join(dir, "relay-watch.ps1");
    const resultPath = path.join(dir, "result.json");
    const scriptPath = path.join(dir, "harness.ps1");

    writeFileSync(copy, readFileSync(WATCHER));

    const harness = `
$ErrorActionPreference = "Stop"

# Load the copy. This is the launch; $script:LoadedScriptHash is taken now.
. ${JSON.stringify(copy)} -LoadOnly
$loaded = $script:LoadedScriptHash

# A "merge" lands underneath the already-running process.
Add-Content -Path ${JSON.stringify(copy)} -Value "# a change merged after launch" -Encoding utf8

$out = Test-WatcherSelfReloadNeeded -LoadedHash $loaded -ScriptPath ${JSON.stringify(copy)}
$out | ConvertTo-Json -Depth 6 | Set-Content -Path ${JSON.stringify(resultPath)} -Encoding utf8
`;
    writeFileSync(scriptPath, harness, "utf8");
    execFileSync(shell, ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", scriptPath], {
      stdio: "pipe",
    });

    const out = JSON.parse(readFileSync(resultPath, "utf8").replace(/^\uFEFF/, "")) as {
      ShouldReload: boolean;
    };
    expect(out.ShouldReload).toBe(true);
  });

  it("reports no reload needed for the real, untouched file on disk right now", () => {
    const out = runAgainstWatcher(
      shell,
      `
$out = Test-WatcherSelfReloadNeeded -LoadedHash $script:LoadedScriptHash -ScriptPath ${JSON.stringify(WATCHER)}
$out | ConvertTo-Json -Depth 6 | Set-Content -Path $ResultPath -Encoding utf8
`,
    ) as { ShouldReload: boolean };

    expect(out.ShouldReload).toBe(false);
  });
});

describe.each(POWERSHELL_HOSTS)("Start-FreshWatcherProcess under %s", (shell) => {
  it("spawns via the injected launcher and reports the new process's id", () => {
    const out = runAgainstWatcher(
      shell,
      `
$launcher = { param($exe, $scriptArgs) [pscustomobject]@{ Id = 4242 } }
$out = Start-FreshWatcherProcess -ScriptPath 'C:\\fake\\relay-watch.ps1' -Exe 'C:\\fake\\powershell.exe' -Launcher $launcher
$out | ConvertTo-Json -Depth 6 | Set-Content -Path $ResultPath -Encoding utf8
`,
    ) as { Spawned: boolean; NewPid: number; Error: string | null };

    expect(out.Spawned).toBe(true);
    expect(out.NewPid).toBe(4242);
    expect(out.Error).toBeNull();
  });

  it("passes the script path and current host executable through to the launcher", () => {
    const out = runAgainstWatcher(
      shell,
      `
$script:Captured = $null
$launcher = { param($exe, $scriptArgs) $script:Captured = @{ Exe = $exe; Args = ($scriptArgs -join '|') }; [pscustomobject]@{ Id = 1 } }
$null = Start-FreshWatcherProcess -ScriptPath 'C:\\fake\\relay-watch.ps1' -Exe 'C:\\fake\\powershell.exe' -Launcher $launcher
$script:Captured | ConvertTo-Json -Depth 6 | Set-Content -Path $ResultPath -Encoding utf8
`,
    ) as { Exe: string; Args: string };

    expect(out.Exe).toBe("C:\\fake\\powershell.exe");
    expect(out.Args).toContain("-File|C:\\fake\\relay-watch.ps1");
  });

  // -----------------------------------------------------------------------
  // 4. A FAILED SPAWN LEAVES THE CURRENT PROCESS RUNNING RATHER THAN EXITING.
  //
  // The harness script itself stands in for the watcher's main loop: if
  // Start-FreshWatcherProcess let the launcher's exception escape, this
  // whole harness process would die and execFileSync below would throw for
  // the WRONG reason. It completing normally, with Spawned = $false and the
  // launcher's message captured, IS the proof that a broken spawn cannot
  // take the current process down with it.
  // -----------------------------------------------------------------------
  it("catches a throwing launcher and reports it, without killing the caller", () => {
    const out = runAgainstWatcher(
      shell,
      `
$launcher = { param($exe, $scriptArgs) throw "launcher exploded on purpose" }
$out = Start-FreshWatcherProcess -ScriptPath 'C:\\fake\\relay-watch.ps1' -Exe 'C:\\fake\\powershell.exe' -Launcher $launcher
$out | ConvertTo-Json -Depth 6 | Set-Content -Path $ResultPath -Encoding utf8
Write-Host "REACHED THE LINE AFTER Start-FreshWatcherProcess"
`,
    ) as { Spawned: boolean; NewPid: number | null; Error: string };

    expect(out.Spawned).toBe(false);
    expect(out.NewPid).toBeNull();
    expect(out.Error).toContain("launcher exploded on purpose");
  });

  it("treats a launcher that returns no process handle as a failed spawn, not a crash", () => {
    const out = runAgainstWatcher(
      shell,
      `
$launcher = { param($exe, $scriptArgs) $null }
$out = Start-FreshWatcherProcess -ScriptPath 'C:\\fake\\relay-watch.ps1' -Exe 'C:\\fake\\powershell.exe' -Launcher $launcher
$out | ConvertTo-Json -Depth 6 | Set-Content -Path $ResultPath -Encoding utf8
`,
    ) as { Spawned: boolean; Error: string };

    expect(out.Spawned).toBe(false);
    expect(out.Error).toMatch(/no process handle/i);
  });
});

describe.each(POWERSHELL_HOSTS)("Save-Status under %s", (shell) => {
  // STATUS.json must carry the running process's own script hash and start
  // time - the "make staleness visible even when the reload does not fire"
  // half of the brief. $StatusFile is repointed at a scratch path BEFORE
  // Save-Status is ever called, so this never touches the real, live
  // .bidlow/relay/STATUS.json.
  it("writes the loaded script hash and process start time, and keeps the cycle number given to it", () => {
    runSeq += 1;
    const dir = path.join(workDir, `status-${runSeq}`);
    const statusPath = path.join(dir, "STATUS.json");
    const resultPath = path.join(dir, "result.json");
    const scriptPath = path.join(dir, "harness.ps1");
    mkdirSync(dir, { recursive: true });

    const harness = `
$ErrorActionPreference = "Stop"
. ${JSON.stringify(WATCHER)} -LoadOnly
$StatusFile = ${JSON.stringify(statusPath)}

Save-Status -cycle 7 -outcome 'finished' -lastSelfQueued 6

$json = Get-Content $StatusFile -Raw | ConvertFrom-Json
$result = [pscustomobject]@{
    Cycle                   = $json.cycle
    ScriptHashPresent       = (-not [string]::IsNullOrWhiteSpace($json.scriptHash))
    ScriptHashMatchesLoaded = ($json.scriptHash -eq $script:LoadedScriptHash)
    ProcessStartedAtPresent = (-not [string]::IsNullOrWhiteSpace($json.processStartedAt))
}
$result | ConvertTo-Json -Depth 6 | Set-Content -Path ${JSON.stringify(resultPath)} -Encoding utf8
`;
    writeFileSync(scriptPath, harness, "utf8");
    execFileSync(shell, ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", scriptPath], {
      stdio: "pipe",
    });

    const out = JSON.parse(readFileSync(resultPath, "utf8").replace(/^\uFEFF/, "")) as {
      Cycle: number;
      ScriptHashPresent: boolean;
      ScriptHashMatchesLoaded: boolean;
      ProcessStartedAtPresent: boolean;
    };

    expect(out.Cycle).toBe(7);
    expect(out.ScriptHashPresent).toBe(true);
    expect(out.ScriptHashMatchesLoaded).toBe(true);
    expect(out.ProcessStartedAtPresent).toBe(true);
  });
});

// -----------------------------------------------------------------------------
// 3. THE RELOAD CANNOT FIRE MID-CYCLE - PROVEN AT SOURCE LEVEL.
//
// Nothing above can drive the live `while ($true)` loop - it never runs under
// -LoadOnly, and running it for real means running a live cycle (see the
// identical argument in stale-watcher-visible.test.ts's own "WIRING
// BACKSTOP" section). But the claim itself is a claim about STRUCTURE, not
// behaviour: Invoke-CycleAgent is synchronous, so the top of the loop -
// where the reload check lives - is reachable only once every cycle this
// process started has fully returned, or on the very first iteration before
// any cycle has run at all. Either way nothing is "mid-cycle" there. So the
// proof is that the call site truly sits at that structural position: after
// the HALT check, before any row is picked, and strictly before
// Invoke-CycleAgent is ever invoked - and that it appears exactly once, so
// nothing calls it again from inside the part of the loop that runs a cycle.
// -----------------------------------------------------------------------------
describe("self-reload call site (source-level proof it cannot fire mid-cycle)", () => {
  const source = readFileSync(WATCHER, "utf8");

  it("the reload check appears exactly once in the whole script", () => {
    const matches = source.match(/\$reloadCheck\s*=\s*Test-WatcherSelfReloadNeeded\b/g) ?? [];
    expect(matches.length).toBe(1);
  });

  it("the reload check sits after the loop's HALT check and before Invoke-CycleAgent is ever called", () => {
    const haltIdx = source.indexOf('Write-Line "HALT file found. Stopping cleanly."');
    const reloadIdx = source.indexOf("$reloadCheck = Test-WatcherSelfReloadNeeded");
    const cycleAgentIdx = source.indexOf("$run = Invoke-CycleAgent");

    expect(haltIdx).toBeGreaterThan(-1);
    expect(reloadIdx).toBeGreaterThan(haltIdx);
    expect(cycleAgentIdx).toBeGreaterThan(reloadIdx);
  });

  it("only exits the process (44) when the fresh watcher actually spawned - never on a failed spawn", () => {
    const spawnedIfIdx = source.indexOf("if ($reloadResult.Spawned) {");
    const exit44Idx = source.indexOf("exit 44");
    const elseIdx = source.indexOf("} else {", spawnedIfIdx);

    expect(spawnedIfIdx).toBeGreaterThan(-1);
    expect(exit44Idx).toBeGreaterThan(spawnedIfIdx);
    expect(elseIdx).toBeGreaterThan(exit44Idx);

    // And the failure branch logs and falls through - it does not exit. A
    // fixed window rather than matching the closing brace exactly: the
    // branch is a few short lines, well inside 300 characters, and this
    // avoids the assertion being fragile to re-indentation.
    const failureBranch = source.slice(elseIdx, elseIdx + 300);
    expect(failureBranch).not.toContain("exit ");
  });

  it("Save-Status's own written object carries the loaded script hash and process start time", () => {
    expect(source).toMatch(/scriptHash\s*=\s*\$script:LoadedScriptHash/);
    expect(source).toMatch(/processStartedAt\s*=\s*\$script:ProcessStartedAt/);
  });
});

// -----------------------------------------------------------------------------
// relay-start.cmd must not double-spawn when the watcher already handed over.
// If exit 44 fell through to the existing rollover branch, relay-start.cmd
// would start a SECOND watcher on top of the one relay-watch.ps1 already
// spawned itself - exactly the "new process must not fight the old one"
// failure the brief names explicitly.
// -----------------------------------------------------------------------------
describe("relay-start.cmd handles the self-reload exit code without double-spawning", () => {
  const cmdSource = readFileSync(RELAY_START_CMD, "utf8");

  it("checks errorlevel 44 before the lower thresholds, so it is not swallowed by them", () => {
    const idx44 = cmdSource.indexOf("if errorlevel 44 goto reloaded");
    const idx43 = cmdSource.indexOf("if errorlevel 43 goto relaystop");
    const idx42 = cmdSource.indexOf("if errorlevel 42 goto rollover");

    expect(idx44).toBeGreaterThan(-1);
    expect(idx43).toBeGreaterThan(idx44);
    expect(idx42).toBeGreaterThan(idx43);
  });

  it("the :reloaded label ends the batch script rather than starting another watcher", () => {
    const reloadedIdx = cmdSource.indexOf(":reloaded");
    expect(reloadedIdx).toBeGreaterThan(-1);

    const nextLabelIdx = cmdSource.indexOf("\n:", reloadedIdx + 1);
    const block = cmdSource.slice(reloadedIdx, nextLabelIdx === -1 ? undefined : nextLabelIdx);

    expect(block).toContain("goto :eof");
    expect(block).not.toContain("goto relayloop");
    expect(block).not.toContain("powershell");
  });
});
