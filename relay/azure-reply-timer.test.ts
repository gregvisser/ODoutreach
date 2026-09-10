import { afterEach, expect, it, vi } from "vitest";
import { runReplyTimer } from "../App_Data/jobs/triggered/odoutreach-reply-sync/run.js";
afterEach(() => vi.unstubAllGlobals());

it("does nothing until explicitly enabled", async () => {
  const runner = vi.fn();
  expect(await runReplyTimer({ runner, enabled: undefined, secret: undefined })).toEqual({ ok: true, skipped: true });
  expect(runner).not.toHaveBeenCalled();
});
it("requires credentials before calling the receive-only runner", async () => {
  const runner = vi.fn();
  await expect(runReplyTimer({ enabled: "on", secret: " ", runner })).rejects.toThrow();
  expect(runner).not.toHaveBeenCalled();
});
it("uses only the receive endpoint and reports aggregate results", async () => {
  const runner = vi.fn().mockResolvedValue({ ok: true, processed: 2, ingested: 4, repliesLinked: 1, private: "not logged" });
  expect(await runReplyTimer({ enabled: "on", secret: " synthetic ", runner })).toEqual({ ok: true, processed: 2, ingested: 4, repliesLinked: 1 });
  expect(runner).toHaveBeenCalledWith({ url: "https://opensdoors.bidlow.co.uk/api/internal/replies/sync", secret: "synthetic" });
});
it("fails a partial run without retrying", async () => {
  const runner = vi.fn().mockResolvedValue({ ok: false });
  await expect(runReplyTimer({ enabled: "on", secret: "synthetic", runner })).rejects.toThrow();
  expect(runner).toHaveBeenCalledTimes(1);
});
it("loads the shipped runner and walks only the finite receive plan", async () => {
  const fetch = vi.fn()
    .mockResolvedValueOnce({ status: 200, json: async () => ({ batchProtocol: 1, mailboxIds: ["synthetic-mailbox"] }) })
    .mockResolvedValueOnce({ status: 200, json: async () => ({ batchProtocol: 1, ok: true, processed: 1, succeeded: 1, failed: 0, ingested: 2, repliesLinked: 1 }) });
  vi.stubGlobal("fetch", fetch);
  expect(await runReplyTimer({ enabled: "on", secret: "synthetic", runner: undefined })).toEqual({ ok: true, processed: 1, ingested: 2, repliesLinked: 1 });
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(JSON.parse(fetch.mock.calls[0][1].body).planOnly).toBe(true);
  expect(JSON.parse(fetch.mock.calls[1][1].body).mailboxId).toBe("synthetic-mailbox");
  expect(fetch.mock.calls.every(([url]) => url === "https://opensdoors.bidlow.co.uk/api/internal/replies/sync")).toBe(true);
});
