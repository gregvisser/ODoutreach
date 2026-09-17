import { readFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { Pool } from "pg";
import { parseIdentityPlanManifest, planIdentityConsolidation } from "../src/server/mailbox/identity-consolidation-plan";

// No execute/apply flag, no discovery mode, no default manifest or database.
async function main() {
  const { values } = parseArgs({ options: { manifest: { type: "string" } }, strict: true, allowPositionals: false });
  if (!values.manifest || !process.env.DATABASE_URL) throw new Error("MANIFEST_AND_DATABASE_URL_REQUIRED");
  const manifest = parseIdentityPlanManifest(JSON.parse((await readFile(values.manifest, "utf8")).replace(/^\uFEFF/, "")));
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1, connectionTimeoutMillis: 5_000,
    application_name: "odoutreach-identity-dry-run" });
  try {
    const plan = await planIdentityConsolidation(pool, manifest);
    process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
    if (plan.groups.some(g => g.status === "blocked")) process.exitCode = 2;
  } finally { await pool.end(); }
}

main().catch(() => {
  // Driver/parser exceptions can contain credentials, SQL or message identity.
  process.stderr.write("Identity dry run failed; verify the manifest, connection and database permissions.\n");
  process.exitCode = 1;
});
