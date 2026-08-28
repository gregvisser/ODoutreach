// The watcher must never shorten a cycle log that already has content.
//
// WHAT WENT WRONG
//
// `relay-watch.ps1` picked `.bidlow/relay/log/cycle-NNN.md` at the START of a
// cycle and wrote it at the END with `... | Set-Content -Path $logFile`. A cycle
// also writes its own account of itself to that exact path while it runs - the
// 130-230 line document Greg actually reads. Set-Content truncates, so the
// watcher's final write landed on top of the agent's log and destroyed it.
//
// What replaced it was NOT a copy. It was the watcher's boilerplate, the brief,
// and the agent's last stdout message - and when that message was short the
// whole record collapsed to 101 lines reading "Work happened. Evidence: a git
// ref moved, so something was committed."
//
// IT REACHED `main`. `cycle-056.md` on `main` is that stub; the real 145-line
// log survives only on the unmerged branch `feat/privacy-terms-pages`. Cycle 56
// is the cycle that FOUND the bug - it caught 054 and 055 being clobbered,
// rescued both, and lost its own log to the same defect on the way out.
//
// And the loss is actively pushed, not merely tolerated:
// `cycle-log-reaches-git.test.ts` deliberately fails cycle N+1 until it commits
// cycle N's log, so the stub on disk is what gets added to git by a GREEN test.
//
// WHY THIS DRIVES POWERSHELL INSTEAD OF ASSERTING ON THE SOURCE TEXT
//
// Same reason `queue-parser.test.ts` gives: the code that runs overnight is the
// PowerShell. A TypeScript re-implementation, or a regex that checks the script
// no longer contains "Set-Content -Path $logFile", would be this repository's
// worst recorded defect wearing a lab coat - built, wired, reporting success,
// and never firing. Every assertion below dot-sources the shipped
// `relay-watch.ps1` with `-LoadOnly` and calls the real `Write-CycleLog`.

import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// Every test here starts a real PowerShell host. See the long note in
// `queue-parser.test.ts`: the first cold spawn costs ~5.9s on CI, well past
// vitest's 5000ms default. `powershell-timeout-budget.test.ts` fails if this
// line is removed.
vi.setConfig({ testTimeout: 30_000 });

// The budget above is a claim; this is the receipt.
it("runs under the raised time budget, not vitest's 5s default", (ctx) => {
  expect(ctx.task.timeout).toBe(30_000);
});

const REPO_ROOT = path.resolve(__dirname, "..");
const WATCHER = path.join(REPO_ROOT, "relay-watch.ps1");

// Both hosts wherever both exist: `relay-start.cmd` uses `powershell` (5.1), a
// developer shell finds `pwsh` (7.x) first, and the two differ on exactly the
// things this test touches - Get-Content's default encoding and whether a
// parenthesised read comes back PSObject-wrapped. Proving it under 7 and
// shipping to 5.1 would be testing the wrong thing. A missing host FAILS rather
// than skips: a relay test that quietly opts out is indistinguishable from one
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
      "Neither `pwsh` nor `powershell` is available, so the watcher's log writer " +
        "could not be exercised. This is a failure, not a skip.",
    );
  }
  return found;
}

const POWERSHELL_HOSTS = resolvePowerShellHosts();

let workDir: string;
let runSeq = 0;

beforeAll(() => {
  workDir = mkdtempSync(path.join(tmpdir(), "relay-cyclelog-"));
});

afterAll(() => {
  rmSync(workDir, { recursive: true, force: true });
});

interface WriteResult {
  /** What the log file held after Write-CycleLog returned. */
  content: string;
  /** True when the function reported it kept pre-existing content. */
  preserved: boolean;
  /** Byte count the function reported for what was already there. */
  bytes: number;
}

/**
 * Dot-source the real watcher with -LoadOnly and call the real Write-CycleLog
 * against a throwaway log file.
 *
 * `existing` is null to start from no file at all, which is the ordinary case
 * the function must still handle by writing normally.
 */
function writeCycleLog(shell: string, existing: string | null, lines: string[]): WriteResult {
  runSeq += 1;
  const dir = path.join(workDir, `run-${runSeq}`);
  const logPath = path.join(dir, "cycle-999.md");
  const resultPath = path.join(dir, "result.json");
  const scriptPath = path.join(dir, "harness.ps1");

  mkdirSync(dir, { recursive: true });
  if (existing !== null) writeFileSync(logPath, existing, "utf8");

  const harness = `
$ErrorActionPreference = "Stop"
. ${JSON.stringify(WATCHER)} -LoadOnly

$r = Write-CycleLog -Path ${JSON.stringify(logPath)} -Lines ${
    // Each line as its own PowerShell string literal, single-quoted with '' escaping,
    // so nothing in the fixture can be interpolated or run.
    `@(${lines.map((l) => `'${l.replace(/'/g, "''")}'`).join(", ")})`
  }

# [string] strips the PSPath/PSDrive NoteProperties Windows PowerShell 5.1 hangs
# off a parenthesised Get-Content. Without it ConvertTo-Json serialises the
# wrapper as {"value":...,"Count":...} and the assertions see an object.
[pscustomobject]@{
    content   = [string](Get-Content ${JSON.stringify(logPath)} -Raw -Encoding UTF8)
    preserved = [bool]$r.Preserved
    bytes     = [int]$r.Bytes
} | ConvertTo-Json -Depth 4 | Set-Content -Path ${JSON.stringify(resultPath)} -Encoding utf8
`;

  writeFileSync(scriptPath, harness, "utf8");
  execFileSync(shell, ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", scriptPath], {
    stdio: "pipe",
  });

  // Strip the BOM before parsing. Windows PowerShell 5.1's `Set-Content
  // -Encoding utf8` always writes one, and `JSON.parse` rejects it with
  // `Unexpected token '﻿'`. Without this the 5.1 half of the matrix fails
  // for a reason that has nothing to do with the behaviour under test - which
  // would make the host that actually runs the relay the one host not proven.
  const raw = readFileSync(resultPath, "utf8").replace(/^﻿/, "");
  return JSON.parse(raw) as WriteResult;
}

