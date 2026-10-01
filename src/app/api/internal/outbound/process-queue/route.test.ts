import { afterEach, beforeEach, expect, it, vi } from "vitest";

const targets = vi.hoisted(() => vi.fn());
const queue = vi.hoisted(() => vi.fn());
vi.mock("@/server/tenant/organisation-jobs", () => ({ listOrganisationJobTargets: targets }));
vi.mock("@/server/email/outbound/queue-processor", () => ({ processOutboundSendQueue: queue }));

import { POST } from "./route";

const request = (secret = "synthetic") =>
  new Request("https://example.test/api/internal/outbound/process-queue", {
    method: "POST",
    headers: { authorization: `Bearer ${secret}`, "content-type": "application/json" },
    body: JSON.stringify({ limit: 10 }),
  });

beforeEach(() => {
  vi.stubEnv("PROCESS_QUEUE_SECRET", "synthetic");
  targets.mockReset();
  queue.mockReset();
});
afterEach(() => vi.unstubAllEnvs());

it("drains OpensDoors on its own client ids", async () => {
  targets.mockResolvedValue([
    { organisationId: "org_opensdoors", slug: "opensdoors", status: "ACTIVE", clientIds: ["morson"] },
  ]);
  queue.mockResolvedValue({ claimed: 1, completed: 1, errors: [] });
  const response = await POST(request() as never);
  expect(response.status).toBe(200);
  expect(queue).toHaveBeenCalledWith({ limit: 10, clientIds: ["morson"] });
  expect(await response.json()).toMatchObject({ ok: true, claimed: 1, completed: 1 });
});

it("drains the next organisation when the first one throws", async () => {
  targets.mockResolvedValue([
    { organisationId: "org_northwind", slug: "northwind", status: "ACTIVE", clientIds: ["contoso"] },
    { organisationId: "org_opensdoors", slug: "opensdoors", status: "ACTIVE", clientIds: ["morson"] },
  ]);
  queue
    .mockRejectedValueOnce(new Error("northwind mailbox dead"))
    .mockResolvedValueOnce({ claimed: 2, completed: 2, errors: [] });
  const response = await POST(request() as never);
  expect(queue).toHaveBeenNthCalledWith(2, { limit: 10, clientIds: ["morson"] });
  expect(response.status).toBe(207);
  const body = await response.json() as { ok: boolean; claimed: number; organisations: { slug: string }[] };
  expect(body.ok).toBe(false);
  expect(body.claimed).toBe(2);
  expect(body.organisations.map((item) => item.slug)).toEqual(["northwind", "opensdoors"]);
});

it("answers 500 when the only organisation throws", async () => {
  targets.mockResolvedValue([
    { organisationId: "org_opensdoors", slug: "opensdoors", status: "ACTIVE", clientIds: ["morson"] },
  ]);
  queue.mockRejectedValue(new Error("queue claim failed"));
  const response = await POST(request() as never);
  expect(response.status).toBe(500);
  expect(await response.json()).toMatchObject({ ok: false });
});
