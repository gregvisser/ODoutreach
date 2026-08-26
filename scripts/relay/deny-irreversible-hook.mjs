#!/usr/bin/env node
/**
 * PreToolUse hook on Bash and PowerShell - refuses commands that cannot be undone.
 *
 * The decision lives in `irreversible-command-guard.mjs` next door, so it can be
 * unit tested by the normal suite (`src/lib/safety/irreversible-command-guard.test.ts`,
 * 42 tests). This file is only plumbing: read the tool call from stdin, work out
 * which branch we are on, ask the guard, then exit 0 to allow or write the reason
 * to stderr and exit 2 to block.
 *
 * WHY A HOOK AND NOT ONLY A `permissions.deny` ENTRY
 * --------------------------------------------------
 * Two reasons, and both are the difference between a control that fires and one
 * that only looks like it does:
 *
 *   1. `permissions.deny` matches a command PREFIX. `cd /tmp && rm -rf ~` reads
 *      as `cd` and sails straight through. This hook reads the whole line.
 *   2. PreToolUse hooks fire in EVERY permission mode, before permission rules
 *      are evaluated. The relay runs `--permission-mode dontAsk`, so this still
 *      applies on an unattended 3am cycle - which is exactly when it matters.
 *
 * Both layers are installed. The deny list is the cheap declarative statement of
 * intent; this is the one that actually holds.
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

function readInput() {
  try {
    const raw = readFileSync(0, "utf8");
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function git(args, cwd) {
  try {
    return execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}

const input = readInput();
const cwd = input.cwd || process.cwd();
const command = (input.tool_input && input.tool_input.command) || "";

// A tool call with no command is not this hook's business.
if (!command) process.exit(0);

// Load the guard late, so a syntax error in it fails loudly here rather than
// silently letting every command through.
//
// `pathToFileURL` is not decoration. On Windows a bare absolute path is not a
// valid ESM specifier ("Received protocol 'c:'"), so `import(join(...))` throws
// for EVERY command. It failed closed, so it was safe - but it would have
// blocked the whole machine. Reading this file did not find that; running it did.
let assessCommand;
try {
  ({ assessCommand } = await import(
    pathToFileURL(join(HERE, "irreversible-command-guard.mjs")).href
  ));
} catch (error) {
  process.stderr.write(
    "BLOCKED - the irreversible-command guard could not be loaded, so nothing " +
      `checked this command.\n\n  ${error.message}\n\n` +
      "A check that did not run is not a check that passed. Fix the guard, then retry.\n",
  );
  process.exit(2);
}

const verdict = assessCommand(command, {
  repoRoot: git(["rev-parse", "--show-toplevel"], cwd) || cwd,
  cwd,
  // null makes the git rules fail closed, which is what we want.
  currentBranch: git(["rev-parse", "--abbrev-ref", "HEAD"], cwd),
});

if (!verdict.blocked) process.exit(0);

process.stderr.write(
  "BLOCKED - this command cannot be undone.\n\n" +
    `  ${command.slice(0, 200)}\n\n` +
    `${verdict.reason}\n\n` +
    `Rule: ${verdict.rule}. Defined in scripts/relay/irreversible-command-guard.mjs.\n` +
    "If this really is the right thing to do, it needs Greg - not a workaround.\n",
);
process.exit(2);