// The real thing, trimmed. Shape matters more than length: an agent log opens
// with an em-dash heading, never with the watcher's "# Cycle N - <outcome>".
const AGENT_LOG = [
  "# Cycle 62 — queue row 69",
  "",
  "## The brief was right, and I checked before I believed it",
  "",
  "`dataCollection: { }` selects DEFAULTS. Proven from the installed SDK.",
  "",
  "## Open questions for Greg",
  "",
  "1. CR-05 — Article 28 / DPA acceptance for Sentry, Resend and RocketReach.",
].join("\n");

// The watcher's half, in the order the loop builds it.
const WATCHER_LINES = [
  "# Cycle 62 - finished",
  "",
  "Work happened. Evidence: a git ref moved, so something was committed.",
  "",
  "Started 2026-08-28 09:11:56, took about 38.9 minutes.",
  "How it ended: exit code 0.",
  "",
  "## What it was asked to do",
  "",
  "Fix the Sentry data-collection block.",
  "",
  "## What it did",
  "",
  "Replaced the empty block in all three files.",
];

describe.each(POWERSHELL_HOSTS)("Write-CycleLog under %s", (shell) => {
  // THE LOAD-BEARING ASSERTION. This is the one that went red first: before the
  // fix, `Set-Content` truncated and every line of the agent's log was gone.
  it("keeps a log the cycle already wrote, byte for byte", () => {
    const result = writeCycleLog(shell, AGENT_LOG, WATCHER_LINES);

    for (const line of AGENT_LOG.split("\n").filter((l) => l.trim() !== "")) {
      expect(
        result.content,
        `the cycle's own log lost the line ${JSON.stringify(line)}. The watcher ` +
          `must never shorten a log that already has content - that is how ` +
          `cycle-056.md became a stub on main.`,
      ).toContain(line);
    }
  });

  it("reports that it preserved something, so the operator is told", () => {
    const result = writeCycleLog(shell, AGENT_LOG, WATCHER_LINES);

    expect(result.preserved).toBe(true);
    expect(
      result.bytes,
      "the function reported preserving 0 bytes while a real log was present, " +
        "so the watcher would print the wrong line and a clobber would look normal.",
    ).toBeGreaterThan(100);
  });

  it("still records the watcher's own evidence underneath", () => {
    const result = writeCycleLog(shell, AGENT_LOG, WATCHER_LINES);

    // Preserving the agent's log must not be bought by dropping the half nobody
    // can fake: exit code, timing, and the on-disk evidence verdict.
    expect(result.content).toContain("How it ended: exit code 0.");
    expect(result.content).toContain("Work happened. Evidence: a git ref moved");
    expect(result.content).toContain("## The watcher's own record of this cycle");
  });

  it("puts the cycle's own account FIRST, where Greg reads", () => {
    const result = writeCycleLog(shell, AGENT_LOG, WATCHER_LINES);

    const agentAt = result.content.indexOf("# Cycle 62 — queue row 69");
    const watcherAt = result.content.indexOf("## The watcher's own record");

    expect(agentAt).toBeGreaterThanOrEqual(0);
    expect(watcherAt).toBeGreaterThan(agentAt);
  });

  it("writes normally when there is no log yet", () => {
    const result = writeCycleLog(shell, null, WATCHER_LINES);

    expect(result.preserved).toBe(false);
    expect(result.content).toContain("# Cycle 62 - finished");
    // No preamble when there was nothing to preserve - it would be a lie.
    expect(result.content).not.toContain("The watcher's own record of this cycle");
  });

  it("writes normally over an empty file", () => {
    // A cycle that created the file and died before writing to it must not
    // saddle every future reader with a "preserved" note over nothing.
    const result = writeCycleLog(shell, "   \n\n", WATCHER_LINES);

    expect(result.preserved).toBe(false);
    expect(result.content).toContain("# Cycle 62 - finished");
  });

  it("never returns less than it was given", () => {
    // The rule stated as arithmetic, so a future refactor that "tidies" the
    // append back into a rewrite cannot pass by accident.
    const result = writeCycleLog(shell, AGENT_LOG, WATCHER_LINES);

    expect(
      result.content.length,
      "the file came back shorter than the log that was already in it.",
    ).toBeGreaterThan(AGENT_LOG.length);
  });
});
