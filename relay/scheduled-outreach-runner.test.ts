import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, expect, it } from "vitest";
import { runScheduledOutreach } from "../scripts/run-scheduled-outreach.mjs";
let server: Server | undefined;
const requests: Record<string, unknown>[] = [];
async function endpoint(handler: (body: Record<string, unknown>) => { status?: number; body: object } | null) {
  requests.length = 0;
  server = createServer(async (req, res) => {
    let raw = ""; for await (const part of req) raw += part;
    const body = JSON.parse(raw); requests.push(body);
    if (req.headers.authorization !== "Bearer synthetic") { res.writeHead(401).end(); return; }
    const result = handler(body); if (!result) return;
    res.writeHead(result.status ?? 200, { "content-type": "application/json" }); res.end(JSON.stringify(result.body));
  });
  await new Promise<void>(resolve => server!.listen(0, "127.0.0.1", resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/internal/scheduled-outreach/v1`;
}
afterEach(async () => { server?.closeAllConnections(); if (server) await new Promise<void>(resolve => server!.close(() => resolve())); server = undefined; });
const plan = { schedulerProtocol: 1, ok: true, clientIds: ["client"], mailboxIds: ["one", "two"] };
it("refuses an older queue URL before making any HTTP request", async () => {
  const url = await endpoint(() => ({ body: { ok: true } }));
  await expect(runScheduledOutreach({ url: url.replace('/scheduled-outreach/v1', '/outbound/process-queue'), secret: "synthetic" })).rejects.toThrow(/versioned/);
  expect(requests).toHaveLength(0);
});
it.each([404, 503])("an unavailable versioned endpoint (%s) never triggers legacy sends", async status => {
  const url = await endpoint(() => ({ status, body: {} }));
  await expect(runScheduledOutreach({ url, secret: "synthetic" })).rejects.toThrow(`HTTP ${status}`);
  expect(requests).toEqual([{ schedulerProtocol: 1, phase: "plan" }]);
});
it("rejects a success-shaped response without protocol acknowledgement", async () => {
  const url = await endpoint(() => ({ body: { ok: true, clientIds: ["client"], mailboxIds: [] } }));
  await expect(runScheduledOutreach({ url, secret: "synthetic" })).rejects.toThrow(/Unsupported/);
  expect(requests).toHaveLength(1);
});
it("syncs the finite snapshot first and reports a partial sync after continuing", async () => {
  const url = await endpoint(body => ({ status: body.mailboxId === "one" ? 207 : 200, body: body.phase === "plan" ? plan : { schedulerProtocol: 1, ok: body.mailboxId !== "one" } }));
  expect(await runScheduledOutreach({ url, secret: "synthetic" })).toMatchObject({ ok: false, attempted: 4, failed: 1, unverified: 0 });
  expect(requests.map(body => body.phase)).toEqual(["plan", "sync", "sync", "advance", "queue"]);
});
it("does no mutation for an empty plan", async () => {
  const url = await endpoint(() => ({ body: { ...plan, clientIds: [], mailboxIds: [] } }));
  expect(await runScheduledOutreach({ url, secret: "synthetic" })).toMatchObject({ ok: true, attempted: 0 });
  expect(requests).toHaveLength(1);
});
it("does not retry an unconfirmed queue request", async () => {
  const url = await endpoint(body => body.phase === "queue" ? null : { body: body.phase === "plan" ? { ...plan, mailboxIds: [] } : { schedulerProtocol: 1, ok: true } });
  expect(await runScheduledOutreach({ url, secret: "synthetic", timeoutMs: 100 })).toMatchObject({ ok: false, unverified: 1, attempted: 2 });
  expect(requests.filter(body => body.phase === "queue")).toHaveLength(1);
});
