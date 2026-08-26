// The relay watcher's own queue parser, tested against the REAL relay-watch.ps1.
//
// WHY THIS DRIVES POWERSHELL INSTEAD OF RE-IMPLEMENTING THE PARSER IN TS
//
// The obvious cheap version of this file is a TypeScript copy of the regex with
// tests around the copy. That would prove nothing: the code that actually runs
// overnight is the PowerShell, and a passing test beside an unfixed script is
// this repository's single worst recorded defect - something built, wired,
// reporting success, and never firing. So every assertion below dot-sources the
// shipped `relay-watch.ps1` with `-LoadOnly` and calls its real functions.
//
// WHAT WENT WRONG, AND WHY THE FIXTURE LOOKS LIKE THAT
//
// 2026-08-26: `Get-QueueRows` split a whole row on "|" and read the status as
// `$parts[$parts.Count - 2]`, which is only the status when the row has exactly
// four pipes. Queue item 31's status text quoted the Azure runtime string
// "NODE|20-lts". That fifth pipe shifted the columns, the status was read as the
// fragment "20-lts`. That is why it sheds...", no branch recognised it, and the
// watcher wrote a note saying the next item had an unrecognised status and idled
// for the rest of the evening behind a fully green queue.
//
// The fixture below therefore carries that exact string. It is not a made-up
// edge case; it is the row that cost a cycle.

import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

const REPO_ROOT = path.resolve(__dirname, "..");
const WATCHER = path.join(REPO_ROOT, "relay-watch.ps1");

// EVERY PowerShell host on this machine, not just the first one found.
//
// This matters more than it looks. `relay-start.cmd` launches the watcher with
// `powershell`, which on Windows is the 5.1 host - but a developer shell finds
// `pwsh` (7.x) first. Proving the parser under 7 and shipping it to 5.1 would be
// this repository's house defect wearing a lab coat: tested, green, and not the
// thing that actually runs. So both are exercised wherever both exist.
//
// On GitHub's ubuntu-latest only `pwsh` exists, so CI runs one host; on Greg's
// Windows machine - the only place the relay actually runs - it runs both. The
// cost lands exactly where the risk is.
//
// If NO host is present the tests FAIL rather than skip: a relay test that
// quietly opts out is indistinguishable from one that passes.
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
        "parser could not be exercised. This is a failure, not a skip.",
    );
  }
  return found;
}

interface QueueRow {
  Number: string;
  Item: string;
  Status: string | null;
  Parsed: boolean;
  Raw: string;
}

const POWERSHELL_HOSTS = resolvePowerShellHosts();

let workDir: string;
let runSeq = 0;

beforeAll(() => {
  workDir = mkdtempSync(path.join(tmpdir(), "relay-queue-"));
});

afterAll(() => {
  rmSync(workDir, { recursive: true, force: true });
});

/**
 * Dot-source the real watcher with -LoadOnly, repoint its file-scope paths at a
 * throwaway directory, run `body`, and hand back whatever `body` wrote to
 * $ResultPath as parsed JSON.
 *
 * Repointing works because PowerShell resolves a function's free variables
 * dynamically up the scope chain, so reassigning $QueueFile after dot-sourcing
 * is picked up by Get-QueueRows without touching the shipped script.
 *
 * Each call gets its own numbered sub-directory so one test's NEXT.md or
 * rewritten queue cannot leak into the next one's assertions.
 */
function runInWatcher(
  shell: string,
  body: string,
  queueContent: string,
): unknown {
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
$NextFile   = ${JSON.stringify(path.join(dir, "NEXT.md"))}
$NoteFile   = ${JSON.stringify(path.join(dir, "SELF-QUEUE-NOTE.md"))}
$ResultPath = ${JSON.stringify(resultPath)}
$QueuePath  = $QueueFile

function Read-IfPresent($p) {
    # The [string] cast is not decoration. Windows PowerShell 5.1 hands back a
    # PSObject-wrapped string from a parenthesised Get-Content, and its
    # ConvertTo-Json serialises that wrapper as {"value":...,"Count":...} rather
    # than as a JSON string - so the assertions see an object and the failure
    # looks like a parser fault instead of an encoding one. PowerShell 7 does not
    # do this, which is exactly why it has to be tested on both.
    if (Test-Path $p) { return [string](Get-Content $p -Raw) }
    return ""
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
    },
  );

  // Strip the byte-order mark before parsing. Windows PowerShell 5.1 writes one
  // for `-Encoding utf8` and PowerShell 7 does not, so without this the 5.1 host
  // fails every test with "Unexpected token" and it looks like a parser fault
  // rather than an encoding one. The relay hits the same difference for real -
  // it is why CURRENT.md is re-written without a BOM before being fed to the agent.
  return JSON.parse(readFileSync(resultPath, "utf8").replace(/^﻿/, ""));
}

