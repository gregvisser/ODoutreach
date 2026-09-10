import { afterEach, beforeEach, expect, it, vi } from "vitest";
const run = vi.hoisted(() => vi.fn());
vi.mock("@/server/email-sequences/selected-campaign-scheduler", () => ({ runSelectedCampaignFollowUps: run }));
import { POST } from "./route";
import { isPublicPath } from "@/lib/public-paths";
const req = (body: unknown, token = "test") => new Request("https://example.test/api/internal/campaign-scheduler/v1", { method: "POST", headers: { authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
beforeEach(() => { run.mockReset().mockResolvedValue({ ok: true, skipped: true }); vi.stubEnv("PROCESS_QUEUE_SECRET", "test"); vi.stubEnv("CAMPAIGN_SCHEDULER_SELECTION", "server-selection"); });
afterEach(() => vi.unstubAllEnvs());
it("requires token and refuses caller-provided campaign overrides", async () => {
  expect((await POST(req({ campaignSchedulerProtocol: 1 }, "wrong") as never)).status).toBe(401);
  expect((await POST(req({ campaignSchedulerProtocol: 1, sequenceIds: ["unapproved"] }) as never)).status).toBe(400);
  expect(run).not.toHaveBeenCalled();
});
it("uses only server selection and allows exactly this middleware path", async () => {
  expect(isPublicPath("/api/internal/campaign-scheduler/v1")).toBe(true);
  expect(isPublicPath("/api/internal/campaign-scheduler/other")).toBe(false);
  expect((await POST(req({ campaignSchedulerProtocol: 1 }) as never)).status).toBe(200);
  expect(run).toHaveBeenCalledExactlyOnceWith("server-selection");
});
it("does not turn incomplete execution into success", async () => {
  run.mockResolvedValue({ ok: false, reason: "reply-sync-incomplete" });
  expect((await POST(req({ campaignSchedulerProtocol: 1 }) as never)).status).toBe(207);
  run.mockRejectedValue(new Error("private details"));
  const result = await POST(req({ campaignSchedulerProtocol: 1 }) as never);
  expect(result.status).toBe(500);
  expect(await result.text()).not.toContain("private details");
});
