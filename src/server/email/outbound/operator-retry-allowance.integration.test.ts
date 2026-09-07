import { afterAll, afterEach, beforeEach, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { resetIntegrationDatabase, closeIntegrationPool } from "@/test/integration/database";
import { operatorRequeueFailedSend } from "./operator-recovery";
import { tryReserveSendSlotInTransaction } from "@/server/mailbox/sending-policy";

// Real database only. This test never processes the queue or invokes a provider.
const today = () => new Date().toISOString().slice(0, 10);
beforeEach(async () => {
  vi.stubGlobal("fetch", vi.fn(() => { throw Error("NETWORK BLOCKED"); }));
  await resetIntegrationDatabase();
  await prisma.client.create({ data: { id: "client", name: "Retry allowance", slug: "retry-allowance", status: "ACTIVE" } });
  await prisma.clientMailboxIdentity.create({ data: { id: "mailbox", clientId: "client", provider: "GOOGLE", email: "sender@example.test", emailNormalized: "sender@example.test", isActive: true, connectionStatus: "CONNECTED", canSend: true, isSendingEnabled: true, dailySendCap: 1 } });
  await failed("outbound");
});
afterEach(async () => {
  await prisma.$executeRawUnsafe('DROP TRIGGER IF EXISTS fail_retry_test ON "OutboundEmail"');
  await prisma.$executeRawUnsafe('DROP FUNCTION IF EXISTS fail_retry_test()');
  expect(fetch).not.toHaveBeenCalled(); vi.unstubAllGlobals();
});
afterAll(async () => { await prisma.$disconnect(); await closeIntegrationPool(); });

async function failed(id: string) {
  await prisma.outboundEmail.create({ data: { id, clientId: "client", mailboxIdentityId: "mailbox", toEmail: `${id}@example.test`, subject: "Synthetic retry", bodySnapshot: "Never dispatch", status: "FAILED", sendAttempt: 1 } });
  await prisma.mailboxSendReservation.create({ data: { id: `${id}-slot`, clientId: "client", mailboxIdentityId: "mailbox", outboundEmailId: id, idempotencyKey: `synthetic:${id}`, windowKey: today(), status: "RELEASED" } });
}

it("reserves allowance again before requeuing a known failed send", async () => {
  expect((await operatorRequeueFailedSend("outbound", "client")).count).toBe(1);
  expect(await prisma.mailboxSendReservation.findUniqueOrThrow({ where: { id: "outbound-slot" } })).toMatchObject({ status: "RESERVED", windowKey: today(), outboundEmailId: "outbound" });
  expect(await prisma.clientMailboxIdentity.findUniqueOrThrow({ where: { id: "mailbox" } })).toMatchObject({ emailsSentToday: 1 });
});

it("refuses a retry when another send has used the daily allowance", async () => {
  await prisma.mailboxSendReservation.create({ data: { clientId: "client", mailboxIdentityId: "mailbox", idempotencyKey: "other-send", windowKey: today(), status: "CONSUMED" } });
  expect((await operatorRequeueFailedSend("outbound", "client")).count).toBe(0);
  expect(await prisma.outboundEmail.findUniqueOrThrow({ where: { id: "outbound" } })).toMatchObject({ status: "FAILED" });
  expect(await prisma.mailboxSendReservation.findUniqueOrThrow({ where: { id: "outbound-slot" } })).toMatchObject({ status: "RELEASED" });
});

it("books a released previous-day attempt against today's allowance", async () => {
  await prisma.mailboxSendReservation.update({ where: { id: "outbound-slot" }, data: { windowKey: "2020-01-01" } });
  expect((await operatorRequeueFailedSend("outbound", "client")).count).toBe(1);
  expect(await prisma.mailboxSendReservation.findUniqueOrThrow({ where: { id: "outbound-slot" } })).toMatchObject({ status: "RESERVED", windowKey: today() });
});

it("keeps an already reserved current-day slot without booking it twice", async () => {
  await prisma.mailboxSendReservation.update({ where: { id: "outbound-slot" }, data: { status: "RESERVED" } });
  expect((await operatorRequeueFailedSend("outbound", "client")).count).toBe(1);
  expect(await prisma.mailboxSendReservation.count()).toBe(1);
  expect((await operatorRequeueFailedSend("outbound", "client")).count).toBe(0);
  expect(await prisma.mailboxSendReservation.count({ where: { status: "RESERVED" } })).toBe(1);
});

it("allows only one of two competing retries to take the final slot", async () => {
  await failed("second");
  const results = await Promise.all([operatorRequeueFailedSend("outbound", "client"), operatorRequeueFailedSend("second", "client")]);
  expect(results.reduce((sum, result) => sum + result.count, 0)).toBe(1);
  expect(await prisma.mailboxSendReservation.count({ where: { status: "RESERVED", windowKey: today() } })).toBe(1);
  expect(await prisma.outboundEmail.count({ where: { status: "QUEUED" } })).toBe(1);
});

it("coordinates a retry with an ordinary booking competing for the final slot", async () => {
  const mailbox = await prisma.clientMailboxIdentity.findUniqueOrThrow({ where: { id: "mailbox" } });
  const [retry, normal] = await Promise.all([
    operatorRequeueFailedSend("outbound", "client"),
    prisma.$transaction(tx => tryReserveSendSlotInTransaction(tx, { clientId: "client", mailbox, idempotencyKey: "ordinary", at: new Date() })),
  ]);
  expect(retry.count + (normal.ok ? 1 : 0)).toBe(1);
  expect(await prisma.mailboxSendReservation.count({ where: { status: "RESERVED", windowKey: today() } })).toBe(1);
});

it("serializes ordinary bookings too, so they cannot consume the same final slot", async () => {
  const mailbox = await prisma.clientMailboxIdentity.findUniqueOrThrow({ where: { id: "mailbox" } });
  const results = await Promise.all(["one", "two"].map(idempotencyKey => prisma.$transaction(tx => tryReserveSendSlotInTransaction(tx, { clientId: "client", mailbox, idempotencyKey, at: new Date() }))));
  expect(results.filter(result => result.ok)).toHaveLength(1);
  expect(await prisma.mailboxSendReservation.count({ where: { status: "RESERVED" } })).toBe(1);
});

it("rolls allowance back if the queue update fails", async () => {
  await prisma.$executeRawUnsafe("CREATE FUNCTION fail_retry_test() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic queue save failure'; END $$");
  await prisma.$executeRawUnsafe(`CREATE TRIGGER fail_retry_test BEFORE UPDATE ON "OutboundEmail" FOR EACH ROW WHEN (NEW.status = 'QUEUED') EXECUTE FUNCTION fail_retry_test()`);
  expect((await operatorRequeueFailedSend("outbound", "client")).count).toBe(0);
  expect(await prisma.mailboxSendReservation.findUniqueOrThrow({ where: { id: "outbound-slot" } })).toMatchObject({ status: "RELEASED" });
  expect(await prisma.outboundEmail.findUniqueOrThrow({ where: { id: "outbound" } })).toMatchObject({ status: "FAILED" });
  expect(await prisma.clientMailboxIdentity.findUniqueOrThrow({ where: { id: "mailbox" } })).toMatchObject({ emailsSentToday: 0 });
});

it.each(["CONSUMED", "RESERVED"] as const)("refuses to repurpose historical %s allowance", async (status) => {
  await prisma.mailboxSendReservation.update({ where: { id: "outbound-slot" }, data: { status, windowKey: "2020-01-01" } });
  expect((await operatorRequeueFailedSend("outbound", "client")).count).toBe(0);
  expect(await prisma.mailboxSendReservation.findUniqueOrThrow({ where: { id: "outbound-slot" } })).toMatchObject({ status, windowKey: "2020-01-01" });
});

it("creates an allowance record when a failed mailbox email has none", async () => {
  // Only remove our synthetic fixture to represent a legacy missing reservation.
  await prisma.mailboxSendReservation.delete({ where: { id: "outbound-slot" } });
  expect((await operatorRequeueFailedSend("outbound", "client")).count).toBe(1);
  expect(await prisma.mailboxSendReservation.findUniqueOrThrow({ where: { outboundEmailId: "outbound" } })).toMatchObject({ clientId: "client", mailboxIdentityId: "mailbox", status: "RESERVED", windowKey: today() });
});

it.each(["PAUSED", "ARCHIVED"] as const)("refuses a retry in a %s workspace", async (status) => {
  await prisma.client.update({ where: { id: "client" }, data: { status } });
  expect((await operatorRequeueFailedSend("outbound", "client")).count).toBe(0);
});

it("refuses a disconnected mailbox and the wrong client scope", async () => {
  expect((await operatorRequeueFailedSend("outbound", "other")).count).toBe(0);
  await prisma.clientMailboxIdentity.update({ where: { id: "mailbox" }, data: { connectionStatus: "DISCONNECTED" } });
  expect((await operatorRequeueFailedSend("outbound", "client")).count).toBe(0);
  expect(await prisma.mailboxSendReservation.findUniqueOrThrow({ where: { id: "outbound-slot" } })).toMatchObject({ status: "RELEASED" });
});

it("uses current mailbox settings rather than a stale caller snapshot", async () => {
  const mailbox = await prisma.clientMailboxIdentity.findUniqueOrThrow({ where: { id: "mailbox" } });
  await prisma.clientMailboxIdentity.update({ where: { id: "mailbox" }, data: { isSendingEnabled: false } });
  const result = await prisma.$transaction(tx => tryReserveSendSlotInTransaction(tx, { clientId: "client", mailbox, idempotencyKey: "stale-snapshot", at: new Date() }));
  expect(result.ok).toBe(false);
  expect(await prisma.mailboxSendReservation.count({ where: { status: "RESERVED" } })).toBe(0);
});

it("reports lost confirmation honestly and does not book twice after a committed retry", async () => {
  const original = prisma.$transaction.bind(prisma);
  const interrupted = vi.spyOn(prisma, "$transaction").mockImplementationOnce(async (callback) => {
    if (typeof callback !== "function") throw Error("Expected interactive transaction");
    await original(callback);
    throw Error("synthetic lost commit acknowledgement");
  });
  try {
    expect(await operatorRequeueFailedSend("outbound", "client")).toMatchObject({ count: 0, error: "Could not confirm the retry. Refresh this page before trying again." });
  } finally { interrupted.mockRestore(); }
  expect(await prisma.outboundEmail.findUniqueOrThrow({ where: { id: "outbound" } })).toMatchObject({ status: "QUEUED" });
  expect((await operatorRequeueFailedSend("outbound", "client")).count).toBe(0);
  expect(await prisma.mailboxSendReservation.count({ where: { status: "RESERVED" } })).toBe(1);
});