/**
 * The rows go inside a NAMED property rather than being serialised directly.
 *
 * Windows PowerShell 5.1's ConvertTo-Json turns a bare array into
 * {"value":[...],"Count":n}, while PowerShell 7 emits a plain array - so
 * serialising the rows directly silently produces two different shapes on the
 * two hosts that actually matter. Both hosts also collapse a one-element array
 * to a bare object, hence the normalisation on the way out.
 */
function rowsFrom(shell: string, queueContent: string): QueueRow[] {
  const parsed = runInWatcher(
    shell,
    `Write-Result ([pscustomobject]@{ rows = @(Get-QueueRows) })`,
    queueContent,
  ) as { rows: QueueRow | QueueRow[] | null };

  if (!parsed.rows) return [];
  return Array.isArray(parsed.rows) ? parsed.rows : [parsed.rows];
}

// The real cell that broke the relay, kept verbatim.
const AZURE_RUNTIME_QUOTE = "1 worker, `NODE|20-lts`. That is why it sheds";
const PIPED_STATUS = `DONE 18 - the plan is B1 Basic, ${AZURE_RUNTIME_QUOTE} at ten concurrent requests.`;

// Row 30 is DONE on purpose: it puts the piped row 31 directly in the relay's
// path, so the traversal test below can only pass if row 31 is read as DONE.
const QUEUE_WITH_PIPED_STATUS = [
  "| # | Item | Status |",
  "|---|---|---|",
  "| 30 | An ordinary item with no pipes in it. | DONE 5 |",
  `| 31 | The prefetch stampede item. | ${PIPED_STATUS} |`,
  "| 32 | The item after it, which the relay never reached. | TODO |",
  "",
].join("\n");

