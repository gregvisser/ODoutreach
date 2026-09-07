import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, expect, it } from "vitest";
import { runReplySync } from "../scripts/run-reply-sync.mjs";

let server: Server | undefined;
const requests: Record<string, unknown>[] = [];
async function endpoint(handler: (body: Record<string, unknown>) => { status?: number; body: object } | null) {
  requests.length = 0;
  server = createServer(async (req, res) => {
    let raw = "";
    for await (const part of req) raw += part;
    const body = JSON.parse(raw);
    requests.push(body);
    if (req.method !== "POST" || req.headers.authorization !== "Bearer local-test-secret") {
      res.writeHead(401).end(); return;
    }
    const result = handler(body);
    if (!result) return; // A hung local response exercises the real fetch timeout.
    res.writeHead(result.status ?? 200, { "content-type": "application/json" });
    res.end(JSON.stringify(result.body));
  });
  await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/internal/replies/sync`;
}
afterEach(async () => {
  server?.closeAllConnections();
  if (server) await new Promise<void>((resolve) => server!.close(() => resolve()));
  server = undefined;
});
const ok = { batchProtocol: 1, ok: true, processed: 1, succeeded: 1, failed: 0, ingested: 4, repliesLinked: 1 };

it("walks every planned mailbox once and reports partial failures without hiding later successes", async () => {
  const url = await endpoint((body) => body.planOnly
    ? { body: { batchProtocol: 1, mailboxIds: ["a", "b", "c"] } }
    : body.mailboxId === "b" ? { status: 207, body: { ...ok, ok: false, succeeded: 0, failed: 1, ingested: 0, repliesLinked: 0 } }
      : { body: ok });
  expect(await runReplySync({ url, secret: "local-test-secret" })).toMatchObject({ ok: false, planned: 3, attempted: 3, processed: 3, succeeded: 2, failed: 1, unverified: 0 });
  expect(requests.slice(1).map((body) => body.mailboxId)).toEqual(["a", "b", "c"]);
  expect(requests.every((body) => body.maxMailboxes === 1 && body.perMailboxTop === 10)).toBe(true);
});

it("continues after a real HTTP timeout without retrying or claiming the uncertain mailbox succeeded", async () => {
  const url = await endpoint((body) => body.planOnly ? { body: { batchProtocol: 1, mailboxIds: ["a", "b", "c"] } }
    : body.mailboxId === "b" ? null : { body: ok });
  expect(await runReplySync({ url, secret: "local-test-secret", timeoutMs: 250 })).toMatchObject({ ok: false, attempted: 3, processed: 2, succeeded: 2, failed: 0, unverified: 1 });
  expect(requests.slice(1).map((body) => body.mailboxId)).toEqual(["a", "b", "c"]);
});

it("rejects duplicate plan entries before processing any mailbox", async () => {
  const url = await endpoint(() => ({ body: { batchProtocol: 1, mailboxIds: ["a", "a"] } }));
  await expect(runReplySync({ url, secret: "local-test-secret" })).rejects.toThrow("invalid mailbox plan");
  expect(requests).toHaveLength(1);
});

it("refuses an older server response instead of treating one batch as a completed sweep", async () => {
  const url = await endpoint(() => ({ body: { ok: true, processed: 1 } }));
  await expect(runReplySync({ url, secret: "local-test-secret" })).rejects.toThrow("batch protocol");
  expect(requests).toHaveLength(1);
});
