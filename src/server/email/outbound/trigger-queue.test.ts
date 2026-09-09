import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { triggerOutboundQueueDrain } from "./trigger-queue";

const fetchMock = vi.fn();
beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("AUTOPROCESS_OUTBOUND_QUEUE", "false");
  vi.stubEnv("OUTBOUND_QUEUE_BATCH_SIZE", "8");
  vi.stubEnv("INTERNAL_APP_URL", "https://example.test");
  vi.stubEnv("PROCESS_QUEUE_SECRET", "synthetic");
  fetchMock.mockResolvedValue(new Response(JSON.stringify({ dispatchProtocol: 1, ok: true })));
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

it("wakes only the first configured batch, with explicit client and email IDs", async () => {
  const ids = Array.from({ length: 60 }, (_, i) => `email-${i}`);
  await triggerOutboundQueueDrain({ clientId: "client", outboundEmailIds: ids });
  expect(fetchMock).toHaveBeenCalledTimes(1);
  const [url, init] = fetchMock.mock.calls[0];
  expect(url).toBe("https://example.test/api/internal/outbound/dispatch/v1");
  expect(JSON.parse(init.body)).toEqual({ dispatchProtocol: 1, clientId: "client", outboundEmailIds: ids.slice(0, 8) });
  expect(init.redirect).toBe("error");
});
it("rejects bad IDs beyond the first batch before any dispatch", async () => {
  await expect(triggerOutboundQueueDrain({ clientId: "client", outboundEmailIds: [...Array.from({ length: 55 }, (_, i) => `email-${i}`), " "] })).rejects.toThrow("Invalid outbound dispatch scope");
  expect(fetchMock).not.toHaveBeenCalled();
});
it("does no work for an empty list and rejects duplicate IDs across batches", async () => {
  await triggerOutboundQueueDrain({ clientId: "client", outboundEmailIds: [] });
  await expect(triggerOutboundQueueDrain({ clientId: "client", outboundEmailIds: [...Array.from({ length: 55 }, (_, i) => `email-${i}`), "email-0"] })).rejects.toThrow();
  expect(fetchMock).not.toHaveBeenCalled();
});
it.each([404, 207, 500])("never retries or falls back after status %s", async (status) => {
  fetchMock.mockResolvedValue(new Response(JSON.stringify({ ok: false }), { status }));
  await triggerOutboundQueueDrain({ clientId: "client", outboundEmailIds: ["email"] });
  expect(fetchMock).toHaveBeenCalledTimes(1);
});
it("does not retry a request whose network outcome is unknown", async () => {
  fetchMock.mockRejectedValue(new Error("synthetic timeout"));
  await triggerOutboundQueueDrain({ clientId: "client", outboundEmailIds: ["email"] });
  expect(fetchMock).toHaveBeenCalledTimes(1);
});
