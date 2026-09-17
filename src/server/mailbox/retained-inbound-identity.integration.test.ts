import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, afterEach, beforeEach, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { closeIntegrationPool, integrationDatabaseUrl, resetIntegrationDatabase } from "@/test/integration/database";
import { persistSyncedInboundMessage, recordInboundMessageHandling } from "@/server/inbox/persist-inbound-message";
import { claimReplyForStaff } from "@/server/inbox/reply-claim";
import { replyToInboundMailboxMessage } from "@/server/inbox/reply-to-inbound-message";
import { fetchInboundMessageFullBody } from "@/server/inbox/fetch-inbound-message-full-body";
import { fetchMicrosoftInboundMessageFullBody } from "./microsoft-graph-message-body";
import { getRecentInboundMailboxMessagesForClient } from "@/server/queries/mailbox-inbox";
import { loadInboundMessageDetailForClient } from "@/server/inbox/inbound-message-detail";
import { processSyncedMessageForReply } from "./process-synced-replies";
import { syncMicrosoftInboxForMailbox } from "./mailbox-inbox-sync";
import { inspectIdentityGroup, planIdentityConsolidation, type IdentityPlanManifest } from "./identity-consolidation-plan";
import { installRetainedInboundIdentity, parseRetainedIdentityInstallation } from "./install-retained-inbound-identity";

vi.mock("@/server/ai/classify-inbound-reply", () => ({ classifyInboundReplyQuietly: vi.fn() }));
vi.mock("./microsoft-mailbox-access", () => ({ getMicrosoftGraphAccessTokenForMailbox: vi.fn(async () => "local-token") }));
vi.mock("./resolve-graph-message-id", () => ({ resolveGraphMessageId: vi.fn(async () => "resolved-provider") }));
vi.mock("./microsoft-graph-message-body", () => ({ fetchMicrosoftInboundMessageFullBody: vi.fn() }));
const pool = new Pool({ connectionString: integrationDatabaseUrl(), max: 5, application_name: "retained-identity-test" });
const identity = { clientId: "client", mailboxIdentityId: "mailbox", internetMessageId: "<original@example.test>",
  fromEmail: "prospect@example.test", receivedAt: "2026-09-15T09:00:00.000Z" };
