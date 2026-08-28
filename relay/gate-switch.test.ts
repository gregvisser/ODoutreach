// The go-live / resume switch, tested against the REAL relay-gate.ps1.
//
// WHY THIS DRIVES POWERSHELL INSTEAD OF RE-IMPLEMENTING THE LOGIC IN TS
//
// Same reason as `queue-parser.test.ts` beside it: the code that runs five
// minutes before a client meeting is the PowerShell, and a passing test beside
// an unfixed script is this repository's worst recorded defect - something
// built, wired, reporting success, and never firing. Every assertion below
// dot-sources the shipped `relay-gate.ps1` with `-LoadOnly` and calls its real
// functions.
//
// WHAT THESE TESTS ARE PROTECTING
//
// `relay-golive.cmd` turns OFF the rail that stops a machine sending real mail
// for clients other than bidlowai. Getting that wrong in either direction is
// expensive:
//
//   * Reporting "you are live" when the site has not actually picked the change
//     up yet means Greg demonstrates a system that silently sends nothing.
//   * Leaving the gate off while the background agent is still running is the
//     one state the whole safety design exists to forbid.
//
// So the verdict function is not allowed to be optimistic, and the wait loops
// have to genuinely exit AND genuinely time out. Both are asserted here.

import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// Same time budget as queue-parser.test.ts beside it, for the same measured
// reason: every test here starts a real PowerShell host, and the FIRST one pays
// a cold-start cost that does not fit in vitest's 5000ms default. This file went
// red on CI alongside it on both `2de37ff` (5798ms) and `b7ef2a4` (5537ms) -
// `Test timed out in 5000ms`, with nothing broken.
//
// Two of the tests below also wait on real wall-clock: `Wait-ForRelayStopped` is
// exercised with `-PollSeconds 1` against a scripted process lookup, so they add
// seconds of genuine polling on top of the spawn. 30s clears both comfortably
// and still fails loudly on an actual hang.
//
// The full reasoning, and why this is not a global bump in vitest.config.ts, is
// in `relay/powershell-timeout-budget.test.ts` - which also fails if this line
// is removed.
vi.setConfig({ testTimeout: 30_000 });

// The receipt for the line above: `ctx.task.timeout` is what vitest actually
// resolved, so this goes red if `vi.setConfig` ever stops taking effect.
it("runs under the raised time budget, not vitest's 5s default", (ctx) => {
  expect(ctx.task.timeout).toBe(30_000);
});

const REPO_ROOT = path.resolve(__dirname, "..");
const GATE_SCRIPT = path.join(REPO_ROOT, "relay-gate.ps1");

// Both PowerShell hosts, for the reason spelled out in queue-parser.test.ts:
// `relay-golive.cmd` launches `powershell` (5.1) while a developer shell finds
// `pwsh` (7.x) first, and proving it under 7 while shipping to 5.1 would be the
// house defect wearing a lab coat.
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
      "Neither `pwsh` nor `powershell` is available, so the go-live switch could " +
        "not be exercised. This is a failure, not a skip.",
    );
  }
  return found;
}

const POWERSHELL_HOSTS = resolvePowerShellHosts();

let workDir: string;
let runSeq = 0;

beforeAll(() => {
  workDir = mkdtempSync(path.join(tmpdir(), "relay-gate-"));
});

afterAll(() => {
  rmSync(workDir, { recursive: true, force: true });
});

interface RunResult {
  dir: string;
  value: unknown;
}

/**
 * Dot-source the real script with -LoadOnly, run `body`, and hand back whatever
 * `body` wrote to $ResultPath as parsed JSON, plus the throwaway directory so a
 * test can assert on files the body touched.
 */
function runInGate(shell: string, body: string): RunResult {
  runSeq += 1;
  const dir = path.join(workDir, `run-${runSeq}`);
  const resultPath = path.join(dir, "result.json");
  const scriptPath = path.join(dir, "harness.ps1");

  mkdirSync(dir, { recursive: true });

  const harness = `
$ErrorActionPreference = "Stop"
. ${JSON.stringify(GATE_SCRIPT)} -LoadOnly
$ResultPath = ${JSON.stringify(resultPath)}
$WorkDir    = ${JSON.stringify(dir)}

function Write-Result($value) {
    $value | ConvertTo-Json -Depth 6 | Set-Content -Path $ResultPath -Encoding utf8
}

${body}
`;
  writeFileSync(scriptPath, harness, "utf8");

  const out = execFileSync(
    shell,
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", scriptPath],
    { stdio: "pipe", encoding: "utf8" },
  );

  if (!existsSync(resultPath)) {
    throw new Error(`The harness wrote no result. Script output was:\n${out}`);
  }

  // Windows PowerShell 5.1's `Set-Content -Encoding utf8` writes a byte-order
  // mark that JSON.parse rejects; PowerShell 7 does not. Stripping it here is
  // the same fix queue-parser.test.ts carries, for the same reason.
  const raw = readFileSync(resultPath, "utf8").replace(/^﻿/, "");
  return { dir, value: JSON.parse(raw) };
}

