import { afterAll, afterEach, beforeEach, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { resetIntegrationDatabase, closeIntegrationPool } from "@/test/integration/database";
import { replyToInboundMailboxMessage } from "./reply-to-inbound-message";
import { readHandlingStateFromMetadata } from "@/lib/inbox/inbound-message-handling";
import { getGoogleGmailAccessTokenForMailbox } from "@/server/mailbox/google-mailbox-access";
import { releaseStaleProcessingClaimsForScope } from "@/server/email/outbound/operator-recovery";

vi.mock("@/server/mailbox/google-mailbox-access", () => ({ getGoogleGmailAccessTokenForMailbox: vi.fn(async () => "synthetic-token") }));
vi.mock("@/server/mailbox/microsoft-mailbox-access", () => ({ getMicrosoftGraphAccessTokenForMailbox: vi.fn(async () => "synthetic-token") }));

// Real orchestration, provider response parsing and Postgres transactions.
// The only transport is this local fetch stub: no real email or HTTP request.
const transport = vi.fn(async () => new Response(JSON.stringify({ id: "synthetic-sent-id" }), { status: 200 }));
beforeEach(async () => {
  transport.mockReset().mockImplementation(async () => new Response(JSON.stringify({ id: "synthetic-sent-id" }), { status: 200 }));
  vi.stubGlobal("fetch", transport);
  await resetIntegrationDatabase();
  await prisma.client.create({ data: { id: "client", name: "Recovery test", slug: "recovery-test" } });
  await prisma.staffUser.create({ data: { id: "staff", entraObjectId: "recovery-staff", email: "staff@example.test" } });
  await prisma.clientMailboxIdentity.create({ data: {
    id: "mailbox", clientId: "client", provider: "GOOGLE", email: "sender@example.test", emailNormalized: "sender@example.test",
    isActive: true, connectionStatus: "CONNECTED", canSend: true, isSendingEnabled: true,
  } });
  await prisma.inboundMailboxMessage.create({ data: {
    id: "message", clientId: "client", mailboxIdentityId: "mailbox", providerMessageId: "original-id",
    fromEmail: "prospect@example.test", subject: "Question", receivedAt: new Date(), metadata: { threadId: "synthetic-thread" },
  } });
});
afterEach(async () => {
  await prisma.$executeRawUnsafe('DROP TRIGGER IF EXISTS fail_reply_test ON "OutboundEmail"');
  await prisma.$executeRawUnsafe('DROP TRIGGER IF EXISTS fail_reply_test ON "InboundMailboxMessage"');
  await prisma.$executeRawUnsafe('DROP FUNCTION IF EXISTS fail_reply_test()');
  vi.unstubAllGlobals();
});
afterAll(async () => { await prisma.$disconnect(); await closeIntegrationPool(); });

async function send(inboundMessageId = "message", clientId = "client") {
  const staff = await prisma.staffUser.findUniqueOrThrow({ where: { id: "staff" } });
  return replyToInboundMailboxMessage({ staff, clientId, inboundMessageId, bodyText: "A synthetic reply." });
}
async function failSave(table: "OutboundEmail" | "InboundMailboxMessage") {
  await prisma.$executeRawUnsafe(`CREATE FUNCTION fail_reply_test() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic persistence interruption'; END $$`);
  const when = table === "OutboundEmail" ? ` WHEN (NEW.status = 'SENT')` : "";
  await prisma.$executeRawUnsafe(`CREATE TRIGGER fail_reply_test BEFORE UPDATE ON "${table}" FOR EACH ROW${when} EXECUTE FUNCTION fail_reply_test()`);
}

it.each(["GOOGLE", "MICROSOFT"] as const)("keeps an accepted %s reply unresolved and prevents another dispatch when saving fails", async (provider) => {
  await prisma.clientMailboxIdentity.update({ where: { id: "mailbox" }, data: { provider } });
  if (provider === "MICROSOFT") transport.mockImplementation(async () => new Response(null, { status: 202 }));
  await failSave("OutboundEmail");
  const result = await send();
  expect(result).toMatchObject({ ok: false, errorCode: "REPLY_OUTCOME_UNCONFIRMED" });
  expect(await prisma.outboundEmail.findFirstOrThrow()).toMatchObject({ status: "PROCESSING", providerMessageId: null });
  expect(await prisma.mailboxSendReservation.findFirstOrThrow()).toMatchObject({ status: "RESERVED" });
  await prisma.$executeRawUnsafe('DROP TRIGGER fail_reply_test ON "OutboundEmail"');
  expect(await send()).toMatchObject({ ok: false, errorCode: "REPLY_OUTCOME_UNCONFIRMED" });
  expect(transport).toHaveBeenCalledTimes(1);
  expect(await prisma.outboundEmail.count()).toBe(1);
});

it("rolls back sent status and ledger consumption together when handling cannot be saved", async () => {
  await failSave("InboundMailboxMessage");
  expect(await send()).toMatchObject({ ok: false, errorCode: "REPLY_OUTCOME_UNCONFIRMED" });
  expect(await prisma.outboundEmail.findFirstOrThrow()).toMatchObject({ status: "PROCESSING", providerMessageId: null });
  expect(await prisma.mailboxSendReservation.findFirstOrThrow()).toMatchObject({ status: "RESERVED" });
  expect(readHandlingStateFromMetadata((await prisma.inboundMailboxMessage.findFirstOrThrow()).metadata).handledAt).toBeNull();
});

it("saves an ordinary accepted reply, its consumed allowance and its handling history", async () => {
  const result = await send();
  expect(result.ok).toBe(true);
  const outbound = await prisma.outboundEmail.findFirstOrThrow();
  expect(outbound).toMatchObject({ status: "SENT", providerMessageId: "gmail:synthetic-sent-id" });
  expect(await prisma.mailboxSendReservation.findFirstOrThrow()).toMatchObject({ status: "CONSUMED" });
  expect(readHandlingStateFromMetadata((await prisma.inboundMailboxMessage.findFirstOrThrow()).metadata).replyOutboundEmailIds).toEqual([outbound.id]);
  expect(transport).toHaveBeenCalledTimes(1);
});

it.each([502, 408, 200])("does not release or resend after an ambiguous HTTP %s response", async (status) => {
  transport.mockImplementation(async () => new Response("unreadable response", { status }));
  expect(await send()).toMatchObject({ ok: false, errorCode: "REPLY_OUTCOME_UNCONFIRMED" });
  expect(await prisma.mailboxSendReservation.findFirstOrThrow()).toMatchObject({ status: "RESERVED" });
  expect(await send()).toMatchObject({ ok: false, errorCode: "REPLY_OUTCOME_UNCONFIRMED" });
  expect(transport).toHaveBeenCalledTimes(1);
});

it("does not retry a transport interruption even after the original send is old", async () => {
  transport.mockRejectedValueOnce(new Error("synthetic connection loss"));
  expect(await send()).toMatchObject({ ok: false, errorCode: "REPLY_OUTCOME_UNCONFIRMED" });
  await prisma.outboundEmail.updateMany({ data: { attemptedAt: new Date("2025-01-01") } });
  expect(await releaseStaleProcessingClaimsForScope(["client"])).toEqual({ count: 0 });
  expect(await send()).toMatchObject({ ok: false, errorCode: "REPLY_OUTCOME_UNCONFIRMED" });
  expect(transport).toHaveBeenCalledTimes(1);
});

it("allows a new attempt after an explicit provider rejection", async () => {
  transport.mockImplementationOnce(async () => new Response("synthetic rejected token", { status: 401 }));
  expect(await send()).toMatchObject({ ok: false, errorCode: "401" });
  expect(await prisma.outboundEmail.findFirstOrThrow()).toMatchObject({ status: "FAILED" });
  expect(await prisma.mailboxSendReservation.findFirstOrThrow()).toMatchObject({ status: "RELEASED" });
  expect((await send()).ok).toBe(true);
  expect(transport).toHaveBeenCalledTimes(2);
});

it("releases an attempt that fails to obtain a token before any dispatch", async () => {
  vi.mocked(getGoogleGmailAccessTokenForMailbox).mockRejectedValueOnce(new Error("synthetic token unavailable"));
  expect(await send()).toMatchObject({ ok: false, errorCode: "EXCEPTION" });
  expect(await prisma.mailboxSendReservation.findFirstOrThrow()).toMatchObject({ status: "RELEASED" });
  expect(transport).not.toHaveBeenCalled();
  expect((await send()).ok).toBe(true);
});

it("blocks a competing request while the first provider call is in flight", async () => {
  let entered!: () => void;
  const dispatched = new Promise<void>((resolve) => { entered = resolve; });
  let release!: (response: Response) => void;
  transport.mockImplementationOnce(() => { entered(); return new Promise<Response>((resolve) => { release = resolve; }); });
  const first = send();
  await dispatched;
  try {
    expect(await send()).toMatchObject({ ok: false, errorCode: "REPLY_OUTCOME_UNCONFIRMED" });
    expect(await prisma.outboundEmail.count()).toBe(1);
  } finally {
    release(new Response(JSON.stringify({ id: "synthetic-sent-id" }), { status: 200 }));
    expect((await first).ok).toBe(true);
  }
  expect(transport).toHaveBeenCalledTimes(1);
});

it("does not let an unresolved reply block replies to a different received message", async () => {
  transport.mockRejectedValueOnce(new Error("synthetic interruption"));
  await send();
  await prisma.inboundMailboxMessage.create({ data: {
    id: "another", clientId: "client", mailboxIdentityId: "mailbox", providerMessageId: "another-original",
    fromEmail: "another@example.test", receivedAt: new Date(),
  } });
  expect((await send("another")).ok).toBe(true);
  expect(transport).toHaveBeenCalledTimes(2);
});

it("refuses a reply under the wrong client before any dispatch or reservation", async () => {
  await prisma.client.create({ data: { id: "other", name: "Other", slug: "other" } });
  expect(await send("message", "other")).toMatchObject({ ok: false, errorCode: "INBOUND_NOT_FOUND" });
  expect(await prisma.outboundEmail.count()).toBe(0);
  expect(transport).not.toHaveBeenCalled();
});
