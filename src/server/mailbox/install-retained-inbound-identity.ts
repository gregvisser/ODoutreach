import "server-only";
import { createHash, randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { z } from "zod";
import { graphIdentityKey } from "./graph-message-identity";
import { inspectIdentityGroup, parseIdentityPlanManifest } from "./identity-consolidation-plan";

const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const envelope = z.object({
  version: z.literal(1), manifest: z.unknown(),
  canonicalByIdentityHash: z.record(z.string().regex(/^[a-f0-9]{64}$/), z.string().min(1).max(1000)),
}).strict();

/** Separate from the rollback-only planner. No inferred/discovered execution set. */
export function parseRetainedIdentityInstallation(input: unknown) {
  const result = envelope.safeParse(input);
  if (!result.success) throw new Error("INVALID_IDENTITY_INSTALLATION");
  const manifest = parseIdentityPlanManifest(result.data.manifest);
  const keys: string[] = [];
  for (const group of manifest.groups) {
    const key = hash(graphIdentityKey(group.identity));
    keys.push(key);
    if (group.rawIds.length !== 2 || !group.expectedFingerprints ||
      !group.rawIds.includes(result.data.canonicalByIdentityHash[key])) throw new Error("EXACT_REVIEWED_PAIRS_REQUIRED");
  }
  if (JSON.stringify(keys.sort()) !== JSON.stringify(Object.keys(result.data.canonicalByIdentityHash).sort())) {
    throw new Error("EXACT_REVIEWED_PAIRS_REQUIRED");
  }
  const installation = { version: 1 as const, manifest, canonicalByIdentityHash: result.data.canonicalByIdentityHash };
  return { installation, installationHash: hash(JSON.stringify(installation)) };
}

/**
 * One all-or-nothing install, never automatically retried. All planner locks
 * remain held through fresh checks, mapping updates and the audit commit.
 * No body/handling/provider identity is merged, removed or reassociated.
 */
export async function installRetainedInboundIdentity(pool: Pool, input: unknown, expectedInstallationHash: string) {
  const { installation, installationHash } = parseRetainedIdentityInstallation(input);
  if (installationHash !== expectedInstallationHash) throw new Error("REVIEWED_INSTALLATION_HASH_MISMATCH");
  const db = await pool.connect();
  let committed = false;
  try {
    await db.query("BEGIN ISOLATION LEVEL READ COMMITTED");
    await db.query("SET LOCAL lock_timeout = '2s'");
    await db.query("SET LOCAL statement_timeout = '5s'");
    await db.query("SET LOCAL idle_in_transaction_session_timeout = '10s'");
    await db.query("SET LOCAL TIME ZONE 'UTC'");
    const checked = [];
    for (const group of [...installation.manifest.groups].sort((a, b) => graphIdentityKey(a.identity).localeCompare(graphIdentityKey(b.identity)))) {
      const plan = await inspectIdentityGroup(db, group, installation.manifest.cutoffBefore);
      if (plan.status !== "candidate" || plan.proposedCanonicalId !== installation.canonicalByIdentityHash[plan.identityHash]) {
        throw new Error("IDENTITY_INSTALLATION_REVALIDATION_BLOCKED");
      }
      checked.push({ group, plan });
    }
    // No mutation before every reviewed pair passed under retained locks.
    for (const { group, plan } of checked) {
      const updated = await db.query(`UPDATE "InboundMailboxMessage" SET "supersededByMessageId"=$1
        WHERE id=ANY($2::text[]) AND "clientId"=$3 AND "mailboxIdentityId"=$4 AND "supersededByMessageId" IS NULL`,
      [plan.proposedCanonicalId, plan.proposedSupersededIds, group.identity.clientId, group.identity.mailboxIdentityId]);
      if (updated.rowCount !== 1) throw new Error("IDENTITY_INSTALLATION_ROW_COUNT_CHANGED");
      // Identifiers/hashes only. Originals, including bytes and timestamps, remain
      // in their existing row; AuditLog does not become a private body archive.
      await db.query(`INSERT INTO "AuditLog"(id,"clientId",action,"entityType","entityId",metadata)
        VALUES($1,$2,'UPDATE','InboundIdentitySupersession',$3,$4::jsonb)`, [
        randomUUID(), group.identity.clientId, plan.proposedCanonicalId,
        JSON.stringify({ installationHash, identityHash: plan.identityHash, canonicalId: plan.proposedCanonicalId,
          supersededIds: plan.proposedSupersededIds, originalFingerprints: plan.fingerprints, equivalenceHash: plan.equivalenceHash }),
      ]);
    }
    await db.query("COMMIT");
    committed = true;
    return { mode: "installed" as const, installationHash, mappedRows: checked.length, deletedRows: 0 };
  } finally {
    // A COMMIT response loss is uncertain: caller must inspect the exact mapping,
    // not rerun. ROLLBACK is harmless if COMMIT already reached PostgreSQL.
    let destroy = false;
    if (!committed) {
      try { await db.query("ROLLBACK"); } catch { destroy = true; }
    }
    db.release(destroy);
  }
}
