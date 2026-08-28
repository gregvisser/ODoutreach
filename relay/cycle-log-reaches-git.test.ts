// A cycle's log must REACH GIT. This test fails if the log directory is
// ignored, or if a completed cycle's log was never tracked.
//
// WHY THIS EXISTS
//
// `.gitignore` used to carry `/.bidlow/relay/log/`, in the block for local and
// transient files beside `NEXT.md`, `CURRENT.md` and `STATUS.json`. That was a
// deliberate choice, not an oversight - a cycle log is a transcript, and
// transcripts are noise.
//
// It cost a cycle. On 2026-08-27 cycle 50 found a hard E2E failure as a side
// finding, wrote "I'm queueing it as a new row", and exited without doing so.
// The report existed in exactly one gitignored file. Cycle 52 then spent its
// whole reconnaissance re-deriving it from scratch.
//
// WHAT WAS MEASURED BEFORE THIS CHANGED (cycle 53)
//
//   * Secrets: ZERO across all 55 existing logs. Tracking a file puts it in the
//     object store permanently, so this was the objection that could have
//     blocked the whole idea. The Sentry DSN public key set in
//     deploy-production.yml appears in none of them; the only credential-shaped
//     string is a bare Sentry ingest HOST with no key attached.
//   * Findings lost: FOUR, not one - so the cheap "be more careful" answer was
//     not available.
//   * Volume: 55 files, 360,677 bytes, about 6.5 KB per cycle. Negligible.
//
// WHY A NAMED DIRECTORY AND NOT A GLOB OVER `.bidlow/**`
//
// The same reason `tracked-artefacts.test.ts` gives: a glob would sweep in every
// `QUEUE.md.bak-before-*` scratch file the relay drops, and the fix for a red
// test would become "add another ignore rule" instead of "commit the log".
//
// WHAT THIS TEST DOES **NOT** CLAIM
//
// Tracking a log makes it durable. It does not make anyone read it.
// `cycle-050.md` was never deleted - it is on disk to this day - and cycle 52
// still re-derived it, because the channel every cycle actually reads is
// QUEUE.md. That residual is queue row 40, deliberately left open rather than
// folded in here and quietly called fixed.

import { execFileSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const REPO_ROOT = path.resolve(__dirname, "..");
const LOG_DIR_REL = ".bidlow/relay/log";
const LOG_DIR_ABS = path.join(REPO_ROOT, ".bidlow", "relay", "log");

/** Cycle logs, by number, oldest first. */
function cycleLogs(): ReadonlyArray<{ file: string; rel: string; n: number }> {
  if (!existsSync(LOG_DIR_ABS)) return [];
  return readdirSync(LOG_DIR_ABS)
    .map((file) => ({ file, match: /^cycle-(\d+)\.md$/.exec(file) }))
    .filter((e): e is { file: string; match: RegExpExecArray } => e.match !== null)
    .map(({ file, match }) => ({
      file,
      rel: `${LOG_DIR_REL}/${file}`,
      n: Number(match[1]),
    }))
    .sort((a, b) => a.n - b.n);
}

/** True when git has this path in its index, i.e. it survives clean/rebase. */
function isTrackedByGit(relPath: string): boolean {
  try {
    execFileSync("git", ["ls-files", "--error-unmatch", "--", relPath], {
      cwd: REPO_ROOT,
      stdio: "ignore",
    });
    return true;
  } catch {
    return false;
  }
}

/** True when some .gitignore rule excludes this path. */
function isIgnoredByGit(relPath: string): boolean {
  try {
    execFileSync("git", ["check-ignore", "--quiet", "--", relPath], {
      cwd: REPO_ROOT,
      stdio: "ignore",
    });
    return true;
  } catch {
    return false;
  }
}

describe("cycle logs reach git", () => {
  // The load-bearing assertion, and the one that went red first. It is
  // deterministic: it does not depend on what happens to be on disk, so it
  // cannot cry wolf, and a gate that cries wolf gets ignored - which is how
  // this repository got here in the first place.
  it("does not ignore the cycle-log directory", () => {
    const probe = `${LOG_DIR_REL}/cycle-001.md`;

    expect(
      isIgnoredByGit(probe),
      `${probe} is excluded by a .gitignore rule, so a finding written only to ` +
        `a cycle log cannot survive a rebase or \`git clean -fd\`. That already ` +
        `cost cycle 52 an entire reconnaissance re-deriving cycle 50's finding. ` +
        `Fix by narrowing the ignore rule, not by deleting this test.`,
    ).toBe(false);
  });

  it("has a back catalogue of logs to protect", () => {
    // Without this, every assertion below passes vacuously on a checkout that
    // happens to have no logs in it - the signature defect of this repository:
    // built, wired, reporting success, never firing.
    expect(
      cycleLogs().length,
      "no cycle-NNN.md logs were found at all, so the checks in this file " +
        "would pass without testing anything.",
    ).toBeGreaterThan(10);
  });

  it("is checking against a real git repository", () => {
    const tracked = execFileSync("git", ["ls-files", "--", "relay-watch.ps1"], {
      cwd: REPO_ROOT,
      encoding: "utf8",
    }).trim();

    expect(
      tracked,
      "git returned nothing for a file known to be tracked, so the checks " +
        "above would pass vacuously. The test harness itself is broken.",
    ).toBe("relay-watch.ps1");
  });

  it("tracks every cycle log, including the previous cycle's", () => {
    // NO EXEMPTION FOR THE NEWEST LOG, and that is the whole mechanism.
    //
    // The watcher writes cycle N's log AFTER the agent has exited, so nothing
    // inside cycle N can ever commit it. It is cycle N+1 that has to, and this
    // assertion is what makes it happen: `npm test` is a mandatory gate on
    // every cycle, so cycle N+1 opens with a RED test naming cycle N's log and
    // cannot claim done until it has been added to a commit.
    //
    // WHAT THIS FORCES YOU TO COMMIT IS NOT ONLY THE WATCHER'S WRITING, AND
    // ASSUMING OTHERWISE COST A LOG.
    //
    // Until 2026-08-28 the watcher ended the cycle with `... | Set-Content -Path
    // $logFile`, onto the same filename cycles use for their OWN account of
    // themselves. Set-Content truncates, so the agent's log - the 130-230 line
    // document Greg actually reads - was destroyed and replaced by boilerplate,
    // the brief, and the agent's last stdout line. This assertion then did its
    // job on the wreckage: it went red until cycle N+1 committed the stub, so a
    // GREEN test actively pushed the loss into git. `cycle-056.md` on `main` is
    // exactly that, and it was restored by cycle 63 from
    // `feat/privacy-terms-pages`.
    //
    // The truncation is fixed in `relay-watch.ps1` (`Write-CycleLog` appends and
    // never shortens) and held by `relay/cycle-log-preserved.test.ts`. So a
    // cycle log is now TWO halves in one file: the cycle's own words first, the
    // watcher's evidence underneath. If you are here because this test is red,
    // `git add` the file - do NOT regenerate it, and do not replace it with
    // something shorter.
    //
    // That is deliberately not "the agent remembers to mirror it". Cycle 50
    // wrote "I'm queueing it as a new row" and exited without doing so, and
    // cycle 52 did the same with two hand-ups; a rule that leans on the author
    // remembering is precisely what has already failed twice here.
    //
    // Exempting the newest log would have made this test unable to fire at all:
    // during cycle N+1 the newest log IS cycle N's, so the one file that needs
    // forcing would have been the one file excused. That would have been the
    // eleventh "built, wired, reports success, never fired".
    const untracked = cycleLogs().filter((l) => !isTrackedByGit(l.rel));

    expect(
      untracked.map((l) => l.file),
      `these cycle logs exist but are NOT tracked by git, so a rebase or ` +
        `\`git clean -fd\` deletes them and any finding recorded only there ` +
        `goes with them. This is the expected state at the START of a cycle: ` +
        `the watcher wrote the previous cycle's log after that agent exited, ` +
        `and committing it is THIS cycle's job. Fix by adding them to your ` +
        `commit (\`git add ${LOG_DIR_REL}\`), not by deleting this test.`,
    ).toEqual([]);
  });
});
