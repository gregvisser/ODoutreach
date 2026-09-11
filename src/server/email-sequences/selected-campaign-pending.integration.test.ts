import { afterAll, beforeEach, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { resetIntegrationDatabase, closeIntegrationPool } from "@/test/integration/database";
import { loadSelectedCampaignPendingIds } from "./selected-campaign-pending";
const scope = { clientId: "selected", sequenceIds: ["campaign"] };
beforeEach(async () => {
  await resetIntegrationDatabase();
  await prisma.client.create({ data: { id: "selected", name: "Synthetic", slug: "synthetic", status: "ACTIVE" } });
  await prisma.contactList.create({ data: { id: "list", clientId: "selected", name: "Synthetic" } });
  await prisma.contact.create({ data: { id: "contact", clientId: "selected", email: "synthetic@example.test" } });
  await prisma.clientEmailTemplate.create({ data: { id: "template", clientId: "selected", name: "Synthetic", category: "FOLLOW_UP_1", subject: "Synthetic", content: "Synthetic", status: "APPROVED" } });
  await prisma.clientEmailSequence.create({ data: { id: "campaign", clientId: "selected", contactListId: "list", name: "Synthetic", status: "APPROVED" } });
  await prisma.clientEmailSequenceStep.create({ data: { id: "step", sequenceId: "campaign", position: 2, category: "FOLLOW_UP_1", templateId: "template" } });
  await prisma.clientEmailSequenceEnrollment.create({ data: { id: "enrollment", clientId: "selected", sequenceId: "campaign", contactId: "contact", contactListId: "list", status: "PENDING" } });
  await prisma.outboundEmail.create({ data: { id: "saved", clientId: "selected", toEmail: "synthetic@example.test", metadata: { sendOrigin: "AUTOMATED_SEQUENCE" }, status: "QUEUED" } });
  await prisma.clientEmailSequenceStepSend.create({ data: { clientId: "selected", sequenceId: "campaign", enrollmentId: "enrollment", stepId: "step", templateId: "template", contactId: "contact", contactListId: "list", idempotencyKey: "synthetic", outboundEmailId: "saved", status: "SENT" } });
});
afterAll(async () => { await prisma.$disconnect(); await closeIntegrationPool(); });
it("finds the saved queue row after a worker interruption without creating another email", async () => {
  expect(await loadSelectedCampaignPendingIds(scope)).toEqual(["saved"]);
  expect(await loadSelectedCampaignPendingIds(scope)).toEqual(["saved"]);
  expect(await prisma.outboundEmail.count()).toBe(1);
  expect(await loadSelectedCampaignPendingIds({ ...scope, sequenceIds: ["other"] })).toEqual([]);
  expect(await loadSelectedCampaignPendingIds({ ...scope, clientId: "other" })).toEqual([]);
});
it("excludes manual mail, future retries and uncertain or confirmed sends", async () => {
  const now = new Date();
  for (const data of [
    { metadata: { sendOrigin: "MANUAL" } },
    { metadata: { sendOrigin: "AUTOMATED_SEQUENCE" }, nextRetryAt: new Date(now.getTime() + 60000) },
    { nextRetryAt: null, dispatchStartedAt: now },
    { dispatchStartedAt: null, providerMessageId: "accepted" },
    { providerMessageId: null, sentAt: now },
  ]) {
    await prisma.outboundEmail.update({ where: { id: "saved" }, data });
    expect(await loadSelectedCampaignPendingIds(scope, now)).toEqual([]);
  }
});
it("does not revive a replied or paused enrollment", async () => {
  for (const status of ["COMPLETED", "PAUSED", "EXCLUDED"] as const) {
    await prisma.clientEmailSequenceEnrollment.update({ where: { id: "enrollment" }, data: { status } });
    expect(await loadSelectedCampaignPendingIds(scope)).toEqual([]);
  }
});
it("does not recover an introduction or an unapproved campaign", async () => {
  await prisma.clientEmailSequenceStep.update({ where: { id: "step" }, data: { category: "INTRODUCTION" } });
  expect(await loadSelectedCampaignPendingIds(scope)).toEqual([]);
  await prisma.clientEmailSequenceStep.update({ where: { id: "step" }, data: { category: "FOLLOW_UP_1" } });
  await prisma.clientEmailSequence.update({ where: { id: "campaign" }, data: { status: "DRAFT" } });
  expect(await loadSelectedCampaignPendingIds(scope)).toEqual([]);
});