interface Verdict {
  Satisfied: boolean;
  Fatal: boolean;
  Reason: string;
}

/**
 * Turn a JSON string into a PowerShell expression that parses it.
 *
 * SINGLE quotes, not JSON.stringify. A JS double-quoted literal escapes inner
 * quotes as \" and PowerShell reads a backslash as an ordinary character, so the
 * string terminates early and the harness dies with a parser error rather than a
 * useful assertion. A single-quoted PowerShell string is literal throughout;
 * only ' itself needs doubling.
 */
function healthLiteral(json: string): string {
  return `('${json.replace(/'/g, "''")}' | ConvertFrom-Json)`;
}

const LIVE_GATE_ON = `{"ok":true,"service":"opensdoors-outreach","checks":{"database":"ok"},"autonomousRelay":{"active":true,"allowlistedClients":1}}`;
const LIVE_GATE_OFF = `{"ok":true,"service":"opensdoors-outreach","checks":{"database":"ok"},"autonomousRelay":{"active":false,"allowlistedClients":0}}`;
const DB_DOWN = `{"ok":false,"service":"opensdoors-outreach","checks":{"database":"error"}}`;
const OLD_BUILD = `{"ok":true,"service":"opensdoors-outreach","checks":{"database":"ok"}}`;
const GATE_ON_NO_ALLOWLIST = `{"ok":true,"service":"opensdoors-outreach","checks":{"database":"ok"},"autonomousRelay":{"active":true,"allowlistedClients":0}}`;

describe.each(POWERSHELL_HOSTS)("Get-GateVerdict under %s", (shell) => {
  function verdict(health: string | null, want: "off" | "on"): Verdict {
    const arg = health === null ? "$null" : healthLiteral(health);
    return runInGate(shell, `Write-Result (Get-GateVerdict -Health ${arg} -Want "${want}")`)
      .value as Verdict;
  }

  // ---- going live: we are waiting for the gate to read OFF -----------------

  it("does not call it live while the site still reports the gate ON", () => {
    // The restart has not landed yet. Saying "live" here is the exact lie that
    // would have Greg demonstrating a system that sends nothing.
    const v = verdict(LIVE_GATE_ON, "off");
    expect(v.Satisfied).toBe(false);
    expect(v.Fatal).toBe(false);
  });

  it("calls it live once the site itself reports the gate OFF", () => {
    const v = verdict(LIVE_GATE_OFF, "off");
    expect(v.Satisfied).toBe(true);
  });

  it("treats an unreachable site as keep-waiting, not as success", () => {
    const v = verdict(null, "off");
    expect(v.Satisfied).toBe(false);
    expect(v.Fatal).toBe(false);
  });

  it("does not call it live when the app is up but its database is down", () => {
    // A 503 is normal for a few seconds while App Service recycles, so it is
    // retryable - but it is never "sending is live".
    const v = verdict(DB_DOWN, "off");
    expect(v.Satisfied).toBe(false);
    expect(v.Fatal).toBe(false);
  });

  it("gives up rather than guessing when the site reports no gate at all", () => {
    // An older build that does not know about the gate. More polling cannot fix
    // this, so it stops instead of spinning for six minutes.
    const v = verdict(OLD_BUILD, "off");
    expect(v.Satisfied).toBe(false);
    expect(v.Fatal).toBe(true);
  });

  // ---- resuming: we are waiting for the gate to read ON, with a client ------

  it("only calls the rail back on when a client is actually allowlisted", () => {
    const v = verdict(LIVE_GATE_ON, "on");
    expect(v.Satisfied).toBe(true);
  });

  it("refuses a gate that is on but allowlists nobody", () => {
    // relay-watch.ps1 would refuse to run in this state anyway. Reporting it as
    // a successful resume would leave Greg believing the agent is working.
    const v = verdict(GATE_ON_NO_ALLOWLIST, "on");
    expect(v.Satisfied).toBe(false);
    expect(v.Fatal).toBe(true);
  });

  it("keeps waiting while the site still reports the gate OFF on a resume", () => {
    const v = verdict(LIVE_GATE_OFF, "on");
    expect(v.Satisfied).toBe(false);
    expect(v.Fatal).toBe(false);
  });
});

