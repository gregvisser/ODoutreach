import { afterEach, expect, it, vi } from "vitest";
import { runCampaignTimer } from "../App_Data/jobs/triggered/odoutreach-campaign-scheduler/run.js";
afterEach(() => vi.unstubAllGlobals());
it("does not contact the service unless explicitly enabled", async () => {
  const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
  expect(await runCampaignTimer({ enabled: undefined, secret: "test" })).toMatchObject({ skipped: true });
  expect(fetch).not.toHaveBeenCalled();
});
it("sends only the protocol and strips customer detail from output", async () => {
  const fetch = vi.fn().mockResolvedValue({ status: 200, json: async () => ({ campaignSchedulerProtocol: 1, ok: true, followUpsQueued: 2, errors: ["private"] }) });
  vi.stubGlobal("fetch", fetch);
  expect(await runCampaignTimer({ enabled: "on", secret: "test" })).toEqual({ ok: true, skipped: false, queued: 2 });
  expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ campaignSchedulerProtocol: 1 });
  expect(fetch.mock.calls[0][1].redirect).toBe("error");
});
it.each([207, 401, 500])("does not retry uncertain or failed HTTP %s", async status => {
  const fetch = vi.fn().mockResolvedValue({ status }); vi.stubGlobal("fetch", fetch);
  await expect(runCampaignTimer({ enabled: "on", secret: "test" })).rejects.toThrow();
  expect(fetch).toHaveBeenCalledTimes(1);
});

it("refuses missing credentials before HTTP", async () => {
  const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
  await expect(runCampaignTimer({ enabled: "on", secret: "" })).rejects.toThrow("not configured");
  expect(fetch).not.toHaveBeenCalled();
});
it("rejects a response from a different protocol", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ status: 200, json: async () => ({ ok: true, campaignSchedulerProtocol: 0 }) }));
  await expect(runCampaignTimer({ enabled: "on", secret: "test" })).rejects.toThrow("Invalid campaign timer response");
});
it("uses real HTTP against a loopback service without exposing selection", async () => {
  const { createServer } = await import("node:http");
  let captured = "";
  const server = createServer(async (req, res) => {
    for await (const chunk of req) captured += chunk;
    if (req.headers.authorization !== "Bearer synthetic") { res.writeHead(401).end(); return; }
    res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ campaignSchedulerProtocol: 1, ok: true, skipped: true }));
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address() as import("node:net").AddressInfo;
    expect(await runCampaignTimer({ enabled: "on", secret: "synthetic", url: `http://127.0.0.1:${address.port}/api/internal/campaign-scheduler/v1` })).toMatchObject({ ok: true, skipped: true });
    expect(JSON.parse(captured)).toEqual({ campaignSchedulerProtocol: 1 });
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
});
