import { afterEach, expect, it, vi } from "vitest";
import { runQueueRecovery } from "../App_Data/jobs/triggered/odoutreach-queue-recovery/run.js";
afterEach(() => vi.unstubAllGlobals());
it("makes no request until explicitly enabled", async () => {
  const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
  expect(await runQueueRecovery({ secret: "test" })).toEqual({ ok: true, skipped: true });
  expect(fetch).not.toHaveBeenCalled();
});
it("requests only recovery, without advancing campaigns or leaking response details", async () => {
  const fetch = vi.fn().mockResolvedValue({ status: 200, json: async () => ({ schedulerProtocol: 1, ok: true, private: "hidden" }) });
  vi.stubGlobal("fetch", fetch);
  expect(await runQueueRecovery({ enabled: "on", secret: "test" })).toEqual({ ok: true, skipped: false });
  expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ schedulerProtocol: 1, phase: "queue" });
  expect(fetch.mock.calls[0][1].redirect).toBe("error");
  expect(fetch).toHaveBeenCalledTimes(1);
});
it.each([207, 401, 500])("does not retry uncertain HTTP %s", async status => {
  const fetch = vi.fn().mockResolvedValue({ status }); vi.stubGlobal("fetch", fetch);
  await expect(runQueueRecovery({ enabled: "on", secret: "test" })).rejects.toThrow();
  expect(fetch).toHaveBeenCalledTimes(1);
});
it("rejects incompatible protocol and reported failure", async () => {
  for (const result of [{ schedulerProtocol: 0, ok: true }, { schedulerProtocol: 1, ok: false }]) {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ status: 200, json: async () => result }));
    await expect(runQueueRecovery({ enabled: "on", secret: "test" })).rejects.toThrow();
  }
});
it("refuses missing credentials", async () => {
  const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
  await expect(runQueueRecovery({ enabled: "on", secret: " " })).rejects.toThrow();
  expect(fetch).not.toHaveBeenCalled();
});
