import { afterAll, afterEach, beforeEach, expect, it, vi } from "vitest";
import { Pool } from "pg";
import { prisma } from "@/lib/db";
import { resetIntegrationDatabase, closeIntegrationPool, integrationDatabaseUrl } from "@/test/integration/database";
import { markInboundMailboxMessageHandled } from "./mark-inbound-message-handled";
import { persistSyncedInboundMessage, recordInboundMessageHandling } from "./persist-inbound-message";
import { readHandlingStateFromMetadata } from "@/lib/inbox/inbound-message-handling";

const pool = new Pool({ connectionString: integrationDatabaseUrl(), max: 2 });
beforeEach(async () => {
  vi.stubGlobal("fetch", vi.fn(() => { throw Error("No external HTTP"); }));
  await resetIntegrationDatabase();
  await prisma.client.createMany({ data: [
    { id: "client", name: "Message test", slug: "message-test" },
    { id: "other", name: "Other workspace", slug: "other-workspace" },
  ] });
  await prisma.staffUser.createMany({ data: ["first", "second"].map((id) => ({ id, entraObjectId: id, email: `${id}@staff.test` })) });
  await prisma.clientMailboxIdentity.create({ data: { id: "mailbox", clientId: "client", provider: "GOOGLE", email: "sender@example.test", emailNormalized: "sender@example.test" } });
  await prisma.inboundMailboxMessage.create({ data: {
    id: "message", clientId: "client", mailboxIdentityId: "mailbox", providerMessageId: "provider-message",
    fromEmail: "prospect@example.test", receivedAt: new Date(), metadata: { providerKey: "original", unrelated: "keep" },
  } });
});
afterEach(() => { expect(fetch).not.toHaveBeenCalled(); vi.unstubAllGlobals(); });
afterAll(async () => { await prisma.$disconnect(); await pool.end(); await closeIntegrationPool(); });
const stored = () => prisma.inboundMailboxMessage.findUniqueOrThrow({ where: { id: "message" } });

it("returns one persisted handled owner to simultaneous staff actions", async () => {
  const staff = await prisma.staffUser.findMany({ orderBy: { id: "asc" } });
  const blocker = await pool.connect();
  let pending: Promise<unknown[]> | undefined;
  try {
    await blocker.query("BEGIN");
    await blocker.query('SELECT id FROM "InboundMailboxMessage" WHERE id=$1 FOR UPDATE', ["message"]);
    pending = Promise.all(staff.map((person) => markInboundMailboxMessageHandled({ staff: person, clientId: "client", inboundMessageId: "message" })));
    let waiting = 0;
    const deadline = Date.now() + 4000;
    while (Date.now() < deadline && waiting < 2) {
      const result = await pool.query(`SELECT COUNT(*)::int AS count FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE '%InboundMailboxMessage%'`);
      waiting = result.rows[0].count;
      if (waiting < 2) await new Promise((resolve) => setTimeout(resolve, 20));
    }
    expect(waiting).toBe(2);
    await blocker.query("COMMIT");
    const results = await pending;
    const handling = readHandlingStateFromMetadata((await stored()).metadata);
    expect(results).toEqual(staff.map(() => ({ ok: true, handledAt: handling.handledAt, handledByStaffUserId: handling.handledByStaffUserId })));
  } finally {
    await blocker.query("ROLLBACK"); blocker.release(); await pending;
  }
});

it("preserves the owner, both sent-reply references and provider fields across competing writes", async () => {
  const first = await recordInboundMessageHandling({ clientId: "client", inboundMessageId: "message", staffUserId: "first" });
  const providerArgs = {
    where: { mailboxIdentityId_providerMessageId: { mailboxIdentityId: "mailbox", providerMessageId: "provider-message" } },
    create: { clientId: "client", mailboxIdentityId: "mailbox", providerMessageId: "provider-message", fromEmail: "prospect@example.test", receivedAt: new Date() },
    update: { subject: "Updated provider subject", metadata: { providerKey: "new" } },
  };
  const latest = new Date("2026-09-07T12:00:00Z");
  await Promise.all([
    recordInboundMessageHandling({ clientId: "client", inboundMessageId: "message", staffUserId: "second", outboundEmailId: "reply-one", now: latest }),
    recordInboundMessageHandling({ clientId: "client", inboundMessageId: "message", staffUserId: "second", outboundEmailId: "reply-two", now: new Date("2026-09-07T11:00:00Z") }),
    persistSyncedInboundMessage(providerArgs, { providerKey: "new", handling: "must-not-replace-history" }),
  ]);
  const row = await stored();
  const handling = readHandlingStateFromMetadata(row.metadata);
  expect(handling).toMatchObject({ ...first, lastRepliedAt: latest.toISOString() });
  expect(handling.replyOutboundEmailIds.sort()).toEqual(["reply-one", "reply-two"]);
  expect(row.metadata).toMatchObject({ providerKey: "new", unrelated: "keep" });
  expect(row.subject).toBe("Updated provider subject");
  await recordInboundMessageHandling({ clientId: "client", inboundMessageId: "message", staffUserId: "second", outboundEmailId: "reply-one", now: latest });
  expect(readHandlingStateFromMetadata((await stored()).metadata).replyOutboundEmailIds).toHaveLength(2);
});

it("refuses a message belonging to another workspace without changing it", async () => {
  const staff = await prisma.staffUser.findUniqueOrThrow({ where: { id: "first" } });
  const before = await stored();
  expect(await markInboundMailboxMessageHandled({ staff, clientId: "other", inboundMessageId: "message" })).toMatchObject({ ok: false, errorCode: "INBOUND_NOT_FOUND" });
  expect((await stored()).metadata).toEqual(before.metadata);
});
