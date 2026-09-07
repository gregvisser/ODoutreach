import { afterAll, afterEach, beforeEach, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { resetIntegrationDatabase, closeIntegrationPool } from "@/test/integration/database";
import { executeOutboundSend } from "./execute-one";
import { operatorRequeueFailedSend, releaseStaleProcessingClaimsForScope } from "./operator-recovery";
import { processOutboundSendQueue } from "./queue-processor";
import { getOutboundOperationsSnapshot } from "@/server/queries/outbound-operations";

// Real database and orchestration. Every sending transport is inert; unexpected
// HTTP and DNS cannot reach a provider or a customer.
const { send, lookup, token } = vi.hoisted(() => ({ send: vi.fn(), lookup: vi.fn(), token: vi.fn() }));
vi.mock("node:dns", () => ({ promises: { resolveMx: async () => [{ exchange: "mx.example.test", priority: 10 }], resolve4: async () => [], resolve6: async () => [] } }));
vi.mock("@/server/mailbox/google-mailbox-access", () => ({ getGoogleGmailAccessTokenForMailbox: token }));
vi.mock("@/server/mailbox/microsoft-mailbox-access", () => ({ getMicrosoftGraphAccessTokenForMailbox: token }));
vi.mock("@/server/mailbox/gmail-sendmail", async (original) => ({ ...await original<object>(), sendGmailUsersMessagesSend: send, fetchDeliveredGmailMessageId: async () => null, findGmailMessageIdByRfc822MessageId: lookup }));
vi.mock("@/server/mailbox/microsoft-graph-sendmail", async (original) => ({ ...await original<object>(), sendMicrosoftGraphSendMail: send, sendMicrosoftGraphMimeSendMail: send, findGraphSentMessageId: lookup }));
vi.mock("../providers", () => ({ getOutboundEmailProvider: () => ({ send }) }));

beforeEach(async () => {
  send.mockReset().mockResolvedValue({ ok: true, providerMessageId: "synthetic-accepted", providerName: "synthetic" });
  lookup.mockReset().mockResolvedValue({ status: "not_found" });
  token.mockReset().mockResolvedValue("synthetic-token");
  vi.stubGlobal("fetch", vi.fn(() => { throw Error("NETWORK BLOCKED"); }));
  vi.stubEnv("SEND_PREFLIGHT_DEDUP_ENABLED", "false");
  await resetIntegrationDatabase();
  await prisma.client.create({ data: { id: "client", name: "Outcome test", slug: "outcome-test", defaultSenderEmail: "sender@example.test", senderIdentityStatus: "VERIFIED_READY" } });
});
afterEach(async () => {
  for (const table of ["OutboundEmail", "MailboxSendReservation"]) await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS fail_outcome_test ON "${table}"`);
  await prisma.$executeRawUnsafe("DROP FUNCTION IF EXISTS fail_outcome_test()");
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
afterAll(async () => { await prisma.$disconnect(); await closeIntegrationPool(); });

async function seed(provider: "GOOGLE" | "MICROSOFT" | "LEGACY") {
  if (provider !== "LEGACY") await prisma.clientMailboxIdentity.create({ data: { id: "mailbox", clientId: "client", provider, email: "sender@example.test", emailNormalized: "sender@example.test", isActive: true, connectionStatus: "CONNECTED", canSend: true, isSendingEnabled: true } });
  await prisma.outboundEmail.create({ data: { id: "outbound", clientId: "client", mailboxIdentityId: provider === "LEGACY" ? null : "mailbox", status: "PROCESSING", subject: "Synthetic recovery", bodySnapshot: "Test only", toEmail: "recipient@example.test", fromAddress: "sender@example.test", claimedAt: new Date(), claimExpiresAt: new Date(Date.now() + 600_000), sendAttempt: 1 } });
  if (provider !== "LEGACY") await prisma.mailboxSendReservation.create({ data: { clientId: "client", mailboxIdentityId: "mailbox", outboundEmailId: "outbound", idempotencyKey: "synthetic", windowKey: new Date().toISOString().slice(0, 10), status: "RESERVED" } });
}
async function failSave(table: "OutboundEmail" | "MailboxSendReservation") {
  await prisma.$executeRawUnsafe("CREATE FUNCTION fail_outcome_test() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic persistence interruption'; END $$");
  const status = table === "OutboundEmail" ? "SENT" : "CONSUMED";
  await prisma.$executeRawUnsafe(`CREATE TRIGGER fail_outcome_test BEFORE UPDATE ON "${table}" FOR EACH ROW WHEN (NEW.status = '${status}') EXECUTE FUNCTION fail_outcome_test()`);
}
async function expectHeld() {
  expect(await prisma.outboundEmail.findUniqueOrThrow({ where: { id: "outbound" } })).toMatchObject({ status: "PROCESSING", providerMessageId: null, claimExpiresAt: null });
  expect(await operatorRequeueFailedSend("outbound", "client")).toEqual({ count: 0 });
  expect(await releaseStaleProcessingClaimsForScope(["client"])).toEqual({ count: 0 });
  expect((await executeOutboundSend("outbound")).ok).toBe(false);
  expect(send).toHaveBeenCalledTimes(1);
  expect(fetch).not.toHaveBeenCalled();
}

it.each(["GOOGLE", "MICROSOFT", "LEGACY"] as const)("holds an accepted %s send when saving its result fails", async (provider) => {
  await seed(provider);
  await failSave("OutboundEmail");
  expect((await executeOutboundSend("outbound")).ok).toBe(false);
  await expectHeld();
  if (provider !== "LEGACY") expect(await prisma.mailboxSendReservation.findFirstOrThrow()).toMatchObject({ status: "RESERVED" });
});

it.each(["GOOGLE", "MICROSOFT"] as const)("saves %s sent status and allowance atomically", async (provider) => {
  await seed(provider);
  await failSave("MailboxSendReservation");
  expect((await executeOutboundSend("outbound")).ok).toBe(false);
  await expectHeld();
  expect(await prisma.mailboxSendReservation.findFirstOrThrow()).toMatchObject({ status: "RESERVED" });
});

it.each(["GOOGLE", "MICROSOFT", "LEGACY"] as const)("records ordinary %s acceptance once", async (provider) => {
  await seed(provider);
  expect((await executeOutboundSend("outbound")).ok).toBe(true);
  expect((await executeOutboundSend("outbound")).ok).toBe(true);
  expect(send).toHaveBeenCalledTimes(1);
  expect(await prisma.outboundEmail.findFirstOrThrow()).toMatchObject({ status: "SENT", providerMessageId: "synthetic-accepted" });
  if (provider !== "LEGACY") expect(await prisma.mailboxSendReservation.findFirstOrThrow()).toMatchObject({ status: "CONSUMED" });
});

it.each(["GOOGLE", "MICROSOFT", "LEGACY"] as const)("holds %s connection loss without retrying", async (provider) => {
  await seed(provider);
  send.mockRejectedValueOnce(Error("socket timed out"));
  expect((await executeOutboundSend("outbound")).ok).toBe(false);
  await expectHeld();
});

it.each(["GOOGLE", "MICROSOFT", "LEGACY"] as const)("holds ambiguous %s server errors", async (provider) => {
  await seed(provider);
  send.mockResolvedValueOnce({ ok: false, error: "synthetic server error", code: "502" });
  expect((await executeOutboundSend("outbound")).ok).toBe(false);
  await expectHeld();
});

it.each(["GOOGLE", "MICROSOFT", "LEGACY"] as const)("allows %s retry after explicit throttling", async (provider) => {
  await seed(provider);
  send.mockResolvedValueOnce({ ok: false, error: "synthetic throttle", code: "429" });
  expect((await executeOutboundSend("outbound")).ok).toBe(false);
  expect(await prisma.outboundEmail.findFirstOrThrow()).toMatchObject({ status: "QUEUED", dispatchStartedAt: null, retryCount: 1 });
  if (provider !== "LEGACY") expect(await prisma.mailboxSendReservation.findFirstOrThrow()).toMatchObject({ status: "RESERVED" });
  await prisma.outboundEmail.update({ where: { id: "outbound" }, data: { nextRetryAt: new Date(0) } });
  expect(await processOutboundSendQueue({ limit: 1 })).toMatchObject({ claimed: 1, completed: 1 });
  expect(send).toHaveBeenCalledTimes(2);
});

it("saves an explicit rejection and released allowance together", async () => {
  await seed("GOOGLE");
  send.mockResolvedValueOnce({ ok: false, error: "synthetic invalid payload", code: "400" });
  expect((await executeOutboundSend("outbound")).ok).toBe(false);
  expect(await prisma.outboundEmail.findFirstOrThrow()).toMatchObject({ status: "FAILED", dispatchStartedAt: null });
  expect(await prisma.mailboxSendReservation.findFirstOrThrow()).toMatchObject({ status: "RELEASED" });
  expect(await operatorRequeueFailedSend("outbound", "client")).toEqual({ count: 1 });
});

it("keeps the hold if saving an explicit rejection is interrupted", async () => {
  await seed("GOOGLE");
  await prisma.$executeRawUnsafe("CREATE FUNCTION fail_outcome_test() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic release interruption'; END $$");
  await prisma.$executeRawUnsafe(`CREATE TRIGGER fail_outcome_test BEFORE UPDATE ON "MailboxSendReservation" FOR EACH ROW WHEN (NEW.status = 'RELEASED') EXECUTE FUNCTION fail_outcome_test()`);
  send.mockResolvedValueOnce({ ok: false, error: "synthetic invalid payload", code: "400" });
  expect((await executeOutboundSend("outbound")).ok).toBe(false);
  await expectHeld();
  expect(await prisma.mailboxSendReservation.findFirstOrThrow()).toMatchObject({ status: "RESERVED" });
});

it("allows only one worker to dispatch while a provider call is in flight", async () => {
  await seed("GOOGLE");
  let entered!: () => void;
  const started = new Promise<void>(resolve => { entered = resolve; });
  let release!: (value: unknown) => void;
  send.mockImplementationOnce(() => { entered(); return new Promise(resolve => { release = resolve; }); });
  const first = executeOutboundSend("outbound");
  await started;
  try { await expectHeld(); }
  finally { release({ ok: true, providerMessageId: "synthetic-accepted", providerName: "synthetic" }); }
  expect((await first).ok).toBe(true);
  expect(send).toHaveBeenCalledTimes(1);
});

it("keeps a held record out of queue and operator recovery even if its status was changed", async () => {
  await seed("GOOGLE");
  send.mockRejectedValueOnce(Error("timeout"));
  await executeOutboundSend("outbound");
  await prisma.outboundEmail.update({ where: { id: "outbound" }, data: { status: "FAILED" } });
  expect(await operatorRequeueFailedSend("outbound", "client")).toEqual({ count: 0 });
  await prisma.outboundEmail.update({ where: { id: "outbound" }, data: { status: "QUEUED", nextRetryAt: null } });
  expect(await processOutboundSendQueue({ limit: 1 })).toMatchObject({ claimed: 0 });
  await prisma.outboundEmail.update({ where: { id: "outbound" }, data: { status: "PROCESSING", claimExpiresAt: new Date(0) } });
  expect(await releaseStaleProcessingClaimsForScope(["client"])).toEqual({ count: 0 });
  expect(send).toHaveBeenCalledTimes(1);
});

it("shows held sends only in the authorised operations scope", async () => {
  await seed("GOOGLE");
  send.mockRejectedValueOnce(Error("timeout"));
  await executeOutboundSend("outbound");
  expect((await getOutboundOperationsSnapshot(["client"])).unconfirmed.map(row => row.id)).toEqual(["outbound"]);
  expect((await getOutboundOperationsSnapshot([])).unconfirmed).toEqual([]);
  expect((await getOutboundOperationsSnapshot(["other"])).unconfirmed).toEqual([]);
});

it.each(["GOOGLE", "MICROSOFT"] as const)("keeps an existing %s preflight match held when saving fails", async (provider) => {
  await seed(provider);
  vi.stubEnv("SEND_PREFLIGHT_DEDUP_ENABLED", "true");
  await prisma.outboundEmail.update({ where: { id: "outbound" }, data: { sendAttempt: 2 } });
  lookup.mockResolvedValue({ status: "found", providerMessageId: "synthetic-existing" });
  await failSave("MailboxSendReservation");
  expect((await executeOutboundSend("outbound")).ok).toBe(false);
  expect((await executeOutboundSend("outbound")).ok).toBe(false);
  expect(await prisma.outboundEmail.findFirstOrThrow()).toMatchObject({ status: "PROCESSING", providerMessageId: null, claimExpiresAt: null });
  expect(await prisma.mailboxSendReservation.findFirstOrThrow()).toMatchObject({ status: "RESERVED" });
  expect(send).not.toHaveBeenCalled();
  expect(lookup).toHaveBeenCalledTimes(1);
});

it("fences two workers that both read the row before either starts dispatch", async () => {
  await seed("GOOGLE");
  let arrived = 0;
  let release!: () => void;
  const both = new Promise<void>(resolve => { release = resolve; });
  token.mockImplementation(async () => { if (++arrived === 2) release(); await both; return "synthetic-token"; });
  const results = await Promise.all([executeOutboundSend("outbound"), executeOutboundSend("outbound")]);
  expect(results.filter(result => result.ok)).toHaveLength(1);
  expect(send).toHaveBeenCalledTimes(1);
  expect(await prisma.mailboxSendReservation.findFirstOrThrow()).toMatchObject({ status: "CONSUMED" });
});

it("never calls the provider when the pre-dispatch record cannot be saved", async () => {
  await seed("GOOGLE");
  await prisma.$executeRawUnsafe("CREATE FUNCTION fail_outcome_test() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic fence failure'; END $$");
  await prisma.$executeRawUnsafe(`CREATE TRIGGER fail_outcome_test BEFORE UPDATE ON "OutboundEmail" FOR EACH ROW WHEN (NEW."dispatchStartedAt" IS NOT NULL) EXECUTE FUNCTION fail_outcome_test()`);
  expect((await executeOutboundSend("outbound")).ok).toBe(false);
  expect(send).not.toHaveBeenCalled();
  expect(await prisma.outboundEmail.findFirstOrThrow()).toMatchObject({ status: "FAILED", dispatchStartedAt: null });
  expect(await prisma.mailboxSendReservation.findFirstOrThrow()).toMatchObject({ status: "RELEASED" });
});

it("holds a Microsoft MIME acceptance if saving fails", async () => {
  await seed("MICROSOFT");
  vi.stubEnv("MICROSOFT_MIME_SEND", "on");
  await failSave("OutboundEmail");
  expect((await executeOutboundSend("outbound")).ok).toBe(false);
  await expectHeld();
  expect(send.mock.calls[0][0]).toHaveProperty("rfc5322Message");
});

it.each(["408", "200"])("holds ambiguous response code %s", async (code) => {
  await seed("GOOGLE");
  send.mockResolvedValueOnce({ ok: false, error: "synthetic unreadable outcome", code });
  expect((await executeOutboundSend("outbound")).ok).toBe(false);
  await expectHeld();
});


it.each(["GOOGLE", "MICROSOFT"] as const)("defers a previous-day %s reservation when today already has 30 bookings", async provider => {
  await seed(provider);
  await prisma.clientMailboxIdentity.update({ where: { id: "mailbox" }, data: { dailySendCap: 5000 } });
  await prisma.mailboxSendReservation.updateMany({ where: { outboundEmailId: "outbound" }, data: { windowKey: "2020-01-01" } });
  await prisma.mailboxSendReservation.createMany({ data: Array.from({ length: 30 }, (_, n) => ({ clientId: "client", mailboxIdentityId: "mailbox", idempotencyKey: "used-" + n, windowKey: new Date().toISOString().slice(0,10), status: "CONSUMED" as const })) });
  expect(await executeOutboundSend("outbound")).toMatchObject({ ok:false, error: expect.stringContaining("stays queued") });
  expect(send).not.toHaveBeenCalled();
  const held = await prisma.outboundEmail.findUniqueOrThrow({ where: { id: "outbound" } });
  expect(held).toMatchObject({ status:"QUEUED", dispatchStartedAt:null, lastErrorCode:"MAILBOX_DAILY_CAP", retryCount:0 });
  expect(held.nextRetryAt!.getTime()).toBeGreaterThan(Date.now());
  expect(await prisma.mailboxSendReservation.findUniqueOrThrow({ where: { outboundEmailId:"outbound" } })).toMatchObject({ status:"RESERVED", windowKey:"2020-01-01" });
});

it.each(["GOOGLE", "MICROSOFT"] as const)("rebooks an older %s queue entry into today's allowance before sending", async provider => {
  await seed(provider);
  await prisma.mailboxSendReservation.updateMany({ where: { outboundEmailId:"outbound" }, data: { windowKey:"2020-01-01" } });
  expect(await executeOutboundSend("outbound")).toMatchObject({ ok:true });
  expect(send).toHaveBeenCalledTimes(1);
  expect(await prisma.mailboxSendReservation.findUniqueOrThrow({ where: { outboundEmailId:"outbound" } })).toMatchObject({ status:"CONSUMED", windowKey:new Date().toISOString().slice(0,10) });
});

it.each(["GOOGLE", "MICROSOFT"] as const)("does not send a %s message whose allowance was already consumed", async provider => {
  await seed(provider);
  await prisma.mailboxSendReservation.updateMany({ where: { outboundEmailId:"outbound" }, data: { status:"CONSUMED" } });
  expect((await executeOutboundSend("outbound")).ok).toBe(false);
  expect(send).not.toHaveBeenCalled();
});


it("serializes two old queue entries competing for today's final slot", async () => {
  await seed("GOOGLE");
  await prisma.clientMailboxIdentity.update({ where:{ id:"mailbox" }, data:{ dailySendCap:5000 } });
  await prisma.mailboxSendReservation.updateMany({ where:{ outboundEmailId:"outbound" }, data:{ windowKey:"2020-01-01" } });
  await prisma.outboundEmail.create({ data:{ id:"second", clientId:"client", mailboxIdentityId:"mailbox", status:"PROCESSING", subject:"Synthetic second", bodySnapshot:"Never real mail", toEmail:"second@example.test", fromAddress:"sender@example.test", claimedAt:new Date(), sendAttempt:1 } });
  await prisma.mailboxSendReservation.create({ data:{ clientId:"client", mailboxIdentityId:"mailbox", outboundEmailId:"second", idempotencyKey:"second", windowKey:"2020-01-01", status:"RESERVED" } });
  await prisma.mailboxSendReservation.createMany({ data:Array.from({ length:29 }, (_,n)=>({ clientId:"client", mailboxIdentityId:"mailbox", idempotencyKey:"prior-"+n, windowKey:new Date().toISOString().slice(0,10), status:"CONSUMED" as const })) });
  const results = await Promise.all([executeOutboundSend("outbound"), executeOutboundSend("second")]);
  expect(results.filter(r=>r.ok)).toHaveLength(1);
  expect(send).toHaveBeenCalledTimes(1);
  expect(await prisma.outboundEmail.count({ where:{ status:"QUEUED", lastErrorCode:"MAILBOX_DAILY_CAP" } })).toBe(1);
  expect(await prisma.mailboxSendReservation.count({ where:{ windowKey:new Date().toISOString().slice(0,10), status:{ in:["RESERVED","CONSUMED"] } } })).toBe(30);
});