describe.each(POWERSHELL_HOSTS)("relay queue parser under %s", (shell) => {
  describe("Get-QueueRows", () => {
    it("reads the real status when the status cell itself contains a pipe", () => {
      const row31 = rowsFrom(shell, QUEUE_WITH_PIPED_STATUS).find(
        (r) => r.Number === "31",
      );

      // The defect, stated as an assertion: the old code returned the fragment
      // after the inner pipe.
      expect(row31?.Status).not.toMatch(/^20-lts/);
      expect(row31?.Status).toBe(PIPED_STATUS);
      // And the cell must come back whole, pipe included - not truncated at it.
      expect(row31?.Status).toContain("NODE|20-lts");
      expect(row31?.Item).toBe("The prefetch stampede item.");
    });

    it("keeps the item cell intact when the ITEM contains a pipe", () => {
      const item = "Set `prefetch={false}` or use `a|b` alternation.";
      const rows = rowsFrom(
        shell,
        [
          "| # | Item | Status |",
          "|---|---|---|",
          `| 7 | ${item} | TODO |`,
          "",
        ].join("\n"),
      );

      expect(rows[0].Status).toBe("TODO");
      expect(rows[0].Item).toBe(item);
    });

    it("still reads ordinary rows, including multi-word statuses", () => {
      const rows = rowsFrom(
        shell,
        [
          "| # | Item | Status |",
          "|---|---|---|",
          "| 1 | Done thing. | DONE 4 |",
          "| 2 | Running thing. | IN PROGRESS 21 |",
          "| 3 | Stuck thing. | BLOCKED - needs Greg |",
          "| 4 | Waiting thing. | TODO |",
          "| 5 | Partly done. | PARTIAL 9 |",
          "| 6 | Never doing it. | WONTFIX |",
          "",
        ].join("\n"),
      );

      expect(rows.map((r) => r.Status)).toEqual([
        "DONE 4",
        "IN PROGRESS 21",
        "BLOCKED - needs Greg",
        "TODO",
        "PARTIAL 9",
        "WONTFIX",
      ]);
      expect(rows.every((r) => r.Parsed)).toBe(true);
    });

    // Real rows in this queue write the status in markdown bold. Item 27 was
    // "| **PARTIAL 17 - defects (1), (2) and (4) shipped...** |", and a parser
    // that anchors on the bare keyword would refuse it - a second stall of the
    // very same kind. The keyword must survive at the FRONT of the status, or
    // every `-match '^DONE'` downstream silently stops working.
    it("reads a status written in markdown bold", () => {
      const rows = rowsFrom(
        shell,
        [
          "| # | Item | Status |",
          "|---|---|---|",
          "| 27 | The nav defects item. | **PARTIAL 17 - (3) blocked on tooling.** |",
          "| 28 | Plain one. | **TODO** |",
          "",
        ].join("\n"),
      );

      expect(rows[0].Parsed).toBe(true);
      expect(rows[0].Status).toBe("PARTIAL 17 - (3) blocked on tooling.**");
      expect(rows[0].Status?.startsWith("PARTIAL")).toBe(true);
      expect(rows[1].Status?.startsWith("TODO")).toBe(true);
    });

    // Caught live, on the real QUEUE.md, by verifying instead of assuming.
    //
    // This cycle's own status quoted the parser's keyword list verbatim, so the
    // row contained a pipe sitting immediately in front of the word WONTFIX.
    // "last boundary followed by a keyword" anchored THERE, the status came back
    // as "WONTFIX), so an inner pipe...", and the relay would have re-taken an
    // item it had just finished. A real cell boundary is written " | " with
    // spaces; an inline pipe in prose or code never is.
    it("is not fooled by a status that quotes the keyword list itself", () => {
      const status =
        "DONE 21 - the status now comes from the last boundary followed by one of " +
        "TODO|DONE|BLOCKED|PARTIAL|IN PROGRESS|WONTFIX, so a tight inner pipe cannot shift it.";
      const rows = rowsFrom(
        shell,
        ["| # | Item | Status |", "|---|---|---|", `| 32 | The parser item. | ${status} |`, ""].join(
          "\n",
        ),
      );

      expect(rows[0].Status).toBe(status);
      expect(rows[0].Status?.startsWith("DONE 21")).toBe(true);
      expect(rows[0].Item).toBe("The parser item.");
    });

    // The guard that turns a formatting fault into a loud one. A row that looks
    // like a queue row but carries no recognised status must come back FLAGGED,
    // never silently dropped - a dropped row reads as "the queue ran out of work".
    it("flags a row whose status is unrecognised instead of dropping it", () => {
      const rows = rowsFrom(
        shell,
        [
          "| # | Item | Status |",
          "|---|---|---|",
          "| 9 | A row someone typo'd. | DDONE 3 |",
          "",
        ].join("\n"),
      );

      expect(rows).toHaveLength(1);
      expect(rows[0].Parsed).toBe(false);
      expect(rows[0].Raw).toContain("DDONE 3");
    });
  });

  describe("Set-QueueRowStatus", () => {
    it("rewrites a row whose status contains a pipe without destroying the cell", () => {
      const result = runInWatcher(
        shell,
        `$ok = Set-QueueRowStatus "31" "IN PROGRESS 21"
         Write-Result ([pscustomobject]@{ Ok = $ok; Text = (Read-IfPresent $QueuePath) })`,
        QUEUE_WITH_PIPED_STATUS,
      ) as { Ok: boolean; Text: string };

      expect(result.Ok).toBe(true);

      const row31 = result.Text.split(/\r?\n/).find((l) =>
        l.startsWith("| 31 "),
      );

      // The whole point: the status is replaced, and the row is still a 3-column
      // row - not one that had its second half overwritten.
      expect(row31).toContain("IN PROGRESS 21");
      expect(row31).not.toContain("DONE 18");
      expect(row31).toContain("The prefetch stampede item.");
      expect(row31?.trimEnd().endsWith("| IN PROGRESS 21 |")).toBe(true);

      // The old code wrote $parts[$parts.Count - 2], which for this row is the
      // text BEFORE the inner pipe - so it would have mangled the status cell and
      // left "20-lts" stranded as a column of its own.
      expect(row31).not.toContain("20-lts");

      // Neighbouring rows must be untouched.
      expect(result.Text).toContain(
        "| 30 | An ordinary item with no pipes in it. | DONE 5 |",
      );
      expect(result.Text).toContain(
        "| 32 | The item after it, which the relay never reached. | TODO |",
      );
    });

    it("refuses to rewrite a row it cannot parse rather than guessing", () => {
      const result = runInWatcher(
        shell,
        `$ok = Set-QueueRowStatus "9" "DONE 21"
         Write-Result ([pscustomobject]@{ Ok = $ok; Text = (Read-IfPresent $QueuePath) })`,
        [
          "| # | Item | Status |",
          "|---|---|---|",
          "| 9 | A row someone typo'd. | DDONE 3 |",
          "",
        ].join("\n"),
      ) as { Ok: boolean; Text: string };

      expect(result.Ok).toBe(false);
      expect(result.Text).toContain("DDONE 3");
    });
  });

  describe("Invoke-SelfQueue", () => {
    // Proving it FIRES, not that it exists: with the piped status parsed
    // correctly, row 31 reads as DONE and the watcher must go on to take row 32.
    // Against the old parser this refused and idled - the cycle that was lost.
    it("takes the next TODO item across a row whose status contains a pipe", () => {
      const result = runInWatcher(
        shell,
        `$took = Invoke-SelfQueue 21
         Write-Result ([pscustomobject]@{
           Took  = $took
           Brief = (Read-IfPresent $NextFile)
           Note  = (Read-IfPresent $NoteFile)
         })`,
        QUEUE_WITH_PIPED_STATUS,
      ) as { Took: boolean; Brief: string; Note: string };

      expect(result.Took).toBe(true);
      expect(result.Brief).toContain("queue item 32");
      expect(result.Note).toBe("");
    });

    // Found by replaying the real 2026-08-26 queue through the fixed parser.
    // `-match 'BLOCKED'` was an unanchored, case-insensitive substring test, so
    // row 27's "PARTIAL 17 - ... (3) blocked on tooling ..." stopped the relay on
    // a row that was not blocked. A status is what the cell STARTS with.
    it("does not treat the word 'blocked' in a status's prose as a BLOCKED row", () => {
      const result = runInWatcher(
        shell,
        `$took = Invoke-SelfQueue 21
         Write-Result ([pscustomobject]@{ Took = $took; Note = (Read-IfPresent $NoteFile) })`,
        [
          "| # | Item | Status |",
          "|---|---|---|",
          "| 27 | The nav defects item. | **PARTIAL 17 - (3) blocked on tooling.** |",
          "| 28 | The sheet syncs item. | TODO |",
          "",
        ].join("\n"),
      ) as { Took: boolean; Note: string };

      // A PARTIAL row stops the relay either way - only TODO is taken
      // automatically - so what the fix changes is the REASON Greg is given.
      // Calling a partly-done row "BLOCKED" sends him looking for a blocker that
      // does not exist.
      expect(result.Took).toBe(false);
      expect(result.Note).not.toMatch(/it is BLOCKED/);
      expect(result.Note).toContain("PARTIAL 17");
    });

    it("still stops at a row that really is BLOCKED", () => {
      const result = runInWatcher(
        shell,
        `$took = Invoke-SelfQueue 21
         Write-Result ([pscustomobject]@{ Took = $took; Note = (Read-IfPresent $NoteFile) })`,
        [
          "| # | Item | Status |",
          "|---|---|---|",
          "| 27 | Genuinely stuck. | BLOCKED - needs a decision from Greg |",
          "| 28 | Behind it. | TODO |",
          "",
        ].join("\n"),
      ) as { Took: boolean; Note: string };

      expect(result.Took).toBe(false);
      expect(result.Note).toContain("#27");
      expect(result.Note).toMatch(/BLOCKED/);
    });

    it("names the row it could not parse instead of claiming the queue is empty", () => {
      const result = runInWatcher(
        shell,
        `$took = Invoke-SelfQueue 21
         Write-Result ([pscustomobject]@{ Took = $took; Note = (Read-IfPresent $NoteFile) })`,
        [
          "| # | Item | Status |",
          "|---|---|---|",
          "| 40 | A row someone typo'd. | DDONE 3 |",
          "| 41 | The item behind it. | TODO |",
          "",
        ].join("\n"),
      ) as { Took: boolean; Note: string };

      expect(result.Took).toBe(false);
      // The note must quote the raw row, so a formatting fault reads as a
      // formatting fault rather than as an exhausted queue.
      expect(result.Note).toContain("DDONE 3");
      expect(result.Note).toContain("| 40 |");
      expect(result.Note).not.toMatch(/queue is exhausted/i);
    });
  });
});
