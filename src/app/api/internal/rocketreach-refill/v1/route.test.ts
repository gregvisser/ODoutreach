import { afterEach, beforeEach, expect, it, vi } from "vitest";

const refill = vi.hoisted(() => vi.fn());
vi.mock("@/server/prospect-research/auto-refill", () => ({ runDueRocketReachListRefills: refill }));
import { POST } from "./route";

const request = (secret = "synthetic") =>
  new Request("https://example.test/api/internal/rocketreach-refill/v1", {
    method: "POST",
    headers: { authorization: `Bearer ${secret}` },
  });

beforeEach(() => {
  vi.stubEnv("PROCESS_QUEUE_SECRET", "synthetic");
  refill.mockReset();
  refill.mockResolvedValue({ failed: 0, errors: [], processed: 0, skipped: 0, refilled: 0, killSwitch: "off" });
});
afterEach(() => vi.unstubAllEnvs());

it("rejects a missing or wrong scheduler secret before any refill work", async () => {
  vi.stubEnv("PROCESS_QUEUE_SECRET", "");
  expect((await POST(request() as never)).status).toBe(503);
  vi.stubEnv("PROCESS_QUEUE_SECRET", "synthetic");
  expect((await POST(request("wrong") as never)).status).toBe(401);
  expect(refill).not.toHaveBeenCalled();
});

it("reports a clean no-op when the kill switch leaves the job with nothing failed", async () => {
  const response = await POST(request() as never);
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ ok: true, killSwitch: "off" });
});

it("does not call a failed top-up a success", async () => {
  refill.mockResolvedValue({ failed: 1, errors: ["RocketReach search failed"], processed: 1, skipped: 0, refilled: 0, killSwitch: "on" });
  const response = await POST(request() as never);
  expect(response.status).toBe(207);
  expect(await response.json()).toMatchObject({ ok: false, failedCount: 1 });
});
