import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Pool } from "pg";

import { prisma } from "@/lib/db";
import { integrationDatabaseUrl, resetIntegrationDatabase, closeIntegrationPool } from "@/test/integration/database";
import { ingestInboundForClient } from "@/server/email/inbound/ingest";
import { processOutboundSendQueue } from "@/server/email/outbound/queue-processor";
import { processSyncedMessageForReply } from "./process-synced-replies";
import { syncMailboxInboxForMailbox } from "./mailbox-inbox-sync";
vi.mock("./google-mailbox-access", () => ({ getGoogleGmailAccessTokenForMailbox: vi.fn().mockResolvedValue("test-token") }));
vi.mock("./microsoft-mailbox-access", () => ({ getMicrosoftGraphAccessTokenForMailbox: vi.fn().mockResolvedValue("test-token") }));
let expectedProviderCalls = 0;

// Only advisory AI is replaced. Matching, transactions, locks, suppression,
// enrollment updates and queue dispatch guards all run against PostgreSQL.
const classify = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.mock("@/server/ai/classify-inbound-reply", () => ({ classifyInboundReplyQuietly: classify }));

const sql = new Pool({ connectionString: integrationDatabaseUrl(), max: 2 });
const receivedAt = new Date("2026-09-06T12:00:00Z");
const input = {
  clientId: "reply-client", mailboxIdentityId: "reply-mailbox",
  providerMessageId: "provider-reply", fromEmail: "prospect@example.test",
  toEmail: "sender@sender.test", subject: "Re: Hello", snippet: "Thanks",
  bodyPreview: "Thanks", bodyText: "Thanks\n\nSTOP",
  receivedAt, conversationId: "thread", inReplyToHeader: "<original@example.test>",
};
const webhook = {
  clientId: input.clientId, ingestionSource: "webhook",
  payload: { ...input, inReplyToProviderId: "provider-original", receivedAt: receivedAt.toISOString() },
};

async function seed() {
  await prisma.client.createMany({ data: [
    { id: input.clientId, name: "Reply test", slug: "reply-test", status: "ACTIVE" },
    { id: "other-client", name: "Other client", slug: "other-client", status: "ACTIVE" },
  ] });
  await prisma.clientMailboxIdentity.create({ data: {
    id: input.mailboxIdentityId, clientId: input.clientId, provider: "GOOGLE",
    email: input.toEmail, emailNormalized: input.toEmail, connectionStatus: "CONNECTED",
  } });
  await prisma.contact.createMany({ data: [
    { id: "reply-contact", clientId: input.clientId, email: input.fromEmail },
    { id: "other-contact", clientId: "other-client", email: input.fromEmail },
  ] });
  await prisma.contactList.create({ data: { id: "reply-list", clientId: input.clientId, name: "Test list" } });
  await prisma.clientEmailTemplate.create({ data: {
    id: "reply-template", clientId: input.clientId, name: "Hello", category: "INTRODUCTION", subject: "Hello", content: "Hello",
  } });
  await prisma.clientEmailSequence.create({ data: {
    id: "reply-sequence", clientId: input.clientId, contactListId: "reply-list", name: "Test sequence",
  } });
  await prisma.clientEmailSequenceStep.create({ data: {
    id: "reply-step", sequenceId: "reply-sequence", templateId: "reply-template", category: "INTRODUCTION", position: 0,
  } });
  await prisma.clientEmailSequenceEnrollment.create({ data: {
    id: "reply-enrollment", clientId: input.clientId, sequenceId: "reply-sequence", contactId: "reply-contact", contactListId: "reply-list",
  } });
  await prisma.outboundEmail.create({ data: {
    id: "reply-outbound", clientId: input.clientId, contactId: "reply-contact", mailboxIdentityId: input.mailboxIdentityId,
    toEmail: input.fromEmail, subject: "Hello", bodySnapshot: "Original", status: "SENT",
    providerMessageId: "provider-original", rfc822MessageId: input.inReplyToHeader, sentAt: new Date("2026-09-05T12:00:00Z"),
  } });
  await prisma.clientEmailSequenceStepSend.create({ data: {
    id: "reply-step-send", clientId: input.clientId, sequenceId: "reply-sequence", enrollmentId: "reply-enrollment",
    stepId: "reply-step", templateId: "reply-template", contactId: "reply-contact", contactListId: "reply-list",
    idempotencyKey: "reply-step-send", outboundEmailId: "reply-outbound", status: "SENT",
  } });
}

const faultTargets = [
  ["outbound milestone", "OutboundEmail", "UPDATE"],
  ["follow-up stop", "ClientEmailSequenceEnrollment", "UPDATE"],
  ["suppression insert", "SuppressedEmail", "INSERT"],
  ["contact suppression flag", "Contact", "UPDATE"],
  ["suppression audit", "AuditLog", "INSERT"],
] as const;

