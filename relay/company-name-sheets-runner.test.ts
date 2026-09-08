import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { runCompanyNameSheets } from "../scripts/run-company-name-sheets.mjs";
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
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/internal/company-name-sheets/v1`;
}
afterEach(async () => { server?.closeAllConnections(); if (server) await new Promise<void>(resolve => server!.close(() => resolve())); server = undefined; });
const plan = { protocol: 1, ok: true, sourceIds: ["one", "two"] };
it("uses the versioned endpoint in the actual workflow and refuses older paths before HTTP", async () => {
  const workflow = readFileSync(".github/workflows/sync-company-name-sheets.yml", "utf8");
  expect(workflow).toContain("/api/internal/company-name-sheets/v1");
  expect(workflow).toContain("node scripts/run-company-name-sheets.mjs");
  const url = await endpoint(() => ({ body: plan }));
  await expect(runCompanyNameSheets({ url: url.replace("/company-name-sheets/v1", "/suppression/sync-all"), secret: "synthetic" })).rejects.toThrow("versioned");
  expect(requests).toHaveLength(0);
});
it("stops before mutations on old deployment or invalid protocol", async () => {
  const url = await endpoint(() => ({ status: 404, body: {} }));
  await expect(runCompanyNameSheets({ url, secret: "synthetic" })).rejects.toThrow("404");
  expect(requests).toEqual([{ protocol: 1, planOnly: true }]);
});
it("walks all sources and records partial failure", async () => {
  const url = await endpoint(body => ({ status: body.sourceId === "one" ? 207 : 200, body: body.planOnly ? plan : { protocol: 1, ok: body.sourceId !== "one" } }));
  expect(await runCompanyNameSheets({ url, secret: "synthetic" })).toEqual({ ok: false, planned: 2, succeeded: 1, failed: 1, unverified: 0 });
  expect(requests.map(body => body.sourceId).filter(Boolean)).toEqual(["one", "two"]);
});
it("does not retry an uncertain sync and continues with other sources", async () => {
  const url = await endpoint(body => body.sourceId === "one" ? null : { body: body.planOnly ? plan : { protocol: 1, ok: true } });
  expect(await runCompanyNameSheets({ url, secret: "synthetic", timeoutMs: 100 })).toMatchObject({ ok: false, succeeded: 1, unverified: 1 });
  expect(requests.filter(body => body.sourceId === "one")).toHaveLength(1);
});
it("reports unattempted sources as unverified when the run budget ends", async () => {
  const url = await endpoint(() => ({ body: plan }));
  expect(await runCompanyNameSheets({ url, secret: "synthetic", budgetMs: 0 })).toMatchObject({ ok: false, planned: 2, unverified: 2 });
  expect(requests).toHaveLength(1);
});
