import { afterAll, afterEach, beforeEach, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { resetIntegrationDatabase, closeIntegrationPool } from "@/test/integration/database";
const { plan, dispatch } = vi.hoisted(() => ({ plan: vi.fn(), dispatch: vi.fn() }));
vi.mock("./step-sends", () => ({ planSequenceStepSends: plan }));
vi.mock("./send-introduction", () => ({ sendSequenceStepBatch: dispatch }));
import { advanceDueSequenceFollowUps } from "./advance-due-followups";

beforeEach(async () => {
  await resetIntegrationDatabase();
  vi.stubEnv("AUTONOMOUS_RELAY_ACTIVE", "0");
  vi.stubEnv("SEQUENCE_FOLLOWUP_AUTOSEND", "true");
  plan.mockReset().mockResolvedValue({});
  dispatch.mockReset().mockResolvedValue({ counts: { queued: 1 } });
  // Eligibility is real SQL; prior-send proof and transports are separate fixtures.
  vi.spyOn(prisma.clientEmailSequenceStepSend, "count").mockResolvedValue(1);
  await prisma.staffUser.create({ data: { id: "actor", entraObjectId: "actor", email: "actor@example.test", role: "ADMIN" } });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });
afterAll(async () => { await prisma.$disconnect(); await closeIntegrationPool(); });

async function client(id: string, consent: boolean | null, status: "ACTIVE" | "ONBOARDING" = "ACTIVE", deletedAt: Date | null = null) {
  await prisma.client.create({ data: { id, name: id, slug: id, autonomousSendEnabled: consent, status, deletedAt } });
  const list = await prisma.contactList.create({ data: { clientId: id, name: "Synthetic list" } });
  const template = await prisma.clientEmailTemplate.create({ data: { clientId: id, name: "Follow-up", category: "FOLLOW_UP_1", status: "APPROVED", subject: "Synthetic", content: "Synthetic" } });
  await prisma.clientEmailSequence.create({ data: { clientId: id, contactListId: list.id, name: "Synthetic sequence", status: "APPROVED", steps: { create: { templateId: template.id, category: "FOLLOW_UP_1", position: 1 } } } });
}

it("selects only live active clients with explicit consent and labels their requests automated", async () => {
  await client("allowed", true);
  await client("disabled", false);
  await client("unset", null);
  await client("onboarding", true, "ONBOARDING");
  await client("deleted", true, "ACTIVE", new Date());
  const result = await advanceDueSequenceFollowUps();
  expect(result).toMatchObject({ clientsProcessed: 1, followUpsQueued: 1, errors: [] });
  expect(dispatch).toHaveBeenCalledTimes(1);
  expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ clientId: "allowed", initiatedByAutomation: true, autoSendMaxOverdueMs: expect.any(Number) }));
  expect(plan).toHaveBeenCalledTimes(1);
});

it("does not use an inactive administrator as its system actor", async () => {
  await client("allowed", true);
  await prisma.staffUser.update({ where: { id: "actor" }, data: { isActive: false } });
  const result = await advanceDueSequenceFollowUps();
  expect(result.errors).toHaveLength(1);
  expect(plan).not.toHaveBeenCalled();
  expect(dispatch).not.toHaveBeenCalled();
});

it("does not plan or advance Strategic clients even with a saved machine-send opt-in", async () => {
  await client("strategic", true);
  await prisma.client.update({ where: { id: "strategic" }, data: { serviceTier: "STRATEGIC" } });
  const result = await advanceDueSequenceFollowUps();
  expect(result).toMatchObject({ clientsProcessed: 0, followUpsQueued: 0, errors: [] });
  expect(plan).not.toHaveBeenCalled();
  expect(dispatch).not.toHaveBeenCalled();
});
