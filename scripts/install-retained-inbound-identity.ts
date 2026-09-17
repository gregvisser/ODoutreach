import { readFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { Pool } from "pg";
import { installRetainedInboundIdentity, parseRetainedIdentityInstallation } from "../src/server/mailbox/install-retained-inbound-identity";

async function main() {
  const { values } = parseArgs({ options: {
    manifest: { type: "string" }, "expected-installation-hash": { type: "string" }, install: { type: "boolean", default: false },
  }, strict: true, allowPositionals: false });
  if (!values.manifest) throw new Error("EXACT_MANIFEST_REQUIRED");
  const input: unknown = JSON.parse((await readFile(values.manifest, "utf8")).replace(/^\uFEFF/, ""));
  const reviewed = parseRetainedIdentityInstallation(input);
  if (!values.install) {
    // Parsing/hash preview only; use the separate rollback-only planner for DB evidence.
    process.stdout.write(JSON.stringify({ mode: "validate-only", installationHash: reviewed.installationHash,
      groups: reviewed.installation.manifest.groups.length, mutationCount: 0 }) + "\n");
    return;
  }
  if (!process.env.DATABASE_URL || !values["expected-installation-hash"]) throw new Error("DATABASE_AND_REVIEWED_HASH_REQUIRED");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1, connectionTimeoutMillis: 5_000,
    application_name: "odoutreach-retained-identity-installer" });
  try {
    const result = await installRetainedInboundIdentity(pool, input, values["expected-installation-hash"]);
    process.stdout.write(JSON.stringify(result) + "\n");
  } finally { await pool.end(); }
}
main().catch(() => {
  process.stderr.write("Retained identity installation failed or is unconfirmed. Inspect the exact mappings before any retry.\n");
  process.exitCode = 1;
});
