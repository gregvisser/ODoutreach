import { afterAll, afterEach, beforeEach, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { resetIntegrationDatabase, closeIntegrationPool } from "@/test/integration/database";
import { persistSyncedInboundMessage, recordInboundMessageHandling } from "@/server/inbox/persist-inbound-message";
import { graphIdentityKey, graphMessageIdentity, type GraphMessageIdentity } from "./graph-message-identity";
import { processSyncedMessageForReply } from "./process-synced-replies";
import { syncMicrosoftInboxForMailbox } from "./mailbox-inbox-sync";

vi.mock("@/server/ai/classify-inbound-reply", () => ({ classifyInboundReplyQuietly: vi.fn() }));
vi.mock("./microsoft-mailbox-access", () => ({ getMicrosoftGraphAccessTokenForMailbox: vi.fn(async () => "synthetic-token") }));

const receivedAt = new Date("2026-09-16T09:00:00Z");
const identity: GraphMessageIdentity = {
  clientId: "client", mailboxIdentityId: "mailbox", internetMessageId: "<original@example.test>",
  fromEmail: "prospect@example.test", receivedAt: receivedAt.toISOString(),
};
const reply = {
  clientId: "client", mailboxIdentityId: "mailbox", fromEmail: identity.fromEmail,
  toEmail: "sender@sender.test", subject: "Re: Hello", bodyPreview: "Thanks", snippet: "Thanks",
  receivedAt, conversationId: "conversation", inReplyToHeader: "<outbound@example.test>",
};
beforeEach(async () => {
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("External HTTP forbidden"); }));
  await resetIntegrationDatabase();
  await prisma.client.createMany({ data: [
    { id: "client", name: "Identity test", slug: "identity" }, { id: "other", name: "Other", slug: "other" },
  ] });
  await prisma.staffUser.create({ data: { id: "staff", entraObjectId: "staff", email: "staff@example.test" } });
  await prisma.clientMailboxIdentity.createMany({ data: ["mailbox", "second", "other"].map(id => ({
    id, clientId: id === "other" ? "other" : "client", provider: "MICROSOFT",
    email: id + "@sender.test", emailNormalized: id + "@sender.test", connectionStatus: "CONNECTED",
  })) });
  await prisma.outboundEmail.create({ data: {
    id: "outbound", clientId: "client", mailboxIdentityId: "mailbox", toEmail: identity.fromEmail,
    subject: "Hello", bodySnapshot: "Hello", status: "SENT", sentAt: new Date("2026-09-15T09:00Z"),
    rfc822MessageId: reply.inReplyToHeader,
  } });
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
afterAll(async () => { await prisma.$disconnect(); await closeIntegrationPool(); });

async function persist(providerMessageId: string, stable: GraphMessageIdentity | undefined = identity) {
  const data = { clientId: stable?.clientId ?? identity.clientId, mailboxIdentityId: stable?.mailboxIdentityId ?? identity.mailboxIdentityId,
    providerMessageId, fromEmail: stable?.fromEmail ?? identity.fromEmail,
    receivedAt: new Date(stable?.receivedAt ?? identity.receivedAt), ingestionSource: "MICROSOFT_GRAPH",
    subject: "Re: Hello" };
  return persistSyncedInboundMessage({
    where: { mailboxIdentityId_providerMessageId: { mailboxIdentityId: data.mailboxIdentityId, providerMessageId } },
    create: data, update: { subject: data.subject },
  }, { internetMessageId: stable?.internetMessageId ?? null, graphMessageId: providerMessageId }, stable);
}
async function ingest(providerMessageId: string) {
  const saved = await persist(providerMessageId);
  return processSyncedMessageForReply({ ...reply, providerMessageId: saved.providerMessageId,
    graphIdentity: identity, allowUnlinkedOptOut: true });
}

