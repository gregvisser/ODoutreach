#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

export const FINAL_COMMAND = 'exec env -u NODE_OPTIONS NODE_OPTIONS=--disable-sigusr1 node --disable-sigusr1 "$ACTION_PATH/dist/main.js" run-codex-exec';
const SHA_PATTERN = /^[0-9a-f]{40}$/;

export function adaptActionText(source) {
  const lines = source.split(/(?<=\n)/);
  const matches = lines.filter((line) => line.includes(FINAL_COMMAND));
  if (matches.length !== 1) {
    throw new Error(`Expected exactly one upstream final run command; found ${matches.length}`);
  }

  const index = lines.findIndex((line) => line.includes(FINAL_COMMAND));
  lines[index] = lines[index].replace(
    "exec env -u NODE_OPTIONS NODE_OPTIONS=--disable-sigusr1",
    "exec env -u NODE_OPTIONS GITHUB_OUTPUT=/dev/null GITHUB_STEP_SUMMARY=/dev/null NODE_OPTIONS=--disable-sigusr1",
  );
  // The command is the final line of the run block, so this applies only to
  // Codex's invocation and cannot hide upstream setup or proxy failures.
  const commandEnd = lines.findIndex((line, lineIndex) => lineIndex > index && /^\s*$/.test(line));
  const end = commandEnd === -1 ? lines.length : commandEnd;
  const commandLines = lines.slice(index, end);
  const last = end - 1;
  if (!commandLines.some((line) => line.trim().startsWith("--codex-user"))) {
    throw new Error("Upstream final run command shape changed; --codex-user was not found");
  }
  lines[last] = `${lines[last].replace(/\r?\n$/, "")} > /dev/null 2>&1\n`;
  return lines.join("");
}

export function verifyPinnedCheckout(actionDir, expectedSha) {
  if (!SHA_PATTERN.test(expectedSha)) throw new Error("Expected a full 40-character upstream SHA");
  const actual = execFileSync("git", ["-C", actionDir, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  if (actual !== expectedSha) throw new Error(`Upstream action SHA mismatch: expected ${expectedSha}, got ${actual}`);
  const pristine = execFileSync("git", ["-C", actionDir, "show", "HEAD:action.yml"], { encoding: "utf8" });
  if (readFileSync(resolve(actionDir, "action.yml"), "utf8") !== pristine) {
    throw new Error("Upstream action.yml is not pristine; refusing to adapt an unexpected source");
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [actionDirArg, expectedSha] = process.argv.slice(2);
  if (!actionDirArg || !expectedSha) throw new Error("Usage: adapt-codex-action.mjs <action-dir> <expected-sha>");
  const actionDir = resolve(actionDirArg);
  verifyPinnedCheckout(actionDir, expectedSha);
  const actionFile = resolve(actionDir, "action.yml");
  writeFileSync(actionFile, adaptActionText(readFileSync(actionFile, "utf8")));
}