async function removeFaults() {
  for (const [, table] of faultTargets) {
    await sql.query(`DROP TRIGGER IF EXISTS reply_recovery_fault ON "${table}"`);
  }
  await sql.query("DROP FUNCTION IF EXISTS reply_recovery_fault()");
}

async function failAt(table: string, event: string) {
  await sql.query(`CREATE FUNCTION reply_recovery_fault() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN RAISE EXCEPTION 'reply recovery injected failure'; END $$`);
  await sql.query(`CREATE TRIGGER reply_recovery_fault BEFORE ${event} ON "${table}"
    FOR EACH ROW EXECUTE FUNCTION reply_recovery_fault()`);
}

async function assertRecovered() {
  expect(await prisma.inboundReply.count({ where: { clientId: input.clientId, providerMessageId: input.providerMessageId } })).toBe(1);
  expect((await prisma.outboundEmail.findUniqueOrThrow({ where: { id: "reply-outbound" } })).status).toBe("REPLIED");
  expect((await prisma.clientEmailSequenceEnrollment.findUniqueOrThrow({ where: { id: "reply-enrollment" } })).status).toBe("COMPLETED");
  expect(await prisma.suppressedEmail.count({ where: { clientId: input.clientId, email: input.fromEmail } })).toBe(1);
  expect((await prisma.contact.findUniqueOrThrow({ where: { id: "reply-contact" } })).isSuppressed).toBe(true);
  expect(await prisma.auditLog.count({ where: { entityType: "SuppressedEmail" } })).toBe(1);
  expect(await prisma.suppressedEmail.count({ where: { clientId: "other-client" } })).toBe(0);
  expect((await prisma.contact.findUniqueOrThrow({ where: { id: "other-contact" } })).isSuppressed).toBe(false);
}