it("serializes concurrent first sightings with different Graph IDs into one raw message and reply", async () => {
  const results = await Promise.all([ingest("inbox-id"), ingest("junk-id")]);
  expect(results.filter(result => result.created)).toHaveLength(1);
  const raw = await prisma.inboundMailboxMessage.findFirstOrThrow();
  expect(await prisma.inboundMailboxMessage.count()).toBe(1);
  expect(await prisma.inboundReply.count()).toBe(1);
  expect(await prisma.inboundReply.findFirstOrThrow()).toMatchObject({ providerMessageId: raw.providerMessageId, linkedOutboundEmailId: "outbound" });
  expect(fetch).not.toHaveBeenCalled();
});

it("keeps historical IDs, staff handling and claim when a message moves, including a delayed old snapshot", async () => {
  await ingest("inbox-id");
  const raw = await prisma.inboundMailboxMessage.findFirstOrThrow();
  const originalReply = await prisma.inboundReply.findFirstOrThrow();
  await recordInboundMessageHandling({ clientId: "client", inboundMessageId: raw.id, staffUserId: "staff", outboundEmailId: "sent-reply" });
  await prisma.inboundReply.update({ where: { id: originalReply.id }, data: { handledAt: receivedAt, handledByStaffUserId: "staff" } });
  await prisma.replyClaim.create({ data: { clientId: "client", subjectType: "INBOUND_MESSAGE", subjectId: raw.id,
    staffUserId: "staff", claimedAt: new Date("2026-09-16T12:00Z") } });
  const before = await prisma.inboundMailboxMessage.findFirstOrThrow();
  await ingest("junk-id");
  expect(await prisma.inboundMailboxMessage.findFirstOrThrow()).toMatchObject({ id: raw.id, providerMessageId: "inbox-id",
    metadata: { graphMessageId: "junk-id", handling: (before.metadata as Record<string, unknown>).handling } });
  await ingest("inbox-id"); // An old response may commit late; provider read resolution handles its stale locator.
  expect(await prisma.inboundMailboxMessage.count()).toBe(1);
  expect(await prisma.inboundReply.findFirstOrThrow()).toMatchObject({ id: originalReply.id, providerMessageId: "inbox-id", handledAt: receivedAt });
  expect(await prisma.replyClaim.count()).toBe(1);
});

it("reuses a pre-repair raw row and reply without identity metadata or a changed campaign association", async () => {
  const raw = await prisma.inboundMailboxMessage.create({ data: { id: "legacy-raw",
    clientId: identity.clientId, mailboxIdentityId: identity.mailboxIdentityId, fromEmail: identity.fromEmail,
    receivedAt, providerMessageId: "old-id", ingestionSource: "MICROSOFT_GRAPH",
    metadata: { internetMessageId: identity.internetMessageId } } });
  await processSyncedMessageForReply({ ...reply, providerMessageId: "old-id" });
  const oldReply = await prisma.inboundReply.findFirstOrThrow();
  await ingest("moved-id");
  expect(await prisma.inboundMailboxMessage.findFirstOrThrow()).toMatchObject({ id: raw.id, providerMessageId: "old-id" });
  expect(await prisma.inboundReply.findFirstOrThrow()).toMatchObject({ id: oldReply.id, linkedOutboundEmailId: "outbound" });
  expect(await prisma.inboundReply.count()).toBe(1);
});

it.each([
  { clientId: "other", mailboxIdentityId: "other" }, { mailboxIdentityId: "second" },
  { fromEmail: "someone-else@example.test" }, { receivedAt: "2026-09-16T09:00:01.000Z" },
  { internetMessageId: "<different@example.test>" },
])("does not merge a different scoped message %j", async change => {
  await persist("first-id");
  await persist("second-id", { ...identity, ...change });
  expect(await prisma.inboundMailboxMessage.count()).toBe(2);
});

it("retains provider-ID semantics when no stable Message-ID exists", async () => {
  for (const providerMessageId of ["no-id-one", "no-id-two", "no-id-one"]) {
    await persistSyncedInboundMessage({ where: { mailboxIdentityId_providerMessageId: { mailboxIdentityId: "mailbox", providerMessageId } },
      create: { clientId: "client", mailboxIdentityId: "mailbox", providerMessageId, fromEmail: identity.fromEmail, receivedAt },
      update: {} }, {});
  }
  expect(await prisma.inboundMailboxMessage.count()).toBe(2);
});

