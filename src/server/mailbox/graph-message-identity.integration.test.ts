import { afterAll, afterEach, beforeEach, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { resetIntegrationDatabase, closeIntegrationPool } from "@/test/integration/database";
import { persistSyncedInboundMessage, recordInboundMessageHandling } from "@/server/inbox/persist-inbound-message";
import { graphMessageIdentity, type GraphMessageIdentity } from "./graph-message-identity";
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
  await expect(persist("moved")).rejects.toThrow("ambiguous");
  expect(await prisma.inboundMailboxMessage.count()).toBe(2);
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
    graphIdentity: identity, allowUnlinkedOptOut: false })).rejects.toThrow("needs verification");
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