beforeEach(async () => {
  vi.clearAllMocks();
  expectedProviderCalls = 0;
  vi.stubEnv("MAILBOX_COMPLAINT_DETECTION_ENABLED", "true");
  vi.stubEnv("INTERNAL_SEED_ALLOWLIST_ENABLED", "false");
  vi.stubEnv("AUTONOMOUS_RELAY_ACTIVE", "false");
  vi.stubEnv("ANTHROPIC_API_KEY", "");
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("External HTTP forbidden in reply recovery tests"); }));
  await removeFaults();
  await resetIntegrationDatabase();
  await seed();
});
afterEach(async () => {
  await removeFaults();
  expect(fetch).toHaveBeenCalledTimes(expectedProviderCalls);
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
afterAll(async () => {
  await sql.end();
  await prisma.$disconnect();
  await closeIntegrationPool();
});

describe("reply recovery against real PostgreSQL", () => {
  it.each(faultTargets)("rolls back and retries a failure at %s", async (_, table, event) => {
    await failAt(table, event);
    await expect(processSyncedMessageForReply(input)).rejects.toThrow("reply recovery injected failure");
    expect(await prisma.inboundReply.count()).toBe(0);
    expect((await prisma.outboundEmail.findUniqueOrThrow({ where: { id: "reply-outbound" } })).status).toBe("SENT");
    expect((await prisma.clientEmailSequenceEnrollment.findUniqueOrThrow({ where: { id: "reply-enrollment" } })).status).toBe("PENDING");
    expect(await prisma.suppressedEmail.count()).toBe(0);
    expect((await prisma.contact.findUniqueOrThrow({ where: { id: "reply-contact" } })).isSuppressed).toBe(false);
    expect(classify).not.toHaveBeenCalled();
    await removeFaults();
    expect((await processSyncedMessageForReply(input)).created).toBe(true);
    await assertRecovered();
    expect(classify).toHaveBeenCalledTimes(1);
  });

  it("repairs a historical partial reply, then blocks a queued later email", async () => {
    const old = await prisma.inboundReply.create({ data: {
      clientId: input.clientId, contactId: "reply-contact", linkedOutboundEmailId: "reply-outbound",
      providerMessageId: input.providerMessageId, fromEmail: input.fromEmail, subject: input.subject,
      bodyPreview: input.bodyPreview, receivedAt, ingestionSource: "mailbox_sync", matchMethod: "BY_THREAD_REF",
    } });
    // An old row may already have had its first effect applied.
    await prisma.outboundEmail.update({ where: { id: "reply-outbound" }, data: { status: "REPLIED" } });
    await failAt("AuditLog", "INSERT");
    await expect(processSyncedMessageForReply(input)).rejects.toThrow("reply recovery injected failure");
    expect(await prisma.inboundReply.count()).toBe(1);
    expect((await prisma.clientEmailSequenceEnrollment.findUniqueOrThrow({ where: { id: "reply-enrollment" } })).status).toBe("PENDING");
    await removeFaults();
    expect((await processSyncedMessageForReply(input)).created).toBe(false);
    await processSyncedMessageForReply(input);
    await assertRecovered();
    expect((await prisma.inboundReply.findUniqueOrThrow({ where: { id: old.id } })).linkedOutboundEmailId).toBe("reply-outbound");
    expect(classify).not.toHaveBeenCalled();
    await prisma.outboundEmail.create({ data: {
      id: "later-email", clientId: input.clientId, contactId: "reply-contact",
      toEmail: input.fromEmail, subject: "Later campaign", bodySnapshot: "Must never send", status: "QUEUED", queuedAt: receivedAt,
    } });
    await processOutboundSendQueue({ limit: 10 });
    expect((await prisma.outboundEmail.findUniqueOrThrow({ where: { id: "later-email" } })).status).toBe("BLOCKED_SUPPRESSION");
  });

  it("serializes concurrent mailbox retries without duplicate replies or suppression audits", async () => {
    const results = await Promise.all(Array.from({ length: 5 }, () => processSyncedMessageForReply(input)));
    expect(results.filter(r => r.created)).toHaveLength(1);
    await assertRecovered();
    expect(classify).toHaveBeenCalledTimes(1);
  });

  it("serializes mailbox and webhook ingestion of the same reply", async () => {
    await Promise.all([processSyncedMessageForReply(input), ingestInboundForClient(webhook)]);
    await assertRecovered();
    expect(classify).toHaveBeenCalledTimes(1);
  });

  it("repairs a legacy webhook reply and rolls back an interrupted follow-up stop", async () => {
    await failAt("ClientEmailSequenceEnrollment", "UPDATE");
    await expect(ingestInboundForClient(webhook)).rejects.toThrow("reply recovery injected failure");
    expect(await prisma.inboundReply.count()).toBe(0);
    await removeFaults();
    const first = await ingestInboundForClient(webhook);
    await prisma.clientEmailSequenceEnrollment.update({ where: { id: "reply-enrollment" }, data: { status: "PENDING", completedAt: null } });
    const replay = await ingestInboundForClient(webhook);
    expect(replay).toEqual({ id: first.id, matchMethod: first.matchMethod, skipped: "duplicate" });
    expect(await prisma.inboundReply.count()).toBe(1);
    expect((await prisma.clientEmailSequenceEnrollment.findUniqueOrThrow({ where: { id: "reply-enrollment" } })).status).toBe("COMPLETED");
    expect(classify).toHaveBeenCalledTimes(1);
  });

  it("preserves terminal bounce and excluded enrollment states during recovery", async () => {
    await processSyncedMessageForReply(input);
    await prisma.outboundEmail.update({ where: { id: "reply-outbound" }, data: { status: "BOUNCED" } });
    await prisma.clientEmailSequenceEnrollment.update({ where: { id: "reply-enrollment" }, data: { status: "EXCLUDED" } });
    await processSyncedMessageForReply(input);
    expect((await prisma.outboundEmail.findUniqueOrThrow({ where: { id: "reply-outbound" } })).status).toBe("BOUNCED");
    expect((await prisma.clientEmailSequenceEnrollment.findUniqueOrThrow({ where: { id: "reply-enrollment" } })).status).toBe("EXCLUDED");
    expect(await prisma.inboundReply.count()).toBe(1);
  });

  it("keeps identical provider IDs separate between customers", async () => {
    await prisma.inboundReply.create({ data: {
      clientId: "other-client", providerMessageId: input.providerMessageId, fromEmail: input.fromEmail, receivedAt,
    } });
    await processSyncedMessageForReply(input);
    await assertRecovered();
    expect(await prisma.inboundReply.count()).toBe(2);
  });

  it("preserves the existing opt-out feature policy while still stopping follow-ups", async () => {
    vi.stubEnv("MAILBOX_COMPLAINT_DETECTION_ENABLED", "false");
    await processSyncedMessageForReply(input);
    expect(await prisma.suppressedEmail.count()).toBe(0);
    expect((await prisma.clientEmailSequenceEnrollment.findUniqueOrThrow({ where: { id: "reply-enrollment" } })).status).toBe("COMPLETED");
    vi.stubEnv("MAILBOX_COMPLAINT_DETECTION_ENABLED", "true");
    await processSyncedMessageForReply(input);
    await assertRecovered();
  });
});

describe("default opt-out protection", () => {
  it("suppresses STOP with no environment configuration", async () => {
    vi.stubEnv("MAILBOX_COMPLAINT_DETECTION_ENABLED", "");
    await processSyncedMessageForReply(input);
    await assertRecovered();
  });
});

describe("paged inbox to database journey (simulated provider HTTP)", () => {
  it.each(["GOOGLE", "MICROSOFT"] as const)("processes a second-page STOP through %s sync and safely replays it", async (provider) => {
    vi.stubEnv("MAILBOX_COMPLAINT_DETECTION_ENABLED", "");
    await prisma.clientMailboxIdentity.update({ where: { id: input.mailboxIdentityId }, data: { provider } });
    const nextGraph = "https://graph.microsoft.com/v1.0/users/sender%40sender.test/mailFolders/inbox/messages?$skip=25";
    const fetcher = vi.fn(async (request: string) => {
      const url = new URL(request);
      let body: unknown;
      if (provider === "MICROSOFT") {
        body = url.searchParams.has("$skip") ? { value: [{ id: input.providerMessageId, subject: input.subject,
          from: { emailAddress: { address: input.fromEmail } }, toRecipients: [{ emailAddress: { address: input.toEmail } }],
          body: { contentType: "text", content: "STOP" }, receivedDateTime: receivedAt.toISOString(),
          internetMessageHeaders: [{ name: "In-Reply-To", value: input.inReplyToHeader }],
        }] } : { value: [], "@odata.nextLink": nextGraph };
      } else if (url.pathname.endsWith("/messages")) {
        body = url.searchParams.has("pageToken") ? { messages: [{ id: input.providerMessageId }] } : { nextPageToken: "older" };
      } else {
        body = { id: input.providerMessageId, internalDate: String(receivedAt.getTime()), payload: {
          mimeType: "text/plain", body: { data: Buffer.from("STOP").toString("base64url") }, headers: [
            { name: "From", value: input.fromEmail }, { name: "To", value: input.toEmail },
            { name: "Subject", value: input.subject }, { name: "In-Reply-To", value: input.inReplyToHeader },
          ],
        } };
      }
      return new Response(JSON.stringify(body), { status: 200 });
    });
    vi.stubGlobal("fetch", fetcher);
    for (let attempt = 0; attempt < 2; attempt++) {
      expectedProviderCalls += provider === "GOOGLE" ? 3 : 2;
      const result = await syncMailboxInboxForMailbox({ clientId: input.clientId, mailboxIdentityId: input.mailboxIdentityId, staffUserId: null });
      expect(result).toMatchObject({ ok: true, repliesLinked: attempt === 0 ? 1 : 0 });
      await assertRecovered();
    }
    expect(await prisma.inboundMailboxMessage.count()).toBe(1);
  });
});

describe("durable inbox progress", () => {
  it.each(["GOOGLE", "MICROSOFT"] as const)("resumes %s backlog and still checks newest mail", async (provider) => {
    await prisma.clientMailboxIdentity.update({ where: { id: input.mailboxIdentityId }, data: { provider } });
    const requested: number[] = [];
    const graphBase = "https://graph.microsoft.com/v1.0/users/sender%40sender.test/mailFolders/inbox/messages";
    const cursorFor = (page: number) => provider === "GOOGLE" ? String(page) : graphBase + "?$skip=" + page;
    let failPage: number | null = null;
    vi.stubGlobal("fetch", vi.fn(async (request: string) => {
      const url = new URL(request);
      const page = Number(url.searchParams.get(provider === "GOOGLE" ? "pageToken" : "$skip") || "0");
      requested.push(page);
      if (page === failPage) return new Response(JSON.stringify({ error: { message: "temporary failure" } }), { status: 503 });
      const next = page < 8 ? cursorFor(page + 1) : undefined;
      const body = provider === "GOOGLE" ? { nextPageToken: next } : { value: [], "@odata.nextLink": next };
      return new Response(JSON.stringify(body), { status: 200 });
    }));
    const run = () => syncMailboxInboxForMailbox({ clientId: input.clientId, mailboxIdentityId: input.mailboxIdentityId, staffUserId: null });
    const cursor = async () => (await prisma.clientMailboxIdentity.findUniqueOrThrow({ where: { id: input.mailboxIdentityId } })).inboxSyncCursor;
    expectedProviderCalls = 4;
    expect(await run()).toMatchObject({ ok: true });
    expect(requested).toEqual([0, 1, 2, 3]);
    expect(await cursor()).toBe(cursorFor(4));
    failPage = 5;
    expectedProviderCalls += 3;
    expect(await run()).toMatchObject({ ok: false });
    expect(await cursor()).toBe(cursorFor(4));
    failPage = null;
    expectedProviderCalls += 4;
    expect(await run()).toMatchObject({ ok: true });
    expect(requested.slice(-4)).toEqual([0, 4, 5, 6]);
    expect(await cursor()).toBe(cursorFor(7));
    expectedProviderCalls += 3;
    expect(await run()).toMatchObject({ ok: true });
    expect(requested.slice(-3)).toEqual([0, 7, 8]);
    expect(await cursor()).toBeNull();
  });
});
