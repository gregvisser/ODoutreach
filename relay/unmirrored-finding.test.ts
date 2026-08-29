// A finding written only into a cycle log never reaches the next cycle. This
// tests the machinery that carries it into QUEUE.md instead.
//
// WHY THIS EXISTS
//
// Cycle 53 made cycle logs TRACKED, which closed the half of the problem where a
// log could be deleted. It did not touch the other half, and said so. The proof
// that the other half is real and separate is that `cycle-050.md` was never
// deleted: it has been on disk, readable, the whole time, and cycle 52 still
// spent its entire reconnaissance re-deriving the finding inside it. Nothing
// downstream reads fifty old logs. The channel every cycle actually reads is
// QUEUE.md.
//
// Twice, a cycle said out loud that it owed the queue a row and then exited
// without writing one:
//
//   * cycle 50: "I'm queueing it as a new row rather than folding it into this
//     cycle" - under a heading literally called "Separate finding - not this
//     item". No row was ever added. Cycle 52 re-derived it from scratch.
//   * cycle 52: "Two things for you rather than for me:" - one of which was the
//     structural observation that a finding written only to a cycle log is lost.
//     No row was added for either.
//
// WHY THE FIX CANNOT BE A RULE IN THE BRIEF
//
// Both of those cycles ALREADY intended to do it. The brief telling them again
// is the same mechanism that has now failed twice. So the detection happens in
// `relay-watch.ps1`, after the agent's process has exited, where no promise is
// involved.
//
// WHY "DID QUEUE.md CHANGE" IS THE WRONG SECOND TEST
//
// The obvious close-gate is "the log states a queue intention and QUEUE.md was
// not modified". It would have caught neither case. Both cycles modified
// QUEUE.md - each stamped its OWN row to DONE on the way out. What neither did
// was add a NEW row. So the signal is the set of row NUMBERS before and after:
// mirroring a finding means a number exists that did not exist before.
//
// THE FALSE-POSITIVE BUDGET IS THE HARD PART, AND IT IS MEASURED
//
// `relay/tracked-artefacts.test.ts` argues - correctly - that a gate which cries
// wolf gets ignored, which is how this repository got here. So the detector is
// held to a measured rate over the REAL logs rather than to an opinion, and the
// count is asserted from both ends: too many firings is noise, none at all is
// this repository's signature defect (built, wired, reporting success, never
// firing).

import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// Every test here starts a real PowerShell host. See the long note in
// relay/powershell-timeout-budget.test.ts: a cold first spawn on a CI runner
// costs ~5.9s against vitest's 5000ms default, and that alone turned `main` red
// twice on 2026-08-27 with nothing broken.
vi.setConfig({ testTimeout: 30_000 });

it("runs under the raised time budget, not vitest's 5s default", (ctx) => {
  expect(ctx.task.timeout).toBe(30_000);
});

const REPO_ROOT = path.resolve(__dirname, "..");
const WATCHER = path.join(REPO_ROOT, "relay-watch.ps1");
const LOG_DIR = path.join(REPO_ROOT, ".bidlow", "relay", "log");

/** See queue-parser.test.ts - both hosts, because 5.1 is what actually runs. */
function resolvePowerShellHosts(): string[] {
  const found = ["pwsh", "powershell"].filter((candidate) => {
    try {
      execFileSync(candidate, ["-NoProfile", "-Command", "exit 0"], {
        stdio: "ignore",
      });
      return true;
    } catch {
      return false;
    }
  });

  if (found.length === 0) {
    throw new Error(
      "Neither `pwsh` nor `powershell` is available, so the relay watcher's own " +
        "handoff detector could not be exercised. This is a failure, not a skip.",
    );
  }
  return found;
}

const POWERSHELL_HOSTS = resolvePowerShellHosts();

let workDir: string;
let runSeq = 0;

beforeAll(() => {
  workDir = mkdtempSync(path.join(tmpdir(), "relay-handoff-"));
});

afterAll(() => {
  rmSync(workDir, { recursive: true, force: true });
});

interface RunHandles {
  dir: string;
  queuePath: string;
}

