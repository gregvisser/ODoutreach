import "server-only";

import { createHash } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { z } from "zod";
import { graphIdentityKey, graphMessageIdentity } from "./graph-message-identity";

const id = z.string().min(1).max(1000);
const iso = z.string().datetime();
const groupSchema = z.object({
  identity: z.object({ clientId: id, mailboxIdentityId: id, internetMessageId: id, fromEmail: id, receivedAt: iso }).strict(),
  rawIds: z.array(id).min(2).max(10),
  expectedFingerprints: z.record(id, z.string().regex(/^[a-f0-9]{64}$/)).optional(),
}).strict();
const manifestSchema = z.object({ version: z.literal(1), cutoffBefore: iso, groups: z.array(groupSchema).min(1).max(100) }).strict();
export type IdentityPlanManifest = z.infer<typeof manifestSchema>;
type Group = IdentityPlanManifest["groups"][number];

export function parseIdentityPlanManifest(input: unknown): IdentityPlanManifest {
  const parsed = manifestSchema.safeParse(input);
  if (!parsed.success) throw new Error("INVALID_IDENTITY_PLAN_MANIFEST");
  const seen = new Set<string>();
  const identities = new Set<string>();
  for (const group of parsed.data.groups) {
    const normalized = graphMessageIdentity({ ...group.identity, receivedDateTime: group.identity.receivedAt });
    const key = graphIdentityKey(group.identity);
    if (!normalized || graphIdentityKey(normalized) !== key || identities.has(key)) throw new Error("INVALID_IDENTITY_PLAN_MANIFEST");
    identities.add(key);
    for (const rawId of group.rawIds) {
      if (seen.has(rawId)) throw new Error("INVALID_IDENTITY_PLAN_MANIFEST");
      seen.add(rawId);
    }
    if (group.expectedFingerprints && JSON.stringify(Object.keys(group.expectedFingerprints).sort()) !== JSON.stringify([...group.rawIds].sort())) {
      throw new Error("INVALID_IDENTITY_PLAN_MANIFEST");
    }
  }
  return parsed.data;
}

const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const equalIds = (a: string[], b: string[]) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());

// Original full-row fingerprints stay inside PostgreSQL: no message body is read
// into the process. Exclude only the new mapping column so pre-migration reviewed
// fingerprints remain valid; mapping state is checked independently below.
// Equivalence additionally excludes row/locator/fetch timestamps.
const rawRowsSql = `SELECT m.id, m."providerMessageId", m."createdAt", m."supersededByMessageId",
  (SELECT count(*)::int FROM "InboundMailboxMessage" a WHERE a."supersededByMessageId" = m.id) AS "aliasCount",
  encode(sha256(convert_to((to_jsonb(m) - 'supersededByMessageId')::text, 'UTF8')), 'hex') AS fingerprint,
  encode(sha256(convert_to(jsonb_build_array(
    to_jsonb(m) - ARRAY['id','providerMessageId','createdAt','updatedAt','metadata','fullBodyFetchedAt','supersededByMessageId'],
    m.metadata - ARRAY['graphMessageId','odata','odataEtag']
  )::text, 'UTF8')), 'hex') AS equivalence,
  (m."ingestionSource" = 'MICROSOFT_GRAPH' AND m."fromEmail" = $4
    AND m."receivedAt" = $5::timestamptz AND m.metadata->>'internetMessageId' = $3) AS "identityMatches",
  coalesce(m.metadata ? 'handling', false) AS "hasHandling",
  (SELECT count(*)::int FROM jsonb_object_keys(CASE WHEN jsonb_typeof(m.metadata) = 'object' THEN m.metadata ELSE '{}'::jsonb END) k
    WHERE k NOT IN ('internetMessageId','graphMessageId','graphIdentity','odata','odataEtag')) AS "unknownMetadataCount",
  (jsonb_typeof(m.metadata) = 'object'
    AND (NOT (m.metadata ? 'graphIdentity') OR m.metadata->>'graphIdentity' = $7)
    AND NOT EXISTS (SELECT 1 FROM jsonb_each(CASE WHEN jsonb_typeof(m.metadata) = 'object' THEN m.metadata ELSE '{}'::jsonb END) e
      WHERE e.key IN ('internetMessageId','graphMessageId','graphIdentity','odata','odataEtag')
        AND jsonb_typeof(e.value) NOT IN ('string','null'))) AS "metadataValid"
  FROM "InboundMailboxMessage" m
  WHERE m."clientId" = $1 AND m."mailboxIdentityId" = $2
    AND (m.id = ANY($6::text[]) OR (m."fromEmail" = $4 AND m."receivedAt" = $5::timestamptz
      AND m.metadata->>'internetMessageId' = $3))
  ORDER BY m.id`;

