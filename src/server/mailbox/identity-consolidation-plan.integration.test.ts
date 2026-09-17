import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { prisma } from "@/lib/db";
import { integrationDatabaseUrl } from "@/test/integration/database";
import { graphIdentityKey } from "./graph-message-identity";
import { planIdentityConsolidation, type IdentityPlanManifest } from "./identity-consolidation-plan";

// Dedicated, per-test fixtures only. Never truncate another task's local data.
const pool = new Pool({ connectionString: integrationDatabaseUrl(), max: 4, application_name: "identity-planner-test" });
let manifest: IdentityPlanManifest;
let clientId: string;
let mailboxId: string;
let staffId: string;
let ids: string[];
const auditIds: string[] = [];

beforeEach(async () => {
  const key = randomUUID();
  clientId = `identity-client-${key}`;
  mailboxId = `identity-mailbox-${key}`;
  staffId = `identity-staff-${key}`;
  ids = [`identity-raw-a-${key}`, `identity-raw-b-${key}`];
  await prisma.client.create({ data: { id: clientId, name: "Synthetic planner fixture", slug: clientId } });
  await prisma.staffUser.create({ data: { id: staffId, entraObjectId: staffId, email: `${key}@staff.test` } });
  await prisma.clientMailboxIdentity.create({ data: { id: mailboxId, clientId, provider: "MICROSOFT", email: `${key}@mailbox.test`, emailNormalized: `${key}@mailbox.test` } });
  manifest = { version: 1, cutoffBefore: "2026-09-16T00:00:00.000Z", groups: [{
    identity: { clientId, mailboxIdentityId: mailboxId, internetMessageId: `<${key}@private.test>`, fromEmail: "private-sender@example.test", receivedAt: "2026-09-15T10:00:00.000Z" }, rawIds: ids,
  }] };
  await prisma.inboundMailboxMessage.createMany({ data: ids.map((id, index) => ({
    id, clientId, mailboxIdentityId: mailboxId, providerMessageId: `${id}-provider`, fromEmail: manifest.groups[0].identity.fromEmail,
    receivedAt: new Date(manifest.groups[0].identity.receivedAt), toEmail: "private-recipient@example.test",
    subject: "PRIVATE SUBJECT", bodyText: "PRIVATE BODY", bodyPreview: "PRIVATE PREVIEW", snippet: "PRIVATE SNIPPET",
    metadata: { internetMessageId: manifest.groups[0].identity.internetMessageId, graphMessageId: `${id}-provider` },
    createdAt: new Date(`2026-09-15T10:00:0${index}.000Z`),
  })) });
});

afterEach(async () => {
  await prisma.auditLog.deleteMany({ where: { id: { in: auditIds.splice(0) } } });
  await prisma.client.deleteMany({ where: { id: clientId } });
  await prisma.staffUser.deleteMany({ where: { id: staffId } });
});
afterAll(async () => { await prisma.$disconnect(); await pool.end(); });