it("rejects ambiguous historical identity without mutating either row", async () => {
  await persist("first");
  await prisma.inboundMailboxMessage.create({ data: { clientId: "client", mailboxIdentityId: "mailbox",
    providerMessageId: "duplicate", fromEmail: identity.fromEmail, receivedAt, ingestionSource: "MICROSOFT_GRAPH",
    metadata: { internetMessageId: identity.internetMessageId } } });
  await expect(persist("moved")).rejects.toMatchObject({ code: "GRAPH_MESSAGE_IDENTITY_CONFLICT", reason: "RAW_AMBIGUITY", message: expect.stringContaining("ambiguous") });
  expect(await prisma.inboundMailboxMessage.count()).toBe(2);
});

it("distinguishes an exact provider collision from raw ambiguity without changing either row", async () => {
  await persist("canonical");
  await prisma.inboundMailboxMessage.create({ data: { clientId: "client", mailboxIdentityId: "mailbox",
    providerMessageId: "incoming", fromEmail: "different@example.test", receivedAt,
    metadata: { internetMessageId: "<different@example.test>" } } });
  const before = await prisma.inboundMailboxMessage.findMany({ orderBy: { id: "asc" } });
  await expect(persist("incoming")).rejects.toMatchObject({ code: "GRAPH_MESSAGE_IDENTITY_CONFLICT", reason: "RAW_PROVIDER_CONFLICT" });
  expect(await prisma.inboundMailboxMessage.findMany({ orderBy: { id: "asc" } })).toEqual(before);
});

it("identifies ambiguous replies without mutating their saved history", async () => {
  await prisma.inboundReply.createMany({ data: ["reply-one", "reply-two"].map(providerMessageId => ({
    clientId: "client", fromEmail: identity.fromEmail, receivedAt, providerMessageId,
    metadata: { graphIdentity: graphIdentityKey(identity) },
  })) });
  const before = await prisma.inboundReply.findMany({ orderBy: { id: "asc" } });
  await expect(processSyncedMessageForReply({ ...reply, providerMessageId: "incoming", graphIdentity: identity }))
    .rejects.toMatchObject({ code: "GRAPH_MESSAGE_IDENTITY_CONFLICT", reason: "REPLY_AMBIGUITY" });
  expect(await prisma.inboundReply.findMany({ orderBy: { id: "asc" } })).toEqual(before);
});

it("identifies a conflicting reply identity without reassociating it", async () => {
  const saved = await prisma.inboundReply.create({ data: { clientId: "client", fromEmail: "different@example.test",
    receivedAt, providerMessageId: "incoming", linkedOutboundEmailId: "outbound" } });
  await expect(processSyncedMessageForReply({ ...reply, providerMessageId: "incoming", graphIdentity: identity }))
    .rejects.toMatchObject({ code: "GRAPH_MESSAGE_IDENTITY_CONFLICT", reason: "REPLY_IDENTITY_CONFLICT" });
  expect(await prisma.inboundReply.findUniqueOrThrow({ where: { id: saved.id } })).toEqual(saved);
});

it("reuses the same standalone removal review item after a folder move", async () => {
  for (const id of ["inbox-id", "junk-id"]) {
    const saved = await persist(id);
    await processSyncedMessageForReply({ ...reply, providerMessageId: saved.providerMessageId,
      subject: "Unsubscribe", bodyPreview: "Please remove me", inReplyToHeader: null,
      graphIdentity: identity, allowUnlinkedOptOut: true });
  }
  expect(await prisma.inboundMailboxMessage.count()).toBe(1);
  expect(await prisma.inboundReply.count()).toBe(1);
  expect(await prisma.inboundReply.findFirstOrThrow()).toMatchObject({ providerMessageId: "inbox-id", matchMethod: "UNLINKED", linkedOutboundEmailId: null });
});

