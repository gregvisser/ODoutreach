import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, expect, it } from "vitest";
import { probeSchedule } from "../App_Data/jobs/triggered/odoutreach-scheduler-probe/run.js";

let server: Server | undefined;
const requests: { method: string; body: unknown }[] = [];
async function endpoint(body: unknown, status = 200) {
  requests.length = 0;
  server = createServer(async (req, res) => {
    let raw = "";
    for await (const chunk of req) raw += chunk;
    requests.push({ method: req.method!, body: JSON.parse(raw) });
    if (req.headers.authorization !== "Bearer synthetic") { res.writeHead(401).end(); return; }
    res.writeHead(status, { "content-type": "application/json" }).end(JSON.stringify(body));
  });
  await new Promise<void>(resolve => server!.listen(0, "127.0.0.1", resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/internal/scheduled-outreach/v1`;
}
afterEach(async () => {
  server?.closeAllConnections();
  if (server) await new Promise<void>(resolve => server!.close(() => resolve()));
  server = undefined;
});
it("requests only the read-only plan and exposes counts, never identifiers", async () => {
  const url = await endpoint({ schedulerProtocol: 1, ok: true, clientIds: ["private-client"], mailboxIds: ["private-mailbox"] });
  expect(await probeSchedule({ url, secret: "synthetic" })).toEqual({ ok: true, mode: "plan-only", clients: 1, mailboxes: 1 });
  expect(requests).toEqual([{ method: "POST", body: { schedulerProtocol: 1, phase: "plan" } }]);
});
it.each([
  { schedulerProtocol: 0, ok: true, clientIds: [], mailboxIds: [] },
  { schedulerProtocol: 1, ok: false, clientIds: [], mailboxIds: [] },
  { schedulerProtocol: 1, ok: true, clientIds: ["duplicate", "duplicate"], mailboxIds: [] },
  { schedulerProtocol: 1, ok: true, clientIds: [], mailboxIds: [""] },
])("rejects invalid evidence without trying a different phase", async body => {
  const url = await endpoint(body);
  await expect(probeSchedule({ url, secret: "synthetic" })).rejects.toThrow("Invalid scheduler probe response");
  expect(requests).toHaveLength(1);
});
it("rejects missing authentication before contacting the endpoint", async () => {
  const url = await endpoint({});
  await expect(probeSchedule({ url, secret: "" })).rejects.toThrow("not configured");
  expect(requests).toHaveLength(0);
});
it("does not retry an HTTP failure", async () => {
  const url = await endpoint({}, 503);
  await expect(probeSchedule({ url, secret: "synthetic" })).rejects.toThrow("HTTP 503");
  expect(requests).toHaveLength(1);
});
