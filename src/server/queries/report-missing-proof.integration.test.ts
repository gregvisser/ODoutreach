import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/db";
import { loadClientOutreachMetrics } from "@/server/queries/outreach-metrics";
import { closeIntegrationPool, resetIntegrationDatabase } from "@/test/integration/database";

const TODAY = new Date("2026-09-14T12:00:00Z");
const YESTERDAY = new Date("2026-09-13T12:00:00Z");
const WINDOW = { gte: new Date("2026-09-14T00:00:00Z"), lt: new Date("2026-09-15T00:00:00Z") };

beforeEach(resetIntegrationDatabase);
afterAll(async () => { await closeIntegrationPool(); await prisma.$disconnect(); });

async function fixture() {
  const client = await prisma.client.create({ data: { name: "Report proof", slug: "report-proof" } });
  const list = await prisma.contactList.create({ data: { clientId: client.id, name: "Test list" } });
  const template = await prisma.clientEmailTemplate.create({ data: {
    clientId: client.id, name: "Intro", category: "INTRODUCTION", subject: "Test", content: "Test",
  } });
  const sequence = await prisma.clientEmailSequence.create({ data: {
    clientId: client.id, name: "Test sequence", contactListId: list.id,
  } });
  const step = await prisma.clientEmailSequenceStep.create({ data: {
    sequenceId: sequence.id, position: 1, category: "INTRODUCTION", templateId: template.id,
  } });
  let n = 0;
  return { client, async planned(outboundEmailId?: string, email = "person@example.test") {
    n += 1;
    const contact = await prisma.contact.create({ data: { clientId: client.id, email: `${n}-${email}` } });
    const enrollment = await prisma.clientEmailSequenceEnrollment.create({ data: {
      clientId: client.id, sequenceId: sequence.id, contactId: contact.id, contactListId: list.id,
    } });
    return prisma.clientEmailSequenceStepSend.create({ data: {
      clientId: client.id, sequenceId: sequence.id, enrollmentId: enrollment.id, stepId: step.id,
      templateId: template.id, contactId: contact.id, contactListId: list.id,
      status: "SENT", idempotencyKey: `proof-${n}`, outboundEmailId, updatedAt: TODAY,
    } });
  } };
}

describe("Reports count each sequence send's own confirmation", () => {
  it("does not let unrelated confirmed or queued messages hide missing proof", async () => {
    const f = await fixture();
    await f.planned();
    await prisma.outboundEmail.createMany({ data: [
      { clientId: f.client.id, toEmail: "unrelated@example.test", status: "SENT", sentAt: TODAY },
      { clientId: f.client.id, toEmail: "waiting@example.test", status: "QUEUED" },
    ] });
    const all = await loadClientOutreachMetrics(f.client.id, [f.client.id]);
    const day = await loadClientOutreachMetrics(f.client.id, [f.client.id], WINDOW);
    expect(all.sent).toBe(1);
    expect(all.queued).toBe(1);
    expect(all.sendProofMissing).toBe(1);
    expect(day.sendProofMissing).toBe(1);
  });

  it("does not turn yesterday's confirmed send into missing proof after a step update", async () => {
    const f = await fixture();
    const sent = await prisma.outboundEmail.create({ data: {
      clientId: f.client.id, toEmail: "confirmed@example.test", status: "REPLIED",
      sentAt: YESTERDAY, providerMessageId: "test-provider-confirmation",
    } });
    await f.planned(sent.id);
    expect((await loadClientOutreachMetrics(f.client.id, [f.client.id])).sendProofMissing).toBe(0);
    const day = await loadClientOutreachMetrics(f.client.id, [f.client.id], WINDOW);
    expect(day.sent).toBe(0);
    expect(day.sendProofMissing).toBe(0);
  });

  it("excludes its own waiting outbound and accepts provider-only legacy proof", async () => {
    const f = await fixture();
    for (const status of ["REQUESTED", "PREPARING", "QUEUED", "PROCESSING"] as const) {
      const outbound = await prisma.outboundEmail.create({ data: {
        clientId: f.client.id, toEmail: `${status}@example.test`, status,
      } });
      await f.planned(outbound.id);
    }
    const legacy = await prisma.outboundEmail.create({ data: {
      clientId: f.client.id, toEmail: "legacy@example.test", status: "SENT", providerMessageId: "legacy-proof",
    } });
    await f.planned(legacy.id);
    const missing = await prisma.outboundEmail.create({ data: {
      clientId: f.client.id, toEmail: "missing@example.test", status: "SENT",
    } });
    await f.planned(missing.id);
    const day = await loadClientOutreachMetrics(f.client.id, [f.client.id], WINDOW);
    expect(day.queued).toBe(4);
    expect(day.sendProofMissing).toBe(1);
  });

  it("excludes active seed recipients without hiding unrelated missing records", async () => {
    const f = await fixture();
    const previousFlag = process.env.INTERNAL_SEED_ALLOWLIST_ENABLED;
    process.env.INTERNAL_SEED_ALLOWLIST_ENABLED = "true";
    try {
      await prisma.internalSeedAddress.create({ data: {
        email: "seed@opensdoors.co.uk", isActive: true, label: "Isolated test seed",
      } });
      const seed = await prisma.outboundEmail.create({ data: {
        clientId: f.client.id, toEmail: "seed@opensdoors.co.uk", status: "SENT",
      } });
      await f.planned(seed.id);
      const orphanSeed = await f.planned();
      await prisma.contact.update({ where: { id: orphanSeed.contactId }, data: { email: "seed@opensdoors.co.uk" } });
      const missing = await f.planned();
      await prisma.contact.update({ where: { id: missing.contactId }, data: { email: null } });
      expect((await loadClientOutreachMetrics(f.client.id, [f.client.id])).sendProofMissing).toBe(1);
    } finally {
      if (previousFlag === undefined) delete process.env.INTERNAL_SEED_ALLOWLIST_ENABLED;
      else process.env.INTERNAL_SEED_ALLOWLIST_ENABLED = previousFlag;
    }
  });
});
