import { afterEach, expect, it, vi } from "vitest";
import { runReplyTimer } from "../App_Data/jobs/triggered/odoutreach-reply-sync/run.js";
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

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
  const runner = vi.fn().mockResolvedValue({ ok: false, planned: 4, attempted: 4, processed: 2, succeeded: 1, failed: 1, unverified: 2 });
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  await expect(runReplyTimer({ enabled: "on", secret: "synthetic", runner })).rejects.toThrow();
  expect(runner).toHaveBeenCalledTimes(1);
  expect(error).toHaveBeenCalledWith(JSON.stringify({
    event: "reply-timer-partial",
    planned: 4,
    attempted: 4,
    processed: 2,
    succeeded: 1,
    failed: 1,
    unverified: 2,
  }));
});
it("loads the shipped runner and walks only the finite receive plan", async () => {
  const fetch = vi.fn()
    .mockResolvedValueOnce({ status: 200, json: async () => ({ batchProtocol: 1, mailboxIds: ["synthetic-mailbox"] }) })
    .mockResolvedValueOnce({ status: 200, json: async () => ({ batchProtocol: 1, ok: true, processed: 1, succeeded: 1, failed: 0, ingested: 2, repliesLinked: 1 }) });
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  vi.stubGlobal("fetch", fetch);
  expect(await runReplyTimer({ enabled: "on", secret: "synthetic", runner: undefined })).toEqual({ ok: true, processed: 1, ingested: 2, repliesLinked: 1 });
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(JSON.parse(fetch.mock.calls[0][1].body).planOnly).toBe(true);
  expect(JSON.parse(fetch.mock.calls[1][1].body).mailboxId).toBe("synthetic-mailbox");
  expect(fetch.mock.calls.every(([url]) => url === "https://opensdoors.bidlow.co.uk/api/internal/replies/sync")).toBe(true);
  const batchLog = log.mock.calls.map(([line]) => JSON.parse(String(line))).find((entry) => entry.event === "reply-timer-batch");
  expect(batchLog).toMatchObject({ event: "reply-timer-batch", batch: 1, processed: 1, succeeded: 1, failed: 0, unverified: 0 });
  expect(batchLog.elapsedMs).toEqual(expect.any(Number));
  expect(Object.keys(batchLog).sort()).toEqual(["batch", "elapsedMs", "event", "failed", "processed", "succeeded", "unverified"]);
});
