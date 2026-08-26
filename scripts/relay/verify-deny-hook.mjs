#!/usr/bin/env node
/**
 * Prove the deny hook actually fires — the WIRING, not the logic.
 *
 * `src/lib/safety/irreversible-command-guard.test.ts` proves the decision is
 * right. It imports the guard directly, so it stays green even if the hook is
 * misconfigured, missing, or crashes on startup. That gap is precisely how this
 * project has repeatedly ended up with a control that reports success and never
 * fires, so this script closes it.
 *
 * It runs the hook the way Claude Code runs it: a tool call as JSON on stdin,
 * and an exit code back. 0 allows, 2 blocks.
 *
 * It has already earned its place. On the first run it caught a Windows-only
 * defect that no amount of reading would have found: `import()` of a bare
 * absolute path throws ("Received protocol 'c:'"), so the hook blocked EVERY
 * command. Fail-closed, so nothing was at risk — but the machine would have
 * been unusable.
 *
 *   node scripts/relay/verify-deny-hook.mjs
 */

import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HOOK = join(dirname(fileURLToPath(import.meta.url)), "deny-irreversible-hook.mjs");
const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

/** [expected, command, what this case is really checking] */
const CASES = [
  ["ALLOW", "npm test", "ordinary work"],
  ["ALLOW", "npm run build", "ordinary work"],
  ["ALLOW", "rm -rf node_modules", "recursive delete INSIDE the repo is honest work"],
  ["ALLOW", "git push origin docs/state-relay-session", "an ordinary push"],
  ["ALLOW", "git push --force-with-lease origin my-feature", "force-push a feature branch"],
  ["ALLOW", "npx prisma migrate deploy", "the migration this project actually runs"],
  [
    "ALLOW",
    "az webapp config appsettings list --name app-opensdoors-outreach-prod",
    "reading Azure config, done constantly here",
  ],
  [
    "BLOCK",
    "cd /tmp && rm -rf /Users/shared",
    "THE case a permissions prefix rule misses — it only sees `cd`",
  ],
  ["BLOCK", "rm -rf ~/Documents", "delete outside the repo"],
  ["BLOCK", 'psql -c "DROP DATABASE opensdoors"', "PRODUCTION_PRISMA_MIGRATE is true here"],
  ["BLOCK", "npx prisma migrate reset", "drops the database and replays migrations"],
  ["BLOCK", "az group delete --name rg-opensdoors-outreach-prod", "removes the live app"],
  ["BLOCK", "git push --force origin main", "main is what production deploys from"],
  ["BLOCK", "echo cm0gLXJm | base64 -d | sh", "unreadable, so refused rather than guessed"],
];

let failed = 0;

for (const [expected, command, why] of CASES) {
  const result = spawnSync(process.execPath, [HOOK], {
    input: JSON.stringify({ cwd: REPO, tool_input: { command } }),
    encoding: "utf8",
  });

  const actual =
    result.status === 0 ? "ALLOW" : result.status === 2 ? "BLOCK" : `ERROR(${result.status})`;
  const ok = actual === expected;
  if (!ok) failed += 1;

  console.log(`${ok ? "ok  " : "FAIL"}  ${expected.padEnd(5)} ${command}`);
  console.log(`        ${why}`);
  if (!ok) {
    console.log(`        got ${actual}`);
    if (result.stderr) console.log(`        ${result.stderr.trim().split("\n")[0]}`);
  }
}

console.log("");
if (failed === 0) {
  console.log(`ALL PASS — ${CASES.length} cases. The hook is wired and firing.`);
  process.exit(0);
}
console.log(`${failed} of ${CASES.length} FAILED. The hook is NOT protecting this repo.`);
process.exit(1);