type RawEvidence = {
  id: string; providerMessageId: string; createdAt: Date; fingerprint: string; equivalence: string;
  supersededByMessageId: string | null; aliasCount: number;
  identityMatches: boolean; hasHandling: boolean; unknownMetadataCount: number; metadataValid: boolean;
};

// Match nested JSON string values exactly, including arrays. No LIKE matching,
// null/empty conflation, interpolated IDs, or sender-prefilter of graphIdentity.
const referencesSql = `WITH raw_ids AS (SELECT unnest($3::text[]) AS id),
  outbound AS (SELECT o.id FROM "OutboundEmail" o WHERE EXISTS (
    SELECT 1 FROM raw_ids r WHERE jsonb_path_exists(o.metadata, '$.** ? (@ == $needle)', jsonb_build_object('needle', r.id))))
SELECT
  (SELECT count(*)::int FROM "ReplyClaim" c WHERE c."subjectType" = 'INBOUND_MESSAGE' AND c."subjectId" = ANY($3::text[])) AS claims,
  (SELECT count(*)::int FROM outbound) AS outbound,
  (SELECT count(*)::int FROM "ClientEmailSequenceStepSend" s WHERE s."outboundEmailId" IN (SELECT id FROM outbound)) AS "sequenceSends",
  (SELECT count(*)::int FROM "MailboxSendReservation" r WHERE r."outboundEmailId" IN (SELECT id FROM outbound)
    OR EXISTS (SELECT 1 FROM raw_ids x WHERE starts_with(r."idempotencyKey", 'inboundReply:' || r."clientId" || ':' || x.id || ':'))) AS reservations,
  (SELECT count(*)::int FROM "InboundReply" r WHERE r."clientId" = $1 AND r."providerMessageId" = ANY($4::text[])) AS "providerReplies",
  (SELECT count(*)::int FROM "InboundReply" r WHERE r."clientId" = $1 AND r.metadata->>'graphIdentity' = $5) AS "graphReplies",
  (SELECT count(*)::int FROM "InboundReply" r WHERE EXISTS (
    SELECT 1 FROM raw_ids x WHERE jsonb_path_exists(r.metadata, '$.** ? (@ == $needle)', jsonb_build_object('needle', x.id)))) AS "rawReplyReferences",
  (SELECT count(*)::int FROM "InboundReply" r LEFT JOIN "OutboundEmail" o ON o.id = r."linkedOutboundEmailId"
    WHERE r."clientId" = $1 AND lower(trim(r."fromEmail")) = $6 AND r."receivedAt" = $7::timestamptz
      AND (o."mailboxIdentityId" = $2 OR r.metadata->>'mailboxIdentityId' = $2
        OR (r."linkedOutboundEmailId" IS NULL AND r.metadata->>'mailboxIdentityId' IS NULL))) AS "plausibleReplies",
  (SELECT count(*)::int FROM "AuditLog" a WHERE a."entityId" = ANY($3::text[])
    OR EXISTS (SELECT 1 FROM raw_ids r WHERE jsonb_path_exists(a.metadata, '$.** ? (@ == $needle)', jsonb_build_object('needle', r.id)))
    OR (a."clientId" = $1 AND (a."entityId" = ANY($4::text[]) OR EXISTS (
      SELECT 1 FROM unnest($4::text[] || ARRAY[$5]) refs(value)
      WHERE jsonb_path_exists(a.metadata, '$.** ? (@ == $needle)', jsonb_build_object('needle', refs.value)))))) AS audits`;