it("recovers a committed canonical raw message when reply effects roll back", async () => {
  await prisma.$executeRawUnsafe(`CREATE FUNCTION graph_identity_test_fault() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN RAISE EXCEPTION 'identity test interruption'; END $$`);
  await prisma.$executeRawUnsafe('CREATE TRIGGER graph_identity_test_fault BEFORE UPDATE ON "OutboundEmail" FOR EACH ROW EXECUTE FUNCTION graph_identity_test_fault()');
  try {
    await expect(ingest("inbox-id")).rejects.toThrow();
    expect(await prisma.inboundMailboxMessage.count()).toBe(1);
    expect(await prisma.inboundReply.count()).toBe(0);
  } finally {
    await prisma.$executeRawUnsafe('DROP TRIGGER IF EXISTS graph_identity_test_fault ON "OutboundEmail"');
    await prisma.$executeRawUnsafe('DROP FUNCTION IF EXISTS graph_identity_test_fault()');
  }
  await ingest("junk-id");
  expect(await prisma.inboundMailboxMessage.count()).toBe(1);
  expect(await prisma.inboundReply.count()).toBe(1);
});

it("deduplicates non-owner linked replies under concurrency without retaining raw messages", async () => {
  await Promise.all(["inbox-id", "junk-id"].map(providerMessageId =>
    processSyncedMessageForReply({ ...reply, providerMessageId, graphIdentity: identity, allowUnlinkedOptOut: false })));
  expect(await prisma.inboundReply.count()).toBe(1);
  expect(await prisma.inboundMailboxMessage.count()).toBe(0);
});

it("holds an ambiguous historical non-owner reply rather than guessing or duplicating it", async () => {
  await processSyncedMessageForReply({ ...reply, providerMessageId: "old-id", allowUnlinkedOptOut: false });
  await expect(processSyncedMessageForReply({ ...reply, providerMessageId: "moved-id",
    graphIdentity: identity, allowUnlinkedOptOut: false })).rejects.toMatchObject({
      code: "GRAPH_MESSAGE_IDENTITY_CONFLICT", reason: "LEGACY_REPLY_UNVERIFIED", message: expect.stringContaining("needs verification"),
    });
  expect(await prisma.inboundReply.count()).toBe(1);
  expect(await prisma.inboundMailboxMessage.count()).toBe(0);
  // A provider-backed exact-ID replay safely enriches the historical row.
  await processSyncedMessageForReply({ ...reply, providerMessageId: "old-id", graphIdentity: identity, allowUnlinkedOptOut: false });
  await processSyncedMessageForReply({ ...reply, providerMessageId: "moved-id", graphIdentity: identity, allowUnlinkedOptOut: false });
  expect(await prisma.inboundReply.count()).toBe(1);
});

it("keeps the non-owner tenant boundary and refuses unlinked standalone requests", async () => {
  await processSyncedMessageForReply({ ...reply, clientId: "other", mailboxIdentityId: "other",
    providerMessageId: "foreign", graphIdentity: { ...identity, clientId: "other", mailboxIdentityId: "other" },
    allowUnlinkedOptOut: false });
  await processSyncedMessageForReply({ ...reply, providerMessageId: "standalone", subject: "Unsubscribe",
    bodyPreview: "Please remove me", inReplyToHeader: null, graphIdentity: identity, allowUnlinkedOptOut: false });
  expect(await prisma.inboundReply.count()).toBe(0);
});

it("syncs overlapping Inbox and Junk snapshots through the real canonicalization path", async () => {
  vi.stubEnv("MAILBOX_COMPLAINT_DETECTION_ENABLED", "false");
  vi.mocked(fetch).mockImplementation(async url => new Response(JSON.stringify({ value: [{
    id: String(url).includes("junkemail") ? "junk-id" : "inbox-id",
    from: { emailAddress: { address: identity.fromEmail } }, receivedDateTime: identity.receivedAt,
    internetMessageId: identity.internetMessageId, subject: reply.subject,
    toRecipients: [{ emailAddress: { address: reply.toEmail } }], bodyPreview: "Thanks",
    internetMessageHeaders: [{ name: "In-Reply-To", value: reply.inReplyToHeader }],
  }] }), { status: 200 }));
  expect((await syncMicrosoftInboxForMailbox({ clientId: "client", mailboxIdentityId: "mailbox", staffUserId: null })).ok).toBe(true);
  expect(await prisma.inboundMailboxMessage.count()).toBe(1);
  expect(await prisma.inboundReply.count()).toBe(1);
  expect(fetch).toHaveBeenCalledTimes(2);
});

