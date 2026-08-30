// Queue row 127, 30 August 2026: QUEUE.md's UTF-8 BOM kept getting silently
// stripped by a write path outside any commit, and the existing structural test
// (`relay/queue-file-integrity.test.ts`) only ever caught it AFTER the fact, in
// CI, on an already-open pull request.
//
// This tests the actual fix: `scripts/relay/ensure-queue-bom.mjs`'s pure byte
// logic directly, and then - because a fix that merely "looks right" is this
// project's most repeated defect - drives a REAL git commit through a REAL
// pre-commit hook in a throwaway repo, to prove the hook restores a BOM that
// went missing in the working tree, rather than trusting the shell script reads
// correctly.

import { execFileSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { ensureBom, ensureFileBom } from "../scripts/relay/ensure-queue-bom.mjs";

const REPO_ROOT = path.resolve(__dirname, "..");
const BOM = Buffer.from([0xef, 0xbb, 0xbf]);

describe("ensureBom (pure buffer logic)", () => {
  it("prepends the BOM and reports changed when it is missing", () => {
    const noBom = Buffer.from("| # | Item | Status |\n", "utf8");
    const result = ensureBom(noBom);

    expect(result.changed).toBe(true);
    expect(result.buffer.subarray(0, 3)).toEqual(BOM);
    expect(result.buffer.subarray(3)).toEqual(noBom);
  });

  it("leaves an already-BOM'd buffer untouched and reports unchanged", () => {
    const withBom = Buffer.concat([BOM, Buffer.from("| # | Item | Status |\n", "utf8")]);
    const result = ensureBom(withBom);

    expect(result.changed).toBe(false);
    expect(result.buffer).toEqual(withBom);
  });

  it("never mangles multi-byte content while restoring the BOM", () => {
    // An em dash - queue row 42's own reminder of what a real encoding pass can
    // destroy. This function never decodes to a string, so it must survive whole.
    const noBom = Buffer.from("queue — rows\n", "utf8");
    const result = ensureBom(noBom);

    expect(result.buffer.toString("utf8")).toBe("﻿queue — rows\n");
  });
});

describe("ensureFileBom (file-level wrapper)", () => {
  let workDir: string;

  function makeWorkDir() {
    workDir = mkdtempSync(path.join(tmpdir(), "ensure-queue-bom-"));
    return workDir;
  }

  it("restores a missing BOM on disk and returns true", () => {
    const dir = makeWorkDir();
    const file = path.join(dir, "QUEUE.md");
    writeFileSync(file, "| # | Item | Status |\n", "utf8");

    const changed = ensureFileBom(file);

    expect(changed).toBe(true);
    expect(readFileSync(file).subarray(0, 3)).toEqual(BOM);
    rmSync(dir, { recursive: true, force: true });
  });

  it("leaves a correctly-BOM'd file untouched and returns false", () => {
    const dir = makeWorkDir();
    const file = path.join(dir, "QUEUE.md");
    writeFileSync(file, Buffer.concat([BOM, Buffer.from("| # | Item | Status |\n", "utf8")]));
    const before = readFileSync(file);

    const changed = ensureFileBom(file);

    expect(changed).toBe(false);
    expect(readFileSync(file)).toEqual(before);
    rmSync(dir, { recursive: true, force: true });
  });
});

// THE FIRES PROOF, not a description of intent.
//
// A throwaway repo, wired exactly as this one is (`core.hooksPath` pointing at a
// copy of `.githooks/pre-commit`, which shells out to the real
// `ensure-queue-bom.mjs`), then the EXACT defect this row exists for: a queue
// file written to disk with no BOM, staged, and committed. If the hook is not
// wired, or the script it calls is broken, this goes red - the same "make the
// same kind of edit the offending path makes" proof the queue row asked for.
describe("the pre-commit hook actually restores the BOM in a real commit", () => {
  it("commits QUEUE.md with its BOM even though the working-tree file had none", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "ensure-queue-bom-repo-"));
    try {
      const git = (args: string[]) =>
        execFileSync("git", args, { cwd: dir, encoding: "utf8", stdio: "pipe" });

      git(["init", "--initial-branch=main"]);
      git(["config", "user.email", "relay-test@example.invalid"]);
      git(["config", "user.name", "Relay Test"]);

      // Copy the REAL hook and the REAL script it calls - not a rewritten stand-in.
      mkdirSync(path.join(dir, ".githooks"), { recursive: true });
      mkdirSync(path.join(dir, "scripts", "relay"), { recursive: true });
      mkdirSync(path.join(dir, ".bidlow", "relay"), { recursive: true });

      const hookSrc = readFileSync(path.join(REPO_ROOT, ".githooks", "pre-commit"));
      const hookDest = path.join(dir, ".githooks", "pre-commit");
      writeFileSync(hookDest, hookSrc);
      chmodSync(hookDest, 0o755);

      writeFileSync(
        path.join(dir, "scripts", "relay", "ensure-queue-bom.mjs"),
        readFileSync(path.join(REPO_ROOT, "scripts", "relay", "ensure-queue-bom.mjs")),
      );

      git(["config", "core.hooksPath", ".githooks"]);

      // THE DEFECT ITSELF: the queue file lands on disk with no BOM, exactly the
      // state row 121/127 found twice in one day.
      const queuePath = path.join(dir, ".bidlow", "relay", "QUEUE.md");
      writeFileSync(queuePath, "| # | Item | Status |\n|---|---|---|\n| 1 | test row | TODO |\n", "utf8");
      expect(readFileSync(queuePath).subarray(0, 3)).not.toEqual(BOM);

      git(["add", "."]);
      git(["commit", "-m", "test: commit a BOM-less QUEUE.md"]);

      const committed = execFileSync("git", ["show", "HEAD:.bidlow/relay/QUEUE.md"], {
        cwd: dir,
        encoding: "buffer",
      });

      expect(committed.subarray(0, 3)).toEqual(BOM);
      expect(committed.toString("utf8")).toBe(
        "﻿| # | Item | Status |\n|---|---|---|\n| 1 | test row | TODO |\n",
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
