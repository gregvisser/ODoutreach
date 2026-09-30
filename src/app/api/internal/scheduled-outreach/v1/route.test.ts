import { beforeEach, afterEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ plan: vi.fn(), sync: vi.fn(), advance: vi.fn(), queue: vi.fn(), resume: vi.fn(), tick: vi.fn() }));
vi.mock("@/server/mailbox/scheduled-outreach", () => ({ loadScheduledOutreachPlan: m.plan }));
vi.mock("@/server/mailbox/mailbox-inbox-sync", () => ({ syncActiveClientMailboxInboxes: m.sync }));
vi.mock("@/server/email-sequences/advance-due-followups", () => ({ advanceDueSequenceFollowUps: m.advance }));
vi.mock("@/server/email-sequences/resume-pacing-holds", () => ({ resumePacingHeldSends: m.resume }));
vi.mock("@/server/email/outbound/queue-processor", () => ({ processOutboundSendQueue: m.queue }));
vi.mock("@/server/ai-campaigns/tick", () => ({ tickAiCampaignsForClient: m.tick }));
import { POST } from "./route";
const request = (body: object, secret = "synthetic") => new Request("https://example.test/api/internal/scheduled-outreach/v1", { method: "POST", headers: { authorization: `Bearer ${secret}` }, body: JSON.stringify(body) });
beforeEach(() => { vi.resetAllMocks(); vi.stubEnv("PROCESS_QUEUE_SECRET", "synthetic"); m.plan.mockResolvedValue({ clientIds: ["client"], mailboxIds: ["mailbox"] }); m.queue.mockResolvedValue({ claimed: 0, completed: 0, errors: [] }); m.resume.mockResolvedValue({ stepsProcessed: 0, resumedQueued: 0, skippedSteps: [], errors: [] }); m.advance.mockResolvedValue({ clientsProcessed: 0, sequencesProcessed: 0, stepsProcessed: 0, followUpsQueued: 0, skippedSteps: [], errors: [] }); m.tick.mockResolvedValue({ processed: 0, errors: [] }); });
afterEach(() => vi.unstubAllEnvs());
it("rejects unauthenticated and unversioned requests before any work", async () => {
  expect((await POST(request({ schedulerProtocol: 1, phase: "queue" }, "wrong") as never)).status).toBe(401);
  expect((await POST(request({ phase: "queue" }) as never)).status).toBe(409);
  expect(m.plan).not.toHaveBeenCalled(); expect(m.queue).not.toHaveBeenCalled();
});
it("does not trust a mailbox from an older open-window plan", async () => {
  m.plan.mockResolvedValue({ clientIds: [], mailboxIds: [] });
  const response = await POST(request({ schedulerProtocol: 1, phase: "sync", mailboxId: "mailbox" }) as never);
  expect(await response.json()).toMatchObject({ ok: true, skipped: true }); expect(m.sync).not.toHaveBeenCalled();
});
it("uses server-selected client scope for queue dispatch", async () => {
  await POST(request({ schedulerProtocol: 1, phase: "queue", clientIds: ["forged"] }) as never);
  expect(m.queue).toHaveBeenCalledWith({ limit: 25, clientIds: ["client"] });
});
it("returns a sanitized error when a scheduled phase throws", async () => {
  m.advance.mockRejectedValue(new Error("connect postgres://opensdoors:super-secret@db.internal/prod failed"));
  const response = await POST(request({ schedulerProtocol: 1, phase: "advance", clientId: "client" }) as never);
  expect(response.status).toBe(500);
  const body = await response.json() as { errors?: string[] };
  expect(body.errors?.[0]).toMatch(/failed/);
  expect(body.errors?.[0]).not.toMatch(/super-secret|postgres:\/\//);
});
it("resumes pacing holds for the planned client before machine follow-ups", async () => {
  m.resume.mockResolvedValue({ stepsProcessed: 1, resumedQueued: 2, skippedSteps: [], errors: [] });
  const response = await POST(request({ schedulerProtocol: 1, phase: "advance", clientId: "client" }) as never);
  expect(response.status).toBe(200);
  expect(m.resume).toHaveBeenCalledWith({ clientId: "client" });
  expect(m.advance).toHaveBeenCalledWith({ clientId: "client" });
  expect(m.resume.mock.invocationCallOrder[0]).toBeLessThan(m.advance.mock.invocationCallOrder[0]);
});
it("fails the tick when an AI campaign reports a problem and does not hide it behind a clean advance", async () => {
  m.tick.mockResolvedValue({ processed: 1, errors: ["The emails scored 60 after 3 checks. They were not sent."] });
  const response = await POST(request({ schedulerProtocol: 1, phase: "advance", clientId: "client" }) as never);
  expect(response.status).toBe(207);
  expect(m.tick).toHaveBeenCalledWith("client");
  expect(await response.json()).toMatchObject({ ok: false, failedCount: 1 });
});
it("fails the tick when pacing resume reports an error and does not hide it behind a clean advance", async () => {
  m.resume.mockResolvedValue({ stepsProcessed: 1, resumedQueued: 0, skippedSteps: [], errors: ["synthetic pacing failure"] });
  const response = await POST(request({ schedulerProtocol: 1, phase: "advance", clientId: "client" }) as never);
  expect(response.status).toBe(207);
  expect(await response.json()).toMatchObject({ ok: false, failedCount: 1 });
});
it("preserves partial failure instead of declaring a clean scheduled run", async () => {
  m.queue.mockResolvedValue({ claimed: 1, completed: 0, errors: ["synthetic failure"] });
  const response = await POST(request({ schedulerProtocol: 1, phase: "queue" }) as never);
  expect(response.status).toBe(207); expect(await response.json()).toMatchObject({ schedulerProtocol: 1, ok: false, failedCount: 1 });
});