it("does not construct a stable identity from missing or invalid provider time", () => {
  for (const receivedDateTime of [undefined, "", "invalid"]) {
    expect(graphMessageIdentity({ ...identity, receivedDateTime })).toBeUndefined();
  }
});

it("holds duplicate historical raw messages but recovers later Junk mail and keeps the old cursor on replay", async () => {
  vi.stubEnv("MAILBOX_COMPLAINT_DETECTION_ENABLED", "true");
  const oldCursor = "https://graph.microsoft.com/v1.0/users/mailbox%40sender.test/mailFolders/inbox/messages?$skiptoken=history";
  const nextCursor = oldCursor.replace("history", "later");
  await prisma.clientMailboxIdentity.update({ where: { id: "mailbox" }, data: { inboxSyncCursor: oldCursor } });
  await prisma.inboundMailboxMessage.createMany({ data: ["historical-one", "historical-two"].map(id => ({
    id, clientId: "client", mailboxIdentityId: "mailbox", providerMessageId: id,
    fromEmail: identity.fromEmail, receivedAt, ingestionSource: "MICROSOFT_GRAPH",
    metadata: { internetMessageId: identity.internetMessageId, handling: { handledAt: "2026-09-15T09:00:00Z" } },
  })) });
  const historicalBefore = await prisma.inboundMailboxMessage.findMany({ orderBy: { id: "asc" } });
  vi.mocked(fetch).mockImplementation(async url => {
    const parsed = new URL(String(url));
    if (parsed.pathname.includes("junkemail")) return new Response(JSON.stringify({ value: [{
      id: "new-junk-id", internetMessageId: "<new-junk@example.test>",
      from: { emailAddress: { address: identity.fromEmail } }, receivedDateTime: identity.receivedAt,
      toRecipients: [{ emailAddress: { address: reply.toEmail } }], subject: "Unsubscribe",
      bodyPreview: "Please remove me",
    }] }), { status: 200 });
    if (parsed.searchParams.get("$skiptoken") === "history") return new Response(JSON.stringify({
      value: [{ id: "moved-historical-id", internetMessageId: identity.internetMessageId,
        from: { emailAddress: { address: identity.fromEmail } }, receivedDateTime: identity.receivedAt,
        toRecipients: [{ emailAddress: { address: reply.toEmail } }], subject: reply.subject, bodyPreview: "Thanks" }],
      "@odata.nextLink": nextCursor,
    }), { status: 200 });
    return new Response(JSON.stringify({ value: [] }), { status: 200 });
  });
  let recoveredReplyId: string | undefined;
  for (let run = 0; run < 2; run += 1) {
    const result = await syncMicrosoftInboxForMailbox({ clientId: "client", mailboxIdentityId: "mailbox", staffUserId: null });
    expect(result).toEqual({ ok: false, error: expect.stringContaining("Checked 1 of 2 messages") });
    const mailbox = await prisma.clientMailboxIdentity.findUniqueOrThrow({ where: { id: "mailbox" } });
    expect(mailbox).toMatchObject({ inboxSyncCursor: oldCursor, connectionStatus: "CONNECTED",
      lastError: expect.stringContaining("duplicate or conflicting history") });
    expect(mailbox.lastSyncAt).not.toBeNull();
    expect(await prisma.inboundMailboxMessage.count()).toBe(3);
    expect(await prisma.inboundMailboxMessage.findMany({ where: { id: { in: ["historical-one", "historical-two"] } }, orderBy: { id: "asc" } })).toEqual(historicalBefore);
    expect(await prisma.inboundReply.count()).toBe(1);
    const recovered = await prisma.inboundReply.findFirstOrThrow();
    if (recoveredReplyId) expect(recovered.id).toBe(recoveredReplyId);
    recoveredReplyId = recovered.id;
    expect(recovered).toMatchObject({ providerMessageId: "new-junk-id", matchMethod: "UNLINKED" });
  }
  expect(await prisma.auditLog.count({ where: { entityType: "ClientMailboxIdentity",
    metadata: { path: ["errorCode"], equals: "GRAPH_MESSAGE_IDENTITY_CONFLICT" } } })).toBe(2);
  const audits = await prisma.auditLog.findMany({ where: { entityType: "ClientMailboxIdentity",
    metadata: { path: ["errorCode"], equals: "GRAPH_MESSAGE_IDENTITY_CONFLICT" } }, select: { metadata: true } });
  for (const audit of audits) {
    expect(audit.metadata).toMatchObject({ identityConflicts: 1, identityConflictReasons: { RAW_AMBIGUITY: 1 } });
    const serialized = JSON.stringify(audit.metadata);
    for (const privateValue of ["historical-one", "historical-two", "moved-historical-id", identity.internetMessageId, identity.fromEmail, "Thanks"]) {
      expect(serialized).not.toContain(privateValue);
    }
  }
  expect(await prisma.suppressedEmail.count({ where: { clientId: "client", email: identity.fromEmail } })).toBe(1);
});