describe.each(POWERSHELL_HOSTS)("the plain-English summary under %s", (shell) => {
  function summary(health: string, commit: string): string {
    return runInGate(
      shell,
      `Write-Result ([string](Get-GoLiveSummary -Health ${healthLiteral(health)} -Commit "${commit}"))`,
    ).value as string;
  }

  it("says scheduled sending is live for every client, and names the build", () => {
    const text = summary(LIVE_GATE_OFF, "40b6fbe");
    expect(text).toMatch(/IS NOW LIVE FOR EVERY CLIENT/);
    expect(text).toContain("40b6fbe");
    expect(text).toMatch(/relay-resume\.cmd/);
  });

  it("records that a human clicking send was never blocked", () => {
    // Greg asked for this on the record: the gate only ever stopped the machine.
    // Without it he cannot tell whether a hand-driven demo needs go-live at all.
    expect(summary(LIVE_GATE_OFF, "40b6fbe")).toMatch(/always allowed|never blocked|only ever stopped/i);
  });

  it("never claims sending is live off a response that says the gate is on", () => {
    // The summary is the thing Greg actually reads. If the verdict logic were
    // ever bypassed, this is the last line of defence against a false claim.
    //
    // The match is the AFFIRMATIVE sentence, not the phrase "live for every
    // client" - the refusal text legitimately contains "NOT live for every
    // client", and an assertion loose enough to trip on that would have to be
    // loosened again the next time the wording changed.
    const text = summary(LIVE_GATE_ON, "40b6fbe");
    expect(text).not.toMatch(/IS NOW LIVE FOR EVERY CLIENT/);
    expect(text).toMatch(/NOTHING WAS CHANGED/);
  });
});

describe.each(POWERSHELL_HOSTS)("waiting for the relay to stop under %s", (shell) => {
  it("returns as soon as the watcher process is gone", () => {
    // Test-RelayProcessRunning is redefined AFTER dot-sourcing: PowerShell
    // resolves a function's callees dynamically, so the real Wait-ForRelayStopped
    // loop runs against a scripted sequence. The loop is real; only the process
    // lookup is faked.
    const result = runInGate(
      shell,
      `
$script:calls = 0
function Test-RelayProcessRunning {
    $script:calls++
    return ($script:calls -lt 3)
}
$r = Wait-ForRelayStopped -TimeoutMinutes 1 -PollSeconds 1
Write-Result ([pscustomobject]@{ Stopped = $r.Stopped; Calls = $script:calls })
`,
    ).value as { Stopped: boolean; Calls: number };

    expect(result.Stopped).toBe(true);
    expect(result.Calls).toBeGreaterThanOrEqual(3);
  });

  it("gives up and says so when the watcher never goes away", () => {
    // The timeout is what stops go-live hanging in front of a client. A wait
    // loop with a broken timeout is indistinguishable from a hung script.
    const result = runInGate(
      shell,
      `
function Test-RelayProcessRunning { return $true }
$started = Get-Date
$r = Wait-ForRelayStopped -TimeoutMinutes 0 -PollSeconds 1
Write-Result ([pscustomobject]@{
    Stopped = $r.Stopped
    Reason  = [string]$r.Reason
    Seconds = [math]::Round(((Get-Date) - $started).TotalSeconds, 1)
})
`,
    ).value as { Stopped: boolean; Reason: string; Seconds: number };

    expect(result.Stopped).toBe(false);
    expect(result.Reason).toMatch(/still running|did not stop/i);
    expect(result.Seconds).toBeLessThan(30);
  });
});

describe.each(POWERSHELL_HOSTS)("aborting cleanly under %s", (shell) => {
  it("removes a HALT file it created itself", () => {
    // An abort that leaves HALT behind stops the relay LATER, which is exactly
    // the half state - Greg believes nothing changed, and the agent is dead.
    const { dir, value } = runInGate(
      shell,
      `
$halt = Join-Path $WorkDir "HALT"
Set-Content -Path $halt -Value "x" -Encoding utf8
$removed = Undo-Halt -HaltPath $halt -CreatedByUs $true
Write-Result ([pscustomobject]@{ Removed = $removed; StillThere = (Test-Path $halt) })
`,
    );
    expect(value).toMatchObject({ Removed: true, StillThere: false });
    expect(existsSync(path.join(dir, "HALT"))).toBe(false);
  });

  it("leaves a HALT file that was already there before it ran", () => {
    // The relay was already stopped by hand. Deleting someone else's HALT would
    // restart the agent behind their back.
    const { value } = runInGate(
      shell,
      `
$halt = Join-Path $WorkDir "HALT"
Set-Content -Path $halt -Value "x" -Encoding utf8
$removed = Undo-Halt -HaltPath $halt -CreatedByUs $false
Write-Result ([pscustomobject]@{ Removed = $removed; StillThere = (Test-Path $halt) })
`,
    );
    expect(value).toMatchObject({ Removed: false, StillThere: true });
  });
});
