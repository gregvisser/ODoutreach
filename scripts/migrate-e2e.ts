/**
 * Applies migrations to the throwaway e2e/integration database.
 *
 * Exists so the command works identically on Windows and POSIX — an inline
 * `DATABASE_URL=... npx prisma migrate deploy` npm script does not run under
 * cmd.exe. Uses only tsx + node stdlib; no new dependency.
 *
 *   npm run db:migrate:e2e
 */
import { execFileSync } from "node:child_process";

import { assertSafeTestDatabase } from "../e2e/safe-database";

const url =
  process.env.E2E_DATABASE_URL?.trim() ||
  "postgresql://e2e:e2e_local_only@localhost:5434/odoutreach_e2e?schema=public";

// Refuses anything that is not an obvious local/CI throwaway database.
assertSafeTestDatabase(url);

console.log(`Applying migrations to ${new URL(url).pathname.replace(/^\//, "")}…`);

execFileSync("npx", ["prisma", "migrate", "deploy"], {
  stdio: "inherit",
  shell: true,
  env: { ...process.env, DATABASE_URL: url },
});