/**
 * Dot-source the shipped watcher with -LoadOnly, repoint $QueueFile at a
 * throwaway copy, run `body`, and hand back what `body` wrote to $ResultPath.
 *
 * Same shape as queue-parser.test.ts on purpose: the code that runs overnight is
 * the PowerShell, and a TypeScript re-implementation of the detector would prove
 * only that the copy works.
 */
function runInWatcher(
  shell: string,
  body: string,
  queueContent: string,
): { result: unknown; handles: RunHandles } {
  runSeq += 1;
  const dir = path.join(workDir, `run-${runSeq}`);
  const queuePath = path.join(dir, "QUEUE.md");
  const resultPath = path.join(dir, "result.json");
  const scriptPath = path.join(dir, "harness.ps1");

  mkdirSync(dir, { recursive: true });
  writeFileSync(queuePath, queueContent, "utf8");

  const harness = `
$ErrorActionPreference = "Stop"
. ${JSON.stringify(WATCHER)} -LoadOnly
$QueueFile  = ${JSON.stringify(queuePath)}
$LogDir     = ${JSON.stringify(LOG_DIR)}
$ResultPath = ${JSON.stringify(resultPath)}

function Read-Log($name) {
    # [string] strips the PSObject wrapper Windows PowerShell 5.1 puts round a
    # parenthesised Get-Content, which ConvertTo-Json would otherwise serialise
    # as {"value":...,"Count":...} instead of as a string.
    return [string](Get-Content (Join-Path $LogDir $name) -Raw -Encoding UTF8)
}
function Write-Result($value) {
    $value | ConvertTo-Json -Depth 6 | Set-Content -Path $ResultPath -Encoding utf8
}

${body}
`;
  writeFileSync(scriptPath, harness, "utf8");

  execFileSync(
    shell,
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", scriptPath],
    {
      stdio: "pipe",
      // The watcher emails Greg on some paths. A test suite that sends real mail
      // is a test suite people stop running - see queue-parser.test.ts.
      env: { ...process.env, RELAY_ALERT_SUPPRESS: "1" },
    },
  );

  // Strip the BOM Windows PowerShell 5.1 writes and PowerShell 7 does not.
  return {
    result: JSON.parse(readFileSync(resultPath, "utf8").replace(/^﻿/, "")),
    handles: { dir, queuePath },
  };
}