it("aggregates multiple raw and reply conflict reasons while holding the cursor", async () => {
  vi.stubEnv("MAILBOX_COMPLAINT_DETECTION_ENABLED", "false");
  await prisma.inboundMailboxMessage.createMany({ data: ["raw-one", "raw-two"].map(id => ({
    id, clientId: "client", mailboxIdentityId: "mailbox", providerMessageId: id,
    fromEmail: identity.fromEmail, receivedAt, metadata: { internetMessageId: identity.internetMessageId },
  })) });
  await prisma.inboundReply.create({ data: { clientId: "client", providerMessageId: "conflicting-reply",
    fromEmail: "different@example.test", receivedAt, linkedOutboundEmailId: "outbound" } });
  vi.mocked(fetch).mockImplementation(async url => new Response(JSON.stringify({ value: String(url).includes("junkemail") ? [] : [
    { id: "raw-one", internetMessageId: identity.internetMessageId },
    { id: "raw-two", internetMessageId: identity.internetMessageId },
    { id: "conflicting-reply", internetMessageId: "<second@example.test>" },
  ].map(message => ({ ...message, from: { emailAddress: { address: identity.fromEmail } },
    receivedDateTime: identity.receivedAt, subject: reply.subject, bodyPreview: "PRIVATE BODY",
    toRecipients: [{ emailAddress: { address: reply.toEmail } }],
    internetMessageHeaders: [{ name: "In-Reply-To", value: reply.inReplyToHeader }],
  })) }), { status: 200 }));
  expect((await syncMicrosoftInboxForMailbox({ clientId: "client", mailboxIdentityId: "mailbox", staffUserId: null })).ok).toBe(false);
  const audit = await prisma.auditLog.findFirstOrThrow({ where: { entityType: "ClientMailboxIdentity",
    metadata: { path: ["errorCode"], equals: "GRAPH_MESSAGE_IDENTITY_CONFLICT" } } });
  expect(audit.metadata).toMatchObject({ identityConflicts: 3,
    identityConflictReasons: { RAW_AMBIGUITY: 2, REPLY_IDENTITY_CONFLICT: 1 } });
  const metadata = audit.metadata as { identityConflicts: number; identityConflictReasons: Record<string, number> };
  expect(Object.values(metadata.identityConflictReasons).reduce((sum, count) => sum + count, 0)).toBe(metadata.identityConflicts);
  for (const privateValue of ["raw-one", "raw-two", "conflicting-reply", "PRIVATE BODY", identity.fromEmail, identity.internetMessageId]) {
    expect(JSON.stringify(audit.metadata)).not.toContain(privateValue);
  }
  expect(await prisma.clientMailboxIdentity.findUniqueOrThrow({ where: { id: "mailbox" } })).toMatchObject({ inboxSyncCursor: null, connectionStatus: "CONNECTED" });
  expect(await prisma.inboundReply.count()).toBe(1);
});
