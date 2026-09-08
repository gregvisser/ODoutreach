import { beforeEach, afterEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ plan: vi.fn(), sync: vi.fn(), advance: vi.fn(), queue: vi.fn() }));
vi.mock("@/server/mailbox/scheduled-outreach", () => ({ loadScheduledOutreachPlan: m.plan }));
vi.mock("@/server/mailbox/mailbox-inbox-sync", () => ({ syncActiveClientMailboxInboxes: m.sync }));
vi.mock("@/server/email-sequences/advance-due-followups", () => ({ advanceDueSequenceFollowUps: m.advance }));
vi.mock("@/server/email/outbound/queue-processor", () => ({ processOutboundSendQueue: m.queue }));
import { POST } from "./route";
const request = (body: object, secret = "synthetic") => new Request("https://example.test/api/internal/scheduled-outreach/v1", { method: "POST", headers: { authorization: `Bearer ${secret}` }, body: JSON.stringify(body) });
beforeEach(() => { vi.resetAllMocks(); vi.stubEnv("PROCESS_QUEUE_SECRET", "synthetic"); m.plan.mockResolvedValue({ clientIds: ["client"], mailboxIds: ["mailbox"] }); m.queue.mockResolvedValue({ claimed: 0, completed: 0, errors: [] }); });
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
it("preserves partial failure instead of declaring a clean scheduled run", async () => {
  m.queue.mockResolvedValue({ claimed: 1, completed: 0, errors: ["synthetic failure"] });
  const response = await POST(request({ schedulerProtocol: 1, phase: "queue" }) as never);
  expect(response.status).toBe(207); expect(await response.json()).toMatchObject({ schedulerProtocol: 1, ok: false, failedCount: 1 });
});