const manifest: IdentityPlanManifest = { version: 1, cutoffBefore: "2026-09-16T00:00:00.000Z", groups: [{ identity, rawIds: ["a", "b"] }] };
beforeEach(async () => {
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("External HTTP forbidden"); }));
  vi.stubEnv("DISPLAY_DATA_CUTOFF_AT", "");
  await resetIntegrationDatabase();
  await prisma.client.create({ data: { id: "client", name: "Retained fixture", slug: "retained" } });
  await prisma.staffUser.create({ data: { id: "staff", entraObjectId: "staff", email: "staff@example.test" } });
  await prisma.clientMailboxIdentity.create({ data: { id: "mailbox", clientId: "client", provider: "MICROSOFT",
    email: "mailbox@sender.test", emailNormalized: "mailbox@sender.test", connectionStatus: "CONNECTED",
    isActive: true, canSend: true, isSendingEnabled: true } });
  await prisma.inboundMailboxMessage.createMany({ data: ["a", "b"].map((id, index) => ({
    id, clientId: "client", mailboxIdentityId: "mailbox", providerMessageId: id + "-provider",
    fromEmail: identity.fromEmail, receivedAt: new Date(identity.receivedAt), subject: "Re: Hello",
    bodyText: "Original body", metadata: { internetMessageId: identity.internetMessageId, graphMessageId: id + "-provider" },
    createdAt: new Date("2026-09-15T09:00:0" + index + "Z"),
  })) });
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.clearAllMocks(); });
afterAll(async () => { await prisma.$disconnect(); await pool.end(); await closeIntegrationPool(); });
async function reviewed() {
  const result = await planIdentityConsolidation(pool, manifest);
  expect(result.groups[0].status).toBe("candidate");
  return parseRetainedIdentityInstallation({ version: 1,
    manifest: { ...manifest, groups: [{ ...manifest.groups[0], expectedFingerprints: result.groups[0].fingerprints }] },
    canonicalByIdentityHash: { [result.groups[0].identityHash]: result.groups[0].proposedCanonicalId } });
}
async function install() { const r = await reviewed(); return installRetainedInboundIdentity(pool, r.installation, r.installationHash); }
const rows = () => prisma.inboundMailboxMessage.findMany({ orderBy: { id: "asc" } });
async function persist(providerMessageId: string, stable: typeof identity | undefined = identity) {
  const data = { clientId: "client", mailboxIdentityId: "mailbox", providerMessageId,
    fromEmail: identity.fromEmail, receivedAt: new Date(identity.receivedAt), subject: "Re: Hello" };
  return persistSyncedInboundMessage({ where: { mailboxIdentityId_providerMessageId: { mailboxIdentityId: "mailbox", providerMessageId } },
    create: data, update: { subject: data.subject } }, { internetMessageId: identity.internetMessageId, graphMessageId: providerMessageId }, stable);
}
async function waitForBlocked(pid: number, fragment: string) {
  const deadline = Date.now() + 1500;
  while (Date.now() < deadline) {
    const r = await pool.query(`SELECT pid FROM pg_stat_activity WHERE wait_event_type='Lock'
      AND $1=ANY(pg_blocking_pids(pid)) AND query LIKE $2`, [pid, "%" + fragment + "%"]);
    if (r.rowCount) return;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  throw new Error("Expected database lock wait was not observed");
}

it("installs only the reviewed mapping and retains every original byte/timestamp", async () => {
  const before = await rows();
  expect(await install()).toMatchObject({ mode: "installed", mappedRows: 1, deletedRows: 0 });
  expect(await rows()).toEqual([before[0], { ...before[1], supersededByMessageId: "a" }]);
  expect(await prisma.auditLog.count()).toBe(1);
  expect((await planIdentityConsolidation(pool, manifest)).groups[0].blockers).toContain("MAPPING_PRESENT");
  await expect(prisma.inboundMailboxMessage.update({ where: { id: "b" }, data: { bodyText: "overwrite" } })).rejects.toThrow();
  await expect(prisma.inboundMailboxMessage.delete({ where: { id: "b" } })).rejects.toThrow();
  await expect(prisma.inboundMailboxMessage.delete({ where: { id: "a" } })).rejects.toThrow();
  await expect(prisma.inboundMailboxMessage.update({ where: { id: "a" }, data: { fromEmail: "other@example.test" } })).rejects.toThrow();
  await expect(pool.query('UPDATE "InboundMailboxMessage" SET "supersededByMessageId"=NULL WHERE id=$1', ["b"])).rejects.toThrow();
});

it("preserves unmarked ambiguity; reviewed aliases converge with new Graph IDs and one reply", async () => {
  await expect(persist("moved")).rejects.toMatchObject({ reason: "RAW_AMBIGUITY" });
  await install();
  const original = (await rows())[1];
  await prisma.outboundEmail.create({ data: { id: "outbound", clientId: "client", mailboxIdentityId: "mailbox",
    toEmail: identity.fromEmail, subject: "Hello", status: "SENT", sentAt: new Date("2026-09-14"),
    rfc822MessageId: "<outbound@example.test>" } });
  await Promise.all(["a-provider", "b-provider", "moved"].map(async providerMessageId => {
    const saved = await persist(providerMessageId);
    expect(saved.providerMessageId).toBe("a-provider");
    await processSyncedMessageForReply({ ...identity, receivedAt: new Date(identity.receivedAt),
      providerMessageId: saved.providerMessageId, subject: "Re: Hello", bodyPreview: "Thanks",
      snippet: "Thanks", toEmail: "mailbox@sender.test", conversationId: null,
      inReplyToHeader: "<outbound@example.test>", graphIdentity: identity, allowUnlinkedOptOut: true });
  }));
  expect(await prisma.inboundReply.count()).toBe(1);
  expect(await prisma.inboundReply.findFirstOrThrow()).toMatchObject({ providerMessageId: "a-provider", linkedOutboundEmailId: "outbound" });
  expect(await prisma.inboundMailboxMessage.count()).toBe(2);
  expect((await rows())[1]).toEqual(original);
  expect(fetch).not.toHaveBeenCalled();
});

it("rejects alias replay without stable identity and mismatched scope/identity", async () => {
  await install();
  const before = await rows();
  // Explicit undefined must bypass the helper's default argument.
  for (const providerMessageId of ["a-provider", "b-provider", "new-id"]) {
    await expect(persistSyncedInboundMessage({
      where: { mailboxIdentityId_providerMessageId: { mailboxIdentityId: "mailbox", providerMessageId } },
      create: { clientId: "client", mailboxIdentityId: "mailbox", providerMessageId, fromEmail: identity.fromEmail, receivedAt: new Date() },
      update: { subject: "bad" },
    }, { internetMessageId: identity.internetMessageId })).rejects.toMatchObject({ code: "GRAPH_MESSAGE_IDENTITY_CONFLICT" });
  }
  await expect(persist("b-provider", { ...identity, fromEmail: "wrong@example.test" })).rejects.toMatchObject({ code: "GRAPH_MESSAGE_IDENTITY_CONFLICT" });
  expect(await rows()).toEqual(before);
});

it("hides retired originals and refuses all stale staff actions without sending", async () => {
  await install();
  const before = (await rows())[1];
  const staff = await prisma.staffUser.findUniqueOrThrow({ where: { id: "staff" } });
  const action = { staff, clientId: "client", inboundMessageId: "b" };
  expect((await getRecentInboundMailboxMessagesForClient("client", 50, { internalDomains: [] })).map(r => r.id)).toEqual(["a"]);
  expect(await loadInboundMessageDetailForClient("client", "b")).toBeNull();
  expect(await recordInboundMessageHandling({ clientId: "client", inboundMessageId: "b", staffUserId: "staff" })).toBeNull();
  await claimReplyForStaff({ clientId: "client", staffUserId: "staff", subject: { subjectType: "INBOUND_MESSAGE", subjectId: "b" } });
  expect(await prisma.replyClaim.count()).toBe(0);
  expect(await replyToInboundMailboxMessage({ ...action, bodyText: "Must not send", requestId: randomUUID() })).toMatchObject({ ok: false, errorCode: "INBOUND_NOT_FOUND" });
  expect(await fetchInboundMessageFullBody(action)).toMatchObject({ ok: false, errorCode: "INBOUND_NOT_FOUND" });
  expect(await prisma.outboundEmail.count()).toBe(0);
  expect(await prisma.mailboxSendReservation.count()).toBe(0);
  expect((await rows())[1]).toEqual(before);
  expect(fetch).not.toHaveBeenCalled();
});

it("a body fetch already in flight cannot overwrite an original after installation", async () => {
  const review = await reviewed();
  let providerStarted!: () => void;
  const started = new Promise<void>(resolve => { providerStarted = resolve; });
  let finishProvider!: () => void;
  const providerHold = new Promise<void>(resolve => { finishProvider = resolve; });
  vi.mocked(fetchMicrosoftInboundMessageFullBody).mockImplementationOnce(async () => {
    providerStarted(); await providerHold;
    return { ok: true, providerMessageId: "b-provider", normalized: { text: "Fetched changed body", contentType: "text", size: 20, truncated: false }, rawContentType: "text" };
  });
  const staff = await prisma.staffUser.findUniqueOrThrow({ where: { id: "staff" } });
  const pending = fetchInboundMessageFullBody({ staff, clientId: "client", inboundMessageId: "b" });
  await started;
  try { await installRetainedInboundIdentity(pool, review.installation, review.installationHash); }
  finally { finishProvider(); }
  expect(await pending).toMatchObject({ ok: false, errorCode: "INBOUND_NOT_FOUND" });
  expect((await rows())[1].bodyText).toBe("Original body");
});

it("a claim committed ahead of installation blocks the reviewed repair", async () => {
  const review = await reviewed();
  const db = await pool.connect();
  const pid = (await db.query("SELECT pg_backend_pid() AS pid")).rows[0].pid as number;
  await db.query("BEGIN");
  await db.query('SELECT id FROM "InboundMailboxMessage" WHERE id=$1 FOR SHARE', ["b"]);
  await db.query(`INSERT INTO "ReplyClaim"(id,"clientId","subjectType","subjectId","staffUserId","claimedAt")
    VALUES('claim','client','INBOUND_MESSAGE','b','staff',now())`);
  const attempt = installRetainedInboundIdentity(pool, review.installation, review.installationHash).then(() => "installed", () => "blocked");
  try { await waitForBlocked(pid, "FOR UPDATE"); await db.query("COMMIT"); }
  finally { await db.query("ROLLBACK"); db.release(); }
  expect(await attempt).toBe("blocked");
  expect((await rows()).every(r => !r.supersededByMessageId)).toBe(true);
});

it("a stale claim waiting behind the install row lock cannot reappear after mapping commits", async () => {
  const review = await reviewed();
  const db = await pool.connect();
  const pid = (await db.query("SELECT pg_backend_pid() AS pid")).rows[0].pid as number;
  await db.query("BEGIN");
  const checked = await inspectIdentityGroup(db, review.installation.manifest.groups[0], manifest.cutoffBefore);
  expect(checked.status).toBe("candidate");
  await db.query('UPDATE "InboundMailboxMessage" SET "supersededByMessageId"=$1 WHERE id=$2', ["a", "b"]);
  const claim = claimReplyForStaff({ clientId: "client", staffUserId: "staff", subject: { subjectType: "INBOUND_MESSAGE", subjectId: "b" } });
  try { await waitForBlocked(pid, "FOR SHARE"); await db.query("COMMIT"); }
  finally { await db.query("ROLLBACK"); db.release(); }
  await claim;
  expect(await prisma.replyClaim.count()).toBe(0);
  expect((await rows())[1].supersededByMessageId).toBe("a");
});

it("rejects changed fingerprints or a wrong approved canonical without a partial mapping", async () => {
  const r = await reviewed();
  await expect(installRetainedInboundIdentity(pool, r.installation, "0".repeat(64))).rejects.toThrow("HASH_MISMATCH");
  const wrong = parseRetainedIdentityInstallation({ ...r.installation,
    canonicalByIdentityHash: Object.fromEntries(Object.keys(r.installation.canonicalByIdentityHash).map(key => [key, "b"])) });
  await expect(installRetainedInboundIdentity(pool, wrong.installation, wrong.installationHash)).rejects.toThrow("REVALIDATION_BLOCKED");
  await prisma.inboundMailboxMessage.update({ where: { id: "b" }, data: { bodyText: "changed" } });
  await expect(installRetainedInboundIdentity(pool, r.installation, r.installationHash)).rejects.toThrow("REVALIDATION_BLOCKED");
  expect((await rows()).every(row => !row.supersededByMessageId)).toBe(true);
  expect(await prisma.auditLog.count()).toBe(0);
});

it("an incomplete provider replay waiting behind installation rechecks the newly committed mapping", async () => {
  const review = await reviewed();
  const db = await pool.connect();
  const pid = (await db.query("SELECT pg_backend_pid() AS pid")).rows[0].pid as number;
  await db.query("BEGIN");
  await inspectIdentityGroup(db, review.installation.manifest.groups[0], manifest.cutoffBefore);
  await db.query('UPDATE "InboundMailboxMessage" SET "supersededByMessageId"=$1 WHERE id=$2', ["a", "b"]);
  const pending = persistSyncedInboundMessage({
    where: { mailboxIdentityId_providerMessageId: { mailboxIdentityId: "mailbox", providerMessageId: "unverified-move" } },
    create: { clientId: "client", mailboxIdentityId: "mailbox", providerMessageId: "unverified-move",
      fromEmail: identity.fromEmail, receivedAt: new Date() }, update: {},
  }, { internetMessageId: identity.internetMessageId }).then(() => "persisted", () => "blocked");
  try { await waitForBlocked(pid, 'LOCK TABLE "InboundMailboxMessage"'); await db.query("COMMIT"); }
  finally { await db.query("ROLLBACK"); db.release(); }
  expect(await pending).toBe("blocked");
  expect(await prisma.inboundMailboxMessage.count()).toBe(2);
});

it("rejects cross-workspace mappings and chains at the database boundary", async () => {
  await prisma.client.create({ data: { id: "other", name: "Other", slug: "other" } });
  await prisma.clientMailboxIdentity.create({ data: { id: "other", clientId: "other", provider: "MICROSOFT",
    email: "other@example.test", emailNormalized: "other@example.test" } });
  await prisma.inboundMailboxMessage.create({ data: { id: "other", clientId: "other", mailboxIdentityId: "other",
    providerMessageId: "other", fromEmail: identity.fromEmail, receivedAt: new Date(identity.receivedAt),
    metadata: { internetMessageId: identity.internetMessageId } } });
  await expect(pool.query('UPDATE "InboundMailboxMessage" SET "supersededByMessageId"=$1 WHERE id=$2', ["other", "b"])).rejects.toThrow();
  await expect(pool.query('UPDATE "InboundMailboxMessage" SET "supersededByMessageId"=$1 WHERE id=$2', ["b", "b"])).rejects.toThrow();
  await install();
  await expect(pool.query('UPDATE "InboundMailboxMessage" SET "supersededByMessageId"=$1 WHERE id=$2', ["b", "a"])).rejects.toThrow();
});

it("rolls mapping back if its audit cannot commit", async () => {
  const r = await reviewed();
  await pool.query(`CREATE FUNCTION fail_retained_test() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN RAISE EXCEPTION 'synthetic audit failure'; END $$`);
  await pool.query(`CREATE TRIGGER fail_retained_test BEFORE INSERT ON "AuditLog"
    FOR EACH ROW WHEN (NEW."entityType" = 'InboundIdentitySupersession') EXECUTE FUNCTION fail_retained_test()`);
  try {
    await expect(installRetainedInboundIdentity(pool, r.installation, r.installationHash)).rejects.toThrow();
    expect((await rows()).every(row => !row.supersededByMessageId)).toBe(true);
    expect(await prisma.auditLog.count()).toBe(0);
  } finally {
    await pool.query('DROP TRIGGER fail_retained_test ON "AuditLog"');
    await pool.query("DROP FUNCTION fail_retained_test()");
  }
});

it("retains independent DNC and blocks canonical sending after the mapping", async () => {
  await prisma.suppressedEmail.create({ data: { clientId: "client", email: identity.fromEmail } });
  await install();
  const staff = await prisma.staffUser.findUniqueOrThrow({ where: { id: "staff" } });
  expect(await replyToInboundMailboxMessage({ staff, clientId: "client", inboundMessageId: "a",
    bodyText: "Must not send", requestId: randomUUID() })).toMatchObject({ ok: false, errorCode: "SUPPRESSED_RECIPIENT" });
  expect(await prisma.suppressedEmail.count()).toBe(1);
  expect(await prisma.outboundEmail.count()).toBe(0);
  expect(fetch).not.toHaveBeenCalled();
});

it("finishes the previously held sync cursor and processes a fresh opt-out once", async () => {
  await install();
  // Automatic suppression requires evidence this workspace contacted the
  // sender. A different subject deliberately does not link the historical mail.
  await prisma.outboundEmail.create({ data: { clientId: "client", mailboxIdentityId: "mailbox",
    toEmail: identity.fromEmail, subject: "Different campaign", status: "SENT", sentAt: new Date("2026-09-14") } });
  const original = (await rows())[1];
  vi.stubEnv("MAILBOX_COMPLAINT_DETECTION_ENABLED", "true");
  const oldCursor = "https://graph.microsoft.com/v1.0/users/mailbox%40sender.test/mailFolders/inbox/messages?$skiptoken=history";
  await prisma.clientMailboxIdentity.update({ where: { id: "mailbox" }, data: { inboxSyncCursor: oldCursor } });
  vi.mocked(fetch).mockImplementation(async url => new Response(JSON.stringify({ value: String(url).includes("junkemail") ? [{
    id: "new-optout", internetMessageId: "<new-optout@example.test>", receivedDateTime: "2026-09-17T09:00:00Z",
    from: { emailAddress: { address: identity.fromEmail } }, toRecipients: [{ emailAddress: { address: "mailbox@sender.test" } }],
    subject: "Unsubscribe", bodyPreview: "Please remove me",
  }] : [{
    id: "b-provider", internetMessageId: identity.internetMessageId, receivedDateTime: identity.receivedAt,
    from: { emailAddress: { address: identity.fromEmail } }, toRecipients: [{ emailAddress: { address: "mailbox@sender.test" } }],
    subject: "Re: Hello", bodyPreview: "Original body",
  }] }), { status: 200 }));
  for (let i = 0; i < 2; i++) {
    expect((await syncMicrosoftInboxForMailbox({ clientId: "client", mailboxIdentityId: "mailbox", staffUserId: null })).ok).toBe(true);
    expect((await prisma.clientMailboxIdentity.findUniqueOrThrow({ where: { id: "mailbox" } })).inboxSyncCursor).toBeNull();
    expect(await prisma.inboundReply.count()).toBe(1);
    expect(await prisma.suppressedEmail.count({ where: { clientId: "client", email: identity.fromEmail } })).toBe(1);
    expect(await prisma.inboundMailboxMessage.count()).toBe(3);
    expect(await prisma.inboundMailboxMessage.findUnique({ where: { id: "b" } })).toEqual(original);
  }
});