const inspect = async () => (await planIdentityConsolidation(pool, manifest)).groups[0];
async function waitForPlannerLock(blockerPid: number, queryText: string) {
  const deadline = Date.now() + 1_500;
  while (Date.now() < deadline) {
    const result = await pool.query(`SELECT pid FROM pg_stat_activity WHERE application_name='identity-planner-test'
      AND wait_event_type='Lock' AND $1=ANY(pg_blocking_pids(pid)) AND query LIKE $2`, [blockerPid, `%${queryText}%`]);
    if (result.rowCount) return;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  throw new Error("Planner did not reach the expected PostgreSQL lock wait");
}

describe("rollback-only identity consolidation planning", () => {
  it("proposes one survivor only after equivalence, emits no content, and changes no rows", async () => {
    const before = await prisma.inboundMailboxMessage.findMany({ where: { clientId }, orderBy: { id: "asc" } });
    const auditCount = await prisma.auditLog.count();
    const result = await planIdentityConsolidation(pool, manifest);
    expect(result).toMatchObject({ mode: "dry-run", mutationCount: 0, executionAvailable: false });
    expect(result.groups[0]).toMatchObject({ status: "candidate", blockers: [], proposedCanonicalId: ids[0], proposedSupersededIds: [ids[1]] });
    expect(result.groups[0].fingerprints?.[ids[0]]).toMatch(/^[a-f0-9]{64}$/);
    for (const privateValue of ["PRIVATE BODY", "PRIVATE SUBJECT", "PRIVATE PREVIEW", "PRIVATE SNIPPET", "private-sender", "private-recipient", manifest.groups[0].identity.internetMessageId, `${ids[0]}-provider`]) {
      expect(JSON.stringify(result)).not.toContain(privateValue);
    }
    expect(await prisma.inboundMailboxMessage.findMany({ where: { clientId }, orderBy: { id: "asc" } })).toEqual(before);
    expect(await prisma.auditLog.count()).toBe(auditCount);
    manifest.groups[0].expectedFingerprints = result.groups[0].fingerprints;
    expect(await inspect()).toMatchObject({ status: "candidate", expectedFingerprintsProvided: true });
  });

  it("blocks an incomplete allowlist and fingerprint drift", async () => {
    const first = await inspect();
    manifest.groups[0].expectedFingerprints = first.fingerprints;
    await prisma.inboundMailboxMessage.update({ where: { id: ids[0] }, data: { fullBodyFetchedAt: new Date() } });
    expect((await inspect()).blockers).toContain("FINGERPRINT_CHANGED");
    const raw = await prisma.inboundMailboxMessage.findUniqueOrThrow({ where: { id: ids[0] } });
    await prisma.inboundMailboxMessage.create({ data: { ...raw, id: randomUUID(), providerMessageId: randomUUID(), metadata: raw.metadata ?? undefined } });
    expect(await inspect()).toMatchObject({ status: "blocked", blockers: expect.arrayContaining(["RAW_ID_SET_CHANGED"]) });
  });

  it.each([
    { bodyText: "changed" }, { snippet: "" }, { bodyContentType: "html" }, { conversationId: "different" },
  ])("blocks unequal stored content or storage descriptors: %j", async data => {
    await prisma.inboundMailboxMessage.update({ where: { id: ids[0] }, data });
    const plan = await inspect();
    expect(plan.blockers).toContain("CONTENT_NOT_EQUIVALENT");
    expect(plan.proposedCanonicalId).toBeUndefined();
  });

  it("does not treat null and empty strings as equivalent", async () => {
    await prisma.inboundMailboxMessage.updateMany({ where: { clientId }, data: { snippet: null } });
    await prisma.inboundMailboxMessage.update({ where: { id: ids[0] }, data: { snippet: "" } });
    expect((await inspect()).blockers).toContain("CONTENT_NOT_EQUIVALENT");
  });

  it.each([{ handling: null }, { unexpectedOperatorKey: "retained" }])("blocks handling and unexplained metadata: %j", async extra => {
    await prisma.inboundMailboxMessage.update({ where: { id: ids[0] }, data: { metadata: {
      internetMessageId: manifest.groups[0].identity.internetMessageId, ...extra,
    } } });
    expect((await inspect()).blockers).toContain("UNEXPLAINED_METADATA");
    if ("handling" in extra) expect((await inspect()).blockers).toContain("HANDLING_PRESENT");
  });

  it("blocks a historical claim even when already stale", async () => {
    await prisma.replyClaim.create({ data: { clientId, staffUserId: staffId, subjectType: "INBOUND_MESSAGE", subjectId: ids[1], claimedAt: new Date("2020-01-01") } });
    expect(await inspect()).toMatchObject({ status: "blocked", counts: { claims: 1 }, blockers: expect.arrayContaining(["REFERENCE_CLAIMS"]) });
  });

  it("blocks a nested raw reply reference even without matching sender or provider identity", async () => {
    await prisma.inboundReply.create({ data: { clientId, fromEmail: "different@example.test",
      receivedAt: new Date("2020-01-01"), metadata: { history: [{ inboundMessageId: ids[1] }] } } });
    expect((await inspect()).blockers).toContain("REFERENCE_RAWREPLYREFERENCES");
  });

  it.each(["FAILED", "QUEUED", "PROCESSING", "SENT"] as const)("blocks %s outbound references, including nested metadata", async status => {
    await prisma.outboundEmail.create({ data: { clientId, toEmail: "fixture@example.test", status, metadata: { nested: [{ inboundMessageId: ids[0] }] } } });
    expect((await inspect()).blockers).toContain("REFERENCE_OUTBOUND");
  });

  it("blocks a reservation with no linked outbound row", async () => {
    await prisma.mailboxSendReservation.create({ data: { clientId, mailboxIdentityId: mailboxId, windowKey: "2026-09-15", idempotencyKey: `inboundReply:${clientId}:${ids[1]}:${randomUUID()}` } });
    expect(await inspect()).toMatchObject({ counts: { reservations: 1 }, blockers: expect.arrayContaining(["REFERENCE_RESERVATIONS"]) });
  });

  it("finds exact graphIdentity replies even when sender/time differ", async () => {
    await prisma.inboundReply.create({ data: { clientId, fromEmail: "different@example.test", receivedAt: new Date("2020-01-01"), matchMethod: "UNLINKED", metadata: { graphIdentity: graphIdentityKey(manifest.groups[0].identity) } } });
    expect((await inspect()).blockers).toContain("REFERENCE_GRAPHREPLIES");
  });

  it("blocks exact provider replies and plausible legacy replies with null metadata", async () => {
    await prisma.inboundReply.create({ data: { clientId, providerMessageId: `${ids[1]}-provider`, fromEmail: manifest.groups[0].identity.fromEmail, receivedAt: new Date(manifest.groups[0].identity.receivedAt), matchMethod: "UNLINKED" } });
    expect((await inspect()).blockers).toEqual(expect.arrayContaining(["REFERENCE_PROVIDERREPLIES", "REFERENCE_PLAUSIBLEREPLIES"]));
  });

  it("finds nested audit references without clientId, including arrays", async () => {
    const audit = await prisma.auditLog.create({ data: { action: "UPDATE", entityType: "SyntheticFixture", metadata: { history: [{ old: [ids[0]] }] } } });
    auditIds.push(audit.id);
    expect((await inspect()).blockers).toContain("REFERENCE_AUDITS");
  });

  it("blocks a wrong tenant scope and the cutoff boundary", async () => {
    const originalClient = manifest.groups[0].identity.clientId;
    manifest.groups[0].identity.clientId = "missing-client";
    expect((await inspect()).blockers).toContain("RAW_ID_SET_CHANGED");
    manifest.groups[0].identity.clientId = originalClient;
    manifest.cutoffBefore = manifest.groups[0].identity.receivedAt;
    expect((await inspect()).blockers).toContain("NOT_BEFORE_CUTOFF");
  });

  it("waits for an earlier claim transaction and sees its committed claim", async () => {
    const writer = await pool.connect();
    let pending: ReturnType<typeof inspect> | undefined;
    try {
      await writer.query("BEGIN");
      const { rows: [{ pid }] } = await writer.query("SELECT pg_backend_pid() AS pid");
      await writer.query('SELECT id FROM "InboundMailboxMessage" WHERE id=$1 FOR KEY SHARE', [ids[0]]);
      pending = inspect();
      await waitForPlannerLock(pid, "FOR UPDATE");
      await writer.query('INSERT INTO "ReplyClaim" (id,"clientId","subjectType","subjectId","staffUserId","claimedAt") VALUES ($1,$2,\'INBOUND_MESSAGE\',$3,$4,now())', [randomUUID(), clientId, ids[0], staffId]);
      await writer.query("COMMIT");
      expect((await pending).blockers).toContain("REFERENCE_CLAIMS");
    } finally { await writer.query("ROLLBACK"); await pending; writer.release(); }
  });

  it("waits for the existing provider-identity protocol and sees its new reply", async () => {
    const writer = await pool.connect();
    let pending: ReturnType<typeof inspect> | undefined;
    try {
      await writer.query("BEGIN");
      const { rows: [{ pid }] } = await writer.query("SELECT pg_backend_pid() AS pid");
      const providerId = `${ids[0]}-provider`;
      await writer.query("SELECT pg_advisory_xact_lock(hashtext('odoutreach.inbound-reply'),hashtext($1))", [JSON.stringify([clientId, providerId])]);
      pending = inspect();
      await waitForPlannerLock(pid, "odoutreach.inbound-reply");
      await writer.query('INSERT INTO "InboundReply" (id,"clientId","fromEmail","receivedAt","providerMessageId","matchMethod") VALUES ($1,$2,$3,$4,$5,\'UNLINKED\')', [randomUUID(), clientId, "different@example.test", new Date(), providerId]);
      await writer.query("COMMIT");
      expect((await pending).blockers).toContain("REFERENCE_PROVIDERREPLIES");
    } finally { await writer.query("ROLLBACK"); await pending; writer.release(); }
  });

  it("reports a busy reference writer without waiting or leaving locks behind", async () => {
    const writer = await pool.connect();
    try {
      await writer.query("BEGIN");
      await writer.query('LOCK TABLE "AuditLog" IN ROW EXCLUSIVE MODE');
      expect(await inspect()).toMatchObject({ status: "blocked", blockers: ["BUSY_OR_TIMEOUT"] });
      await writer.query("COMMIT");
      expect((await inspect()).status).toBe("candidate");
    } finally { await writer.query("ROLLBACK"); writer.release(); }
  });
});
