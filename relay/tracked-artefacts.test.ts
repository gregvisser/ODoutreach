// The files the deck depends on must be IN GIT. This test fails if one is not.
//
// WHY THIS EXISTS
//
// On 2026-08-27 the promoted ASK answers in `.bidlow/BLUEPRINT.json` and the 21
// CLASSIFY answers in `.bidlow/CLASSIFY.json` were wiped by a rebase. They had
// only ever been written to the working tree and never committed, so there was
// nothing to restore them from. The deck showed ASK and CLASSIFY green at 06:50
// and amber again by 08:58, with nobody having changed anything on purpose. The
// answers had to be re-entered by hand.
//
// `relay-status.mjs` and `relay-status.cmd` had already been lost the same way
// once before. When this test was written, `.bidlow/DATAMODEL.json.bak` was
// tracked while the real `.bidlow/DATAMODEL.json` beside it was not - which is
// the whole failure in one line.
//
// WHY "TRACKED" IS THE BAR, AND NOT "COMMITTED AND CLEAN"
//
// The tempting stronger assertion is "no uncommitted changes". That would be
// unusable: it would go red every time somebody is halfway through editing a
// brief, and a gate that cries wolf gets ignored, which is how we got here.
//
// Tracked is the property that actually survives the two things that killed
// these files:
//
//   * `git clean -fd` deletes untracked files without asking. A tracked file is
//     untouched.
//   * A rebase silently discards untracked work. Once a file is tracked, the
//     same situation surfaces as a CONFLICT - loud, and recoverable from the
//     object store.
//
// So: every artefact below must be known to git. What its latest edits are is a
// human's business; whether it can vanish without trace is not.
//
// WHY IT IS A LIST AND NOT A GLOB
//
// A glob over `.bidlow/**` would sweep in every `QUEUE.md.bak-before-*` scratch
// file the relay drops, and the fix for a red test would become "add another
// ignore rule" instead of "commit the artefact". Naming them means adding a new
// load-bearing artefact is a deliberate act with a test line attached.

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const REPO_ROOT = path.resolve(__dirname, "..");

/**
 * Every file that something a customer sees will silently downgrade without.
 * The `why` is not decoration - it is what tells the next person whether a red
 * line here is worth stopping for.
 */
const LOAD_BEARING: ReadonlyArray<{ file: string; why: string }> = [
  {
    file: ".bidlow/BLUEPRINT.json",
    why: "the promoted ASK answers - wiped by a rebase on 2026-08-27 and re-entered by hand",
  },
  {
    file: ".bidlow/CLASSIFY.json",
    why: "the 21 CLASSIFY answers - wiped by the same rebase",
  },
  {
    file: ".bidlow/COVERAGE.json",
    why: "one of the two artefacts that make PLAN read green; without it PLAN reverts to 'not started' with no warning",
  },
  {
    file: ".bidlow/DATAMODEL.json",
    why: "the other half of PLAN reading green",
  },
  {
    file: ".bidlow/relay/QUEUE.md",
    why: "the queue itself - the relay's only memory of what is left to do",
  },
  {
    file: ".bidlow/relay/PROVE-CLOSE-OUT.md",
    why: "the brief for the PROVE close-out, traced to named files and lines",
  },
  {
    file: ".bidlow/relay/RESTART-REQUIRED.md",
    why: "records why the watcher needs restarting and what is lost if it is not",
  },
  {
    file: "relay-watch.ps1",
    why: "the watcher that runs the overnight cycles",
  },
  {
    file: "relay-start.cmd",
    why: "how the watcher is started",
  },
  {
    file: "relay-status.mjs",
    why: "builds the status deck; already lost to an untracked-file deletion once",
  },
  {
    file: "relay-status.cmd",
    why: "opens the status deck; lost alongside relay-status.mjs the same time",
  },
];

/** True when git has this path in its index (i.e. it survives clean/rebase). */
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

describe("load-bearing relay and blueprint artefacts", () => {
  it.each(LOAD_BEARING)("$file is tracked by git ($why)", ({ file, why }) => {
    expect(
      existsSync(path.join(REPO_ROOT, file)),
      `${file} is missing from the working tree entirely. It is load-bearing: ${why}.`,
    ).toBe(true);

    expect(
      isTrackedByGit(file),
      `${file} exists but is NOT tracked by git, so a rebase or \`git clean -fd\` ` +
        `deletes it with no way back. It is load-bearing: ${why}. ` +
        `Fix by committing it (\`git add ${file}\`), not by deleting this line.`,
    ).toBe(true);
  });

  it("is checking the artefacts against a real git repository", () => {
    // A guard that silently passes because git is absent would be this
    // repository's signature defect: built, wired, reporting success, never
    // firing. If git cannot answer here, that is a failure, not a skip.
    const tracked = execFileSync("git", ["ls-files", "--", "relay-watch.ps1"], {
      cwd: REPO_ROOT,
      encoding: "utf8",
    }).trim();

    expect(
      tracked,
      "git returned nothing for a file known to be tracked, so the checks above " +
        "would pass vacuously. The test harness itself is broken.",
    ).toBe("relay-watch.ps1");
  });
});
