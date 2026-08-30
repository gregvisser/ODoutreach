#!/usr/bin/env node
/**
 * npm "prepare" script - points git at the repo-tracked hooks in `.githooks/` so
 * the pre-commit BOM guard (see `ensure-queue-bom.mjs`) runs after ANY
 * `npm install`/`npm ci`, on any machine, rather than depending on one machine
 * having been configured by hand once.
 *
 * Must never fail an install: a zip deploy, a package tarball, or a build step
 * that copies only `package.json` and runs `npm ci` before the rest of the
 * source is unpacked may have no `.git` directory at all. Every failure here is
 * swallowed and the script exits 0.
 */
import { execFileSync } from "node:child_process";

try {
  execFileSync("git", ["rev-parse", "--is-inside-work-tree"], { stdio: "ignore" });
} catch {
  process.exit(0);
}

try {
  execFileSync("git", ["config", "core.hooksPath", ".githooks"], { stdio: "ignore" });
  console.log("install-git-hooks: core.hooksPath set to .githooks");
} catch (error) {
  console.warn(`install-git-hooks: could not set core.hooksPath (${error.message}) - continuing`);
}
