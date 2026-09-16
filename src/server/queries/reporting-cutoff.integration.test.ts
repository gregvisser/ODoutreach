import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/db";
import { loadClientOutreachMetrics } from "@/server/queries/outreach-metrics";
import { loadReportDetail } from "@/server/queries/report-detail";
import { getRepliesNeedingAPerson } from "@/server/queries/replies-needing-a-person";
import { loadClientLinkedReplyDetail, loadClientOrphanReplyDetail } from "@/server/queries/client-linked-reply-detail";
import { closeIntegrationPool, resetIntegrationDatabase } from "@/test/integration/database";

const CUTOFF = new Date("2026-09-15T23:00:00.000Z");
const BEFORE = new Date("2026-09-15T22:59:59.999Z");
const AFTER = CUTOFF;

beforeEach(async () => {
  await resetIntegrationDatabase();
  process.env.DISPLAY_DATA_CUTOFF_AT = CUTOFF.toISOString();
});
afterAll(async () => {
  delete process.env.DISPLAY_DATA_CUTOFF_AT;
  await closeIntegrationPool();
  await prisma.$disconnect();
});

describe("reporting display cutoff against PostgreSQL", () => {
  it("bounds event counts/details and reply visibility while preserving live state", async () => {
    const client = await prisma.client.create({ data: { name: "Cutoff", slug: "cutoff" } });
    const oldContact = await prisma.contact.create({ data: { clientId: client.id, email: "old@example.test" } });
    const newContact = await prisma.contact.create({ data: { clientId: client.id, email: "new@example.test", isSuppressed: true } });
    await prisma.contact.create({ data: { clientId: client.id, email: "queued@example.test" } });
    const mailbox = await prisma.clientMailboxIdentity.create({ data: {
      clientId: client.id, provider: "GOOGLE", email: "sender@example.test", emailNormalized: "sender@example.test", connectionStatus: "CONNECTED",
    } });
    const oldSend = await prisma.outboundEmail.create({ data: {
      clientId: client.id, contactId: oldContact.id, toEmail: oldContact.email!, status: "DELIVERED",
      sentAt: BEFORE, deliveredAt: BEFORE, openedAt: BEFORE,
    } });
    const newSend = await prisma.outboundEmail.create({ data: {
      clientId: client.id, contactId: newContact.id, toEmail: newContact.email!, status: "DELIVERED",
      mailboxIdentityId: mailbox.id, sentAt: AFTER, deliveredAt: AFTER, openedAt: AFTER,
    } });
    await prisma.outboundEmail.create({ data: {
      clientId: client.id, toEmail: "queued@example.test", status: "QUEUED",
    } });
    await prisma.inboundReply.createMany({ data: [
      { clientId: client.id, contactId: oldContact.id, linkedOutboundEmailId: oldSend.id, fromEmail: oldContact.email!, receivedAt: BEFORE, matchMethod: "BY_OUTBOUND_PROVIDER_ID" },
      { clientId: client.id, contactId: newContact.id, linkedOutboundEmailId: newSend.id, fromEmail: newContact.email!, receivedAt: AFTER, matchMethod: "BY_OUTBOUND_PROVIDER_ID" },
      { clientId: client.id, contactId: oldContact.id, fromEmail: oldContact.email!, receivedAt: BEFORE, matchMethod: "UNLINKED" },
      { clientId: client.id, fromEmail: "unlinked@example.test", receivedAt: AFTER, matchMethod: "UNLINKED" },
    ] });

    const metrics = await loadClientOutreachMetrics(client.id, [client.id]);
    expect(metrics.sent).toBe(1);
    expect(metrics.delivered).toBe(1);
    expect(metrics.opens).toBe(1);
    expect(metrics.replies).toBe(1);
    expect(metrics.queued).toBe(1);
    expect(metrics.totalContacts).toBe(3);
    expect(metrics.emailSendable).toBe(2);

    const sentDetail = await loadReportDetail({ metric: "sent", clientId: client.id, accessibleClientIds: [client.id] });
    const replyDetail = await loadReportDetail({ metric: "replies", clientId: client.id, accessibleClientIds: [client.id] });
    expect(sentDetail.rows.map((row) => row.id)).toEqual([newSend.id]);
    expect(replyDetail.rows).toHaveLength(1);
    expect(replyDetail.rows[0]?.whenIso).toBe(AFTER.toISOString());

    const queue = await getRepliesNeedingAPerson([client.id], "viewer");
    expect(queue.entries).toHaveLength(1);
    expect(queue.entries.every((entry) => entry.receivedAt >= CUTOFF)).toBe(true);
    expect(await loadClientLinkedReplyDetail({ clientId: client.id, replyId: (await prisma.inboundReply.findFirstOrThrow({ where: { linkedOutboundEmailId: newSend.id } })).id })).not.toBeNull();
    expect(await loadClientOrphanReplyDetail({ clientId: client.id, replyId: (await prisma.inboundReply.findFirstOrThrow({ where: { linkedOutboundEmailId: null, receivedAt: BEFORE } })).id })).toBeNull();
    expect(await prisma.inboundReply.count({ where: { clientId: client.id } })).toBe(4);
    expect(await prisma.outboundEmail.count({ where: { clientId: client.id } })).toBe(3);
    expect((await prisma.contact.findUniqueOrThrow({ where: { id: newContact.id } })).isSuppressed).toBe(true);
    delete process.env.DISPLAY_DATA_CUTOFF_AT;
    expect((await loadClientOutreachMetrics(client.id, [client.id])).sent).toBe(2);
  });
});
