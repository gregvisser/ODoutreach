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
  vi.stubEnv("CAMPAIGN_SCHEDULER_SELECTION", "");
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

it("limits advancement to the selected campaign within the selected client", async () => {
  await client("selected", true);
  await client("other-client", true);
  const first = await prisma.clientEmailSequence.findFirstOrThrow({ where: { clientId: "selected" }, include: { steps: true } });
  const second = await prisma.clientEmailSequence.create({ data: {
    clientId: "selected", contactListId: first.contactListId, name: "Unselected campaign", status: "APPROVED",
    steps: { create: { templateId: first.steps[0].templateId, category: "FOLLOW_UP_1", position: 1 } },
  } });
  const result = await advanceDueSequenceFollowUps({ clientId: "selected", sequenceIds: [first.id] });
  expect(result).toMatchObject({ sequencesProcessed: 1, followUpsQueued: 1, errors: [] });
  expect(dispatch).toHaveBeenCalledTimes(1);
  expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ clientId: "selected", sequenceId: first.id }));
  expect(plan).not.toHaveBeenCalledWith(expect.objectContaining({ sequenceId: second.id }));
  dispatch.mockClear(); plan.mockClear();
  const wrongClient = await advanceDueSequenceFollowUps({ clientId: "other-client", sequenceIds: [first.id] });
  expect(wrongClient.sequencesProcessed).toBe(0);
  expect(dispatch).not.toHaveBeenCalled();
  expect(plan).not.toHaveBeenCalled();
});

it("does not let a campaign selection override human sending consent", async () => {
  await client("human", false);
  const sequence = await prisma.clientEmailSequence.findFirstOrThrow({ where: { clientId: "human" } });
  const result = await advanceDueSequenceFollowUps({ clientId: "human", sequenceIds: [sequence.id] });
  expect(result.clientsProcessed).toBe(0);
  expect(dispatch).not.toHaveBeenCalled();
  expect(plan).not.toHaveBeenCalled();
});

it("keeps legacy unscoped advancement inside the configured campaign selection", async () => {
  await client("selected", true);
  await client("other", true);
  const first = await prisma.clientEmailSequence.findFirstOrThrow({ where: { clientId: "selected" }, include: { steps: true } });
  const second = await prisma.clientEmailSequence.create({ data: {
    clientId: "selected", contactListId: first.contactListId, name: "Unselected", status: "APPROVED",
    steps: { create: { templateId: first.steps[0].templateId, category: "FOLLOW_UP_1", position: 1 } },
  } });
  vi.stubEnv("CAMPAIGN_SCHEDULER_SELECTION", JSON.stringify({ clientId: "selected", sequenceIds: [first.id] }));
  expect(await advanceDueSequenceFollowUps()).toMatchObject({ clientsProcessed: 1, sequencesProcessed: 1 });
  expect(dispatch).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ clientId: "selected", sequenceId: first.id }));
  dispatch.mockClear(); plan.mockClear();
  expect(await advanceDueSequenceFollowUps({ clientId: "other" })).toMatchObject({ clientsProcessed: 0 });
  expect(await advanceDueSequenceFollowUps({ clientId: "selected", sequenceIds: [second.id] })).toMatchObject({ sequencesProcessed: 0 });
  expect(dispatch).not.toHaveBeenCalled();
  expect(plan).not.toHaveBeenCalled();
});

it("rejects malformed server selection before planning or dispatch", async () => {
  await client("allowed", true);
  vi.stubEnv("CAMPAIGN_SCHEDULER_SELECTION", "{bad");
  await expect(advanceDueSequenceFollowUps()).rejects.toThrow();
  expect(dispatch).not.toHaveBeenCalled();
  expect(plan).not.toHaveBeenCalled();
});