type Counts = Record<"claims" | "outbound" | "sequenceSends" | "reservations" | "providerReplies" | "graphReplies" | "rawReplyReferences" | "plausibleReplies" | "audits", number>;
export type IdentityGroupPlan = {
  identityHash: string; rawIds: string[]; status: "candidate" | "blocked"; blockers: string[];
  fingerprints?: Record<string, string>; equivalenceHash?: string; counts?: Counts;
  proposedCanonicalId?: string; proposedSupersededIds?: string[];
  expectedFingerprintsProvided: boolean;
};

/** Caller owns the transaction. Both planner and installer use these exact locks/checks. */
export async function inspectIdentityGroup(db: PoolClient, group: Group, cutoffBefore: string): Promise<IdentityGroupPlan> {
  const identity = group.identity;
  const stableKey = graphIdentityKey(identity);
  const plan: IdentityGroupPlan = { identityHash: hash(stableKey), rawIds: [...group.rawIds].sort(),
    status: "blocked", blockers: [], expectedFingerprintsProvided: !!group.expectedFingerprints };
  const values = [identity.clientId, identity.mailboxIdentityId, identity.internetMessageId,
    identity.fromEmail, identity.receivedAt, group.rawIds, stableKey];
  // Same order and serializers as withReplyIdentityTransaction. Provider locks
  // are sorted, then raw-row locks. Each group uses its own short transaction.
  await db.query("SELECT pg_advisory_xact_lock(hashtext('odoutreach.graph-message'), hashtext($1))", [stableKey]);
  const discovered = await db.query<RawEvidence>(rawRowsSql, values);
  const providerIds = [...new Set(discovered.rows.map(r => r.providerMessageId))].sort();
  for (const providerId of providerIds) {
    await db.query("SELECT pg_advisory_xact_lock(hashtext('odoutreach.inbound-reply'), hashtext($1))", [JSON.stringify([identity.clientId, providerId])]);
  }
  await db.query(`SELECT id FROM "InboundMailboxMessage"
    WHERE id = ANY($1::text[]) AND "clientId" = $2 AND "mailboxIdentityId" = $3
    ORDER BY id FOR UPDATE`, [discovered.rows.map(r => r.id), identity.clientId, identity.mailboxIdentityId]);
  // Raw-ID JSON references lack FKs; freeze their tables for the fresh check.
  // NOWAIT avoids waiting behind unrelated send/audit transactions while we
  // hold raw locks. Busy/deadlocked snapshots are reported, never approved.
  await db.query(`LOCK TABLE "AuditLog", "ClientEmailSequenceStepSend", "InboundMailboxMessage",
    "InboundReply", "MailboxSendReservation", "OutboundEmail", "ReplyClaim" IN SHARE MODE NOWAIT`);
  const { rows } = await db.query<RawEvidence>(rawRowsSql, values);
  const mailbox = await db.query<{ provider: string }>('SELECT provider FROM "ClientMailboxIdentity" WHERE id=$1 AND "clientId"=$2', [identity.mailboxIdentityId, identity.clientId]);
  if (mailbox.rows[0]?.provider !== "MICROSOFT") plan.blockers.push("MAILBOX_SCOPE_MISMATCH");
  plan.fingerprints = Object.fromEntries(rows.map(r => [r.id, r.fingerprint]));
  if (!equalIds(rows.map(r => r.id), group.rawIds)) plan.blockers.push("RAW_ID_SET_CHANGED");
  if (!equalIds([...new Set(rows.map(r => r.providerMessageId))], providerIds)) plan.blockers.push("PROVIDER_ID_SET_CHANGED");
  if (rows.some(r => !r.identityMatches)) plan.blockers.push("IDENTITY_MISMATCH");
  if (rows.some(r => r.supersededByMessageId || r.aliasCount)) plan.blockers.push("MAPPING_PRESENT");
  if (new Date(identity.receivedAt) >= new Date(cutoffBefore)) plan.blockers.push("NOT_BEFORE_CUTOFF");
  if (rows.some(r => r.hasHandling)) plan.blockers.push("HANDLING_PRESENT");
  if (rows.some(r => r.unknownMetadataCount || !r.metadataValid)) plan.blockers.push("UNEXPLAINED_METADATA");
  if (new Set(rows.map(r => r.equivalence)).size !== 1) plan.blockers.push("CONTENT_NOT_EQUIVALENT");
  else plan.equivalenceHash = rows[0]?.equivalence;
  if (group.expectedFingerprints && rows.some(r => group.expectedFingerprints?.[r.id] !== r.fingerprint)) plan.blockers.push("FINGERPRINT_CHANGED");
  const references = await db.query<Counts>(referencesSql, [identity.clientId, identity.mailboxIdentityId,
    group.rawIds, providerIds, stableKey, identity.fromEmail, identity.receivedAt]);
  plan.counts = references.rows[0];
  for (const [kind, count] of Object.entries(plan.counts)) if (count > 0) plan.blockers.push(`REFERENCE_${kind.toUpperCase()}`);
  if (plan.blockers.length === 0) {
    // Age is only a reproducible tie-break AFTER content equivalence and zero
    // staff/reference evidence. It never decides which history should win.
    const canonical = [...rows].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id))[0];
    plan.status = "candidate";
    plan.proposedCanonicalId = canonical.id;
    plan.proposedSupersededIds = rows.filter(r => r.id !== canonical.id).map(r => r.id).sort();
  }
  return plan;
}

