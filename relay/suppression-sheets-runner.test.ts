import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, expect, it } from "vitest";
import { runSuppressionSheets } from "../scripts/run-suppression-sheets.mjs";
let server: Server | undefined;
const requests: { method: string; path: string; body: Record<string, unknown> }[] = [];
const inventory = { sources: 3, entries: [
  { sourceId: "one", spreadsheetLinked: true }, { sourceId: "two", spreadsheetLinked: true }, { sourceId: "unlinked", spreadsheetLinked: false },
] };
function result(sourceId: string, ok = true) { return { sources: 1, succeeded: ok ? 1 : 0, failed: ok ? 0 : 1, ok, outcomes: [{ sourceId, ok, ...(ok ? {} : { refusedShrink: true }) }] }; }
async function endpoint(handler: (body: Record<string, unknown>) => { status?: number; body: object } | null, plan: object = inventory) {
  requests.length = 0;
  server = createServer(async (req, res) => {
    let raw = ""; for await (const part of req) raw += part;
    const body = raw ? JSON.parse(raw) : {}; requests.push({ method: req.method!, path: req.url!, body });
    if (req.headers.authorization !== "Bearer synthetic") { res.writeHead(401).end(); return; }
    const response = req.method === "GET" ? { body: plan } : handler(body);
    if (!response) return;
    res.writeHead(response.status ?? 200, { "content-type": "application/json" }).end(JSON.stringify(response.body));
  });
  await new Promise<void>(resolve => server!.listen(0, "127.0.0.1", resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/internal/suppression/sync-all`;
}
afterEach(async () => { server?.closeAllConnections(); if (server) await new Promise<void>(resolve => server!.close(() => resolve())); server = undefined; });
it("reads inventory, syncs each linked sheet exactly once, and never posts an all-sheets request", async () => {
  const url = await endpoint(body => ({ body: result(String(body.sourceId)) }));
  expect(await runSuppressionSheets({ url, secret: "synthetic" })).toEqual({ ok: true, planned: 2, attempted: 2, succeeded: 2, failed: 0, unverified: 0, refusedShrink: 0 });
  expect(requests).toEqual([
    { method: "GET", path: "/api/internal/suppression/sources", body: {} },
    ...["one", "two"].map(sourceId => ({ method: "POST", path: "/api/internal/suppression/sync-all", body: { sourceId } })),
  ]);
});
it("continues after a verified shrink refusal and reports partial failure", async () => {
  const url = await endpoint(body => ({ status: body.sourceId === "one" ? 207 : 200, body: result(String(body.sourceId), body.sourceId !== "one") }));
  expect(await runSuppressionSheets({ url, secret: "synthetic" })).toMatchObject({ ok: false, succeeded: 1, failed: 1, refusedShrink: 1 });
});
it("does not retry a timed-out write and still checks the next sheet", async () => {
  const url = await endpoint(body => body.sourceId === "one" ? null : { body: result("two") });
  expect(await runSuppressionSheets({ url, secret: "synthetic", timeoutMs: 100 })).toMatchObject({ ok: false, attempted: 2, succeeded: 1, unverified: 1 });
  expect(requests.filter(req => req.body.sourceId === "one")).toHaveLength(1);
});
it.each([
  { sources: 1, entries: [{ sourceId: "", spreadsheetLinked: true }] },
  { sources: 2, entries: [{ sourceId: "one", spreadsheetLinked: true }, { sourceId: "one", spreadsheetLinked: true }] },
  { sources: 1, entries: [] },
])("rejects malformed inventories before any write", async plan => {
  const url = await endpoint(() => ({ body: {} }), plan);
  await expect(runSuppressionSheets({ url, secret: "synthetic" })).rejects.toThrow("Invalid DNC inventory");
  expect(requests).toHaveLength(1);
});
it("rejects a success for a different sheet or a dry-run result", async () => {
  const url = await endpoint(body => ({ body: body.sourceId === "one" ? result("wrong") : { ...result("two"), dryRun: true } }));
  expect(await runSuppressionSheets({ url, secret: "synthetic" })).toMatchObject({ ok: false, succeeded: 0, unverified: 2 });
});
it("marks unattempted sheets unverified when its finite budget expires", async () => {
  const url = await endpoint(() => ({ body: {} }));
  expect(await runSuppressionSheets({ url, secret: "synthetic", budgetMs: 0 })).toMatchObject({ ok: false, attempted: 0, unverified: 2 });
  expect(requests).toHaveLength(1);
});
