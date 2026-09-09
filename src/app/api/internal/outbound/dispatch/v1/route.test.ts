import { afterEach, beforeEach, expect, it, vi } from "vitest";
const queue = vi.hoisted(() => vi.fn());
vi.mock("@/server/email/outbound/queue-processor", () => ({ processOutboundSendQueue: queue }));
import { POST } from "./route";
const request = (body: object, secret = "synthetic") => new Request("https://example.test/api/internal/outbound/dispatch/v1", { method: "POST", headers: { authorization: `Bearer ${secret}` }, body: JSON.stringify(body) });
beforeEach(() => { queue.mockReset(); vi.stubEnv("PROCESS_QUEUE_SECRET", "synthetic"); queue.mockResolvedValue({ claimed: 0, completed: 0, errors: [] }); });
afterEach(() => vi.unstubAllEnvs());
it("rejects unauthenticated, unversioned, missing, and empty scope before queue work", async () => {
  expect((await POST(request({}, "wrong") as never)).status).toBe(401);
  for (const body of [{}, { clientId: "client", outboundEmailIds: ["email"] }, { dispatchProtocol: 1, clientId: "client", outboundEmailIds: [] }, { dispatchProtocol: 1, outboundEmailIds: ["email"] }]) {
    expect((await POST(request(body) as never)).status).toBe(400);
  }
  expect(queue).not.toHaveBeenCalled();
});
it("passes both scope constraints and ignores attempts to increase the limit", async () => {
  await POST(request({ dispatchProtocol: 1, clientId: "client", outboundEmailIds: ["email"], limit: 1000 }) as never);
  expect(queue).toHaveBeenCalledExactlyOnceWith({ limit: 1, dispatchScope: { clientId: "client", outboundEmailIds: ["email"] } });
});
it("reports partial failures instead of claiming successful completion", async () => {
  queue.mockResolvedValue({ claimed: 1, completed: 0, errors: ["synthetic"] });
  const response = await POST(request({ dispatchProtocol: 1, clientId: "client", outboundEmailIds: ["email"] }) as never);
  expect(response.status).toBe(207);
  expect(await response.json()).toMatchObject({ dispatchProtocol: 1, ok: false });
});