/** PowerShell 5.1 collapses a one-element array to a bare object. Normalise. */
function asArray<T>(value: T | T[] | null | undefined): T[] {
  if (value === null || value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function passagesFrom(shell: string, logName: string): string[] {
  const { result } = runInWatcher(
    shell,
    `Write-Result ([pscustomobject]@{ passages = @(Get-CycleHandoffPassages (Read-Log ${JSON.stringify(
      logName,
    )})) })`,
    MINIMAL_QUEUE,
  );
  return asArray((result as { passages: string | string[] | null }).passages);
}

// A small but REALISTIC queue: the header, a finished row, a row still to do,
// and a BLOCKED row at the bottom. The BLOCKED row is not decoration - see the
// insertion test below.
const MINIMAL_QUEUE = [
  "| # | Item | Status |",
  "|---|---|---|",
  "| 7 | Something already finished. | DONE 12 |",
  "| 8 | Something still waiting. | TODO |",
  "| 9 | Something nobody may start yet. | BLOCKED - needs Greg |",
  "",
].join("\n");

interface QueueRow {
  Number: string;
  Item: string;
  Status: string | null;
  Parsed: boolean;
  Raw: string;
}

describe.each(POWERSHELL_HOSTS)("relay handoff detector under %s", (shell) => {
  describe("Get-CycleOwnWords", () => {
    // THE FALSE POSITIVE THAT WOULD HAVE MADE THIS GATE NOISE.
    //
    // Every cycle log embeds the whole brief under "## What it was asked to do".
    // Cycle 72's brief - written by Greg, not by the cycle - contains the
    // sentence "If you believe otherwise, that is a separate finding, not this
    // cycle." Scanning the raw log would fire on the INSTRUCTION rather than on
    // anything the cycle found. Measured: 6 of 78 logs match untrimmed, 5 when
    // the brief is cut out, and cycle-072 is the difference.
    it("cuts the brief out, so an instruction cannot be read as a finding", () => {
      const { result } = runInWatcher(
        shell,
        `$own = Get-CycleOwnWords (Read-Log "cycle-072.md")
Write-Result ([pscustomobject]@{
    hasBriefPhrase = $own.Contains("that is a separate finding, not this cycle")
    length         = $own.Length
})`,
        MINIMAL_QUEUE,
      );
      const parsed = result as { hasBriefPhrase: boolean; length: number };

      expect(parsed.hasBriefPhrase).toBe(false);
      // Non-vacuity: if the trim returned an empty string every assertion in this
      // file would pass while checking nothing.
      expect(parsed.length).toBeGreaterThan(500);
    });
  });

  describe("Get-CycleHandoffPassages", () => {
    // THE TWO CASES THE QUEUE ROW NAMES, REPLAYED AS FIXTURES.
    // These are the real committed logs, not paraphrases of them. That is the
    // concrete thing cycle 53's tracking change bought.
    it("fires on the real cycle-050.md, which said it would queue a row and did not", () => {
      const passages = passagesFrom(shell, "cycle-050.md");

      expect(passages.length).toBeGreaterThan(0);
      expect(passages.join("\n")).toContain("queueing it as a new row");
    });

    it("fires on the real cycle-052.md, which handed two findings up and queued neither", () => {
      const passages = passagesFrom(shell, "cycle-052.md");

      expect(passages.length).toBeGreaterThan(0);
      expect(passages.join("\n").toLowerCase()).toContain(
        "for you rather than for me",
      );
    });

    it("stays silent on cycle-072.md, whose only match is inside the brief", () => {
      expect(passagesFrom(shell, "cycle-072.md")).toEqual([]);
    });

    // THE CRY-WOLF BUDGET, ASSERTED FROM BOTH ENDS.
    //
    // Measured at 5 of 78 logs when this was written. The ceiling is what stops
    // this becoming a gate that fires every night and gets ignored; the floor is
    // what stops a mistyped regex reporting a clean sweep while matching nothing.
    it("fires on a small minority of the real logs, not on most of them", () => {
      const { result } = runInWatcher(
        shell,
        `$fired = New-Object System.Collections.Generic.List[string]
$all   = @(Get-ChildItem -Path $LogDir -Filter "cycle-*.md" | Sort-Object Name)
foreach ($f in $all) {
    $text = [string](Get-Content $f.FullName -Raw -Encoding UTF8)
    if (@(Get-CycleHandoffPassages $text).Count -gt 0) { $fired.Add($f.Name) }
}
Write-Result ([pscustomobject]@{ fired = @($fired); total = $all.Count })`,
        MINIMAL_QUEUE,
      );
      const parsed = result as { fired: string | string[] | null; total: number };
      const fired = asArray(parsed.fired);

      expect(parsed.total).toBeGreaterThan(50);
      expect(fired).toContain("cycle-050.md");
      expect(fired).toContain("cycle-052.md");
      expect(fired.length).toBeGreaterThanOrEqual(2);
      expect(fired.length).toBeLessThanOrEqual(12);
    });
  });

  describe("Get-UnmirroredFindingVerdict", () => {
    // The whole point of the row-number delta. Both real cases WROTE to QUEUE.md
    // - they stamped their own row DONE - so "the file changed" would have said
    // everything was fine.
    it("records a finding when the cycle stated one and added no new row", () => {
      const { result } = runInWatcher(
        shell,
        `Write-Result (Get-UnmirroredFindingVerdict -LogText (Read-Log "cycle-050.md") -RowNumbersBefore @("35","36") -RowNumbersAfter @("35","36"))`,
        MINIMAL_QUEUE,
      );
      const parsed = result as { ShouldRecord: boolean; Passages: unknown };

      expect(parsed.ShouldRecord).toBe(true);
      expect(asArray(parsed.Passages as string | string[]).length).toBeGreaterThan(0);
    });

    it("stays quiet when the cycle DID add a new row", () => {
      const { result } = runInWatcher(
        shell,
        `Write-Result (Get-UnmirroredFindingVerdict -LogText (Read-Log "cycle-050.md") -RowNumbersBefore @("35","36") -RowNumbersAfter @("35","36","37"))`,
        MINIMAL_QUEUE,
      );

      expect((result as { ShouldRecord: boolean }).ShouldRecord).toBe(false);
    });

    it("stays quiet on a log that hands nothing up", () => {
      const { result } = runInWatcher(
        shell,
        `Write-Result (Get-UnmirroredFindingVerdict -LogText "# Cycle 1 - finished\`n\`nRan the gates, all green, nothing else to say." -RowNumbersBefore @("1") -RowNumbersAfter @("1"))`,
        MINIMAL_QUEUE,
      );

      expect((result as { ShouldRecord: boolean }).ShouldRecord).toBe(false);
    });
  });

  describe("Add-QueueRowForHandoff", () => {
    /** Add a row, then read the resulting file back through the REAL parser. */
    function addAndReparse(passages: string[], queue = MINIMAL_QUEUE) {
      const { result, handles } = runInWatcher(
        shell,
        `$added = Add-QueueRowForHandoff -Cycle 80 -Passages @(${passages
          .map((p) => JSON.stringify(p))
          .join(", ")}) -LogPath ".bidlow/relay/log/cycle-080.md"
Write-Result ([pscustomobject]@{ added = $added; rows = @(Get-QueueRows) })`,
        queue,
      );
      const parsed = result as {
        added: { Added: boolean; Number: string; Reason: string };
        rows: QueueRow | QueueRow[] | null;
      };
      return {
        added: parsed.added,
        rows: asArray(parsed.rows),
        queueText: readFileSync(handles.queuePath, "utf8"),
      };
    }

    // PROVING IT FIRES, NOT THAT IT EXISTS. The row is not asserted as a string;
    // it is written, then read back through Get-QueueRows - the same function the
    // picker uses tonight. A row the relay cannot read is worse than no row.
    it("writes a row the relay's own parser reads back as TODO", () => {
      const { added, rows } = addAndReparse([
        "I'm queueing it as a new row rather than folding it into this cycle.",
      ]);

      expect(added.Added).toBe(true);
      // max existing number is 9, so the new one is 10 and cannot collide.
      expect(added.Number).toBe("10");

      const written = rows.find((r) => r.Number === "10");
      expect(written?.Parsed).toBe(true);
      expect(written?.Status).toBe("TODO");
      expect(written?.Item).toContain("queueing it as a new row");
      expect(written?.Item).toContain("cycle-080.md");
    });

    // `Invoke-SelfQueue` takes the FIRST row in FILE ORDER that is not DONE and
    // not IN PROGRESS, and idles when that row is BLOCKED. Appending below the
    // BLOCKED row at the bottom of the table would bury the new finding behind a
    // permanent stop - and would go red in queue-file-integrity.test.ts, which
    // exists because exactly that nearly happened to row 48.
    it("puts the new row ABOVE any BLOCKED row, so the picker still reaches it", () => {
      const { rows } = addAndReparse(["Separate finding - not this item."]);

      const lineOf = (n: string) => rows.find((r) => r.Number === n)?.Raw ?? "";
      const order = rows.map((r) => r.Number);

      expect(order).toEqual(["7", "8", "10", "9"]);
      expect(lineOf("9")).toContain("BLOCKED");
    });

    // The queue is a pipe-delimited table and this text is arbitrary prose from a
    // cycle log. A raw pipe in the quoted words is the "NODE|20-lts" defect all
    // over again - see queue-parser.test.ts - except this time the relay would be
    // writing it itself.
    it("neutralises pipes and newlines in the cycle's words", () => {
      const { added, rows, queueText } = addAndReparse([
        "The status words are TODO | DONE | BLOCKED\nand that second line matters.",
      ]);

      expect(added.Added).toBe(true);
      const written = rows.find((r) => r.Number === "10");
      expect(written?.Parsed).toBe(true);
      expect(written?.Status).toBe("TODO");
      // One row means one line: the newline must not have split the table.
      expect(
        queueText.split(/\r?\n/).filter((l) => /^\|\s*10\s*\|/.test(l)),
      ).toHaveLength(1);
    });

    // Fail closed. If the file has no rows to anchor to, the relay must leave it
    // exactly as it found it rather than invent a table.
    it("refuses, and changes nothing, when there is no table to append to", () => {
      const empty = "# QUEUE\n\nNo table here yet.\n";
      const { added, queueText } = addAndReparse(["Separate finding."], empty);

      expect(added.Added).toBe(false);
      expect(added.Reason).toBeTruthy();
      expect(queueText).toBe(empty);
    });
  });
});