/** Rollback-only planning; no INSERT/UPDATE/DELETE, archive write, or commit path. */
export async function planIdentityConsolidation(pool: Pool, input: unknown) {
  const manifest = parseIdentityPlanManifest(input);
  const groups: IdentityGroupPlan[] = [];
  for (const group of [...manifest.groups].sort((a, b) => graphIdentityKey(a.identity).localeCompare(graphIdentityKey(b.identity)))) {
    const db = await pool.connect();
    try {
      await db.query("BEGIN ISOLATION LEVEL READ COMMITTED");
      await db.query("SET LOCAL lock_timeout = '2s'");
      await db.query("SET LOCAL statement_timeout = '5s'");
      await db.query("SET LOCAL idle_in_transaction_session_timeout = '10s'");
      await db.query("SET LOCAL TIME ZONE 'UTC'");
      groups.push(await inspectIdentityGroup(db, group, manifest.cutoffBefore));
    } catch (error) {
      const code = error && typeof error === "object" && "code" in error ? String(error.code) : "UNKNOWN";
      groups.push({ identityHash: hash(graphIdentityKey(group.identity)), rawIds: [...group.rawIds].sort(),
        status: "blocked", blockers: [["55P03", "40P01", "57014"].includes(code) ? "BUSY_OR_TIMEOUT" : "INSPECTION_FAILED"],
        expectedFingerprintsProvided: !!group.expectedFingerprints });
    } finally {
      // Never return a connection with locks or an aborted transaction to pool.
      try { await db.query("ROLLBACK"); db.release(); } catch { db.release(true); }
    }
  }
  return { version: 1, mode: "dry-run" as const, mutationCount: 0, executionAvailable: false,
    manifestHash: hash(JSON.stringify(manifest)), groups,
    executionPrerequisites: ["REVIEW_EXACT_FINGERPRINTED_PLAN", "VERIFY_CLAIM_GUARD_DEPLOYED",
      "VERIFY_RETAINED_IDENTITY_GUARDS_DEPLOYED", "REVIEW_EXACT_CANONICAL_MAPPING",
      "REVALIDATE_ALL_PREDICATES_IN_FUTURE_EXECUTION_TRANSACTION"] };
}
