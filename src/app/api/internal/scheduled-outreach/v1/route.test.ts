import { beforeEach, afterEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ plan: vi.fn(), sync: vi.fn(), advance: vi.fn(), queue: vi.fn(), resume: vi.fn(), tick: vi.fn(), targets: vi.fn() }));
vi.mock("@/server/mailbox/scheduled-outreach", () => ({ loadScheduledOutreachPlan: m.plan }));
vi.mock("@/server/mailbox/mailbox-inbox-sync", () => ({ syncActiveClientMailboxInboxes: m.sync }));
vi.mock("@/server/email-sequences/advance-due-followups", () => ({ advanceDueSequenceFollowUps: m.advance }));
vi.mock("@/server/email-sequences/resume-pacing-holds", () => ({ resumePacingHeldSends: m.resume }));
vi.mock("@/server/email/outbound/queue-processor", () => ({ processOutboundSendQueue: m.queue }));
vi.mock("@/server/ai-campaigns/tick", () => ({ tickAiCampaignsForClient: m.tick }));
vi.mock("@/server/tenant/organisation-jobs", () => ({ targetsForClientIds: m.targets }));
import { POST } from "./route";
const request = (body: object, secret = "synthetic") => new Request("https://example.test/api/internal/scheduled-outreach/v1", { method: "POST", headers: { authorization: `Bearer ${secret}` }, body: JSON.stringify(body) });
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("PROCESS_QUEUE_SECRET", "synthetic");
  m.plan.mockResolvedValue({ clientIds: ["client"], mailboxIds: ["mailbox"] });
  m.targets.mockImplementation(async (ids: string[]) => (
    ids.length === 0 ? [] : [{ organisationId: "org_opensdoors", slug: "opensdoors", status: "ACTIVE", clientIds: ids }]
  ));
  m.queue.mockResolvedValue({ claimed: 0, completed: 0, errors: [] });
  m.resume.mockResolvedValue({ stepsProcessed: 0, resumedQueued: 0, skippedSteps: [], errors: [] });
  m.advance.mockResolvedValue({ clientsProcessed: 0, sequencesProcessed: 0, stepsProcessed: 0, followUpsQueued: 0, skippedSteps: [], errors: [] });
  m.tick.mockResolvedValue({ processed: 0, errors: [] });
});
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
it("does not fail the tick when the only problem is an empty recipient list", async () => {
  m.tick.mockResolvedValue({
    processed: 1,
    errors: ["No recipients are ready for this step. Open Review recipients, then launch again."],
  });
  const response = await POST(request({ schedulerProtocol: 1, phase: "advance", clientId: "client" }) as never);
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ ok: true, failedCount: 0 });
});
it("fails the tick when an AI campaign reports a problem and does not hide it behind a clean advance", async () => {
  m.tick.mockResolvedValue({ processed: 1, errors: ["No people were found within the credit budget."] });
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
it("drains the next organisation when the first organisation's queue throws", async () => {
  m.plan.mockResolvedValue({ clientIds: ["od", "nw"], mailboxIds: [] });
  m.targets.mockResolvedValue([
    { organisationId: "org_opensdoors", slug: "opensdoors", status: "ACTIVE", clientIds: ["od"] },
    { organisationId: "org_northwind", slug: "northwind", status: "ACTIVE", clientIds: ["nw"] },
  ]);
  m.queue.mockRejectedValueOnce(new Error("opensdoors mailbox dead")).mockResolvedValueOnce({ claimed: 1, completed: 1, errors: [] });
  const response = await POST(request({ schedulerProtocol: 1, phase: "queue" }) as never);
  expect(m.queue).toHaveBeenNthCalledWith(1, { limit: 25, clientIds: ["od"] });
  expect(m.queue).toHaveBeenNthCalledWith(2, { limit: 25, clientIds: ["nw"] });
  expect(response.status).toBe(207);
  const body = await response.json() as { ok: boolean; claimed: number; organisations: { slug: string; disposition: string }[] };
  expect(body.ok).toBe(false);
  expect(body.claimed).toBe(1);
  expect(body.organisations.map((org) => org.disposition)).toEqual(["failed", "ran"]);
});
it("does not send for a suspended organisation", async () => {
  m.targets.mockResolvedValue([
    { organisationId: "org_northwind", slug: "northwind", status: "SUSPENDED", clientIds: ["nw"] },
  ]);
  const response = await POST(request({ schedulerProtocol: 1, phase: "queue" }) as never);
  expect(m.queue).not.toHaveBeenCalled();
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ ok: true, claimed: 0 });
});
it("keeps an AI campaign tick throw on that client", async () => {
  m.tick.mockRejectedValue(new Error("postgres://opensdoors:secret@db/prod"));
  const response = await POST(request({ schedulerProtocol: 1, phase: "advance", clientId: "client" }) as never);
  expect(response.status).toBe(207);
  const body = await response.json() as { errors?: string[] };
  expect(body.errors?.[0]).toMatch(/redacted|failed/i);
  expect(body.errors?.join(" ")).not.toMatch(/secret|postgres:\/\//);
  expect(m.resume).toHaveBeenCalled();
});
