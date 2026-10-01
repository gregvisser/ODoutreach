import { afterEach, beforeEach, expect, it, vi } from "vitest";

const load = vi.hoisted(() => vi.fn());
vi.mock("@/server/email/outbound/send-health", () => ({ loadOutboundSendHealth: load }));

import { GET } from "./route";

const request = (secret?: string) => new Request("https://example.test/api/internal/outbound/send-health", {
  headers: secret ? { authorization: `Bearer ${secret}` } : {},
});

beforeEach(() => {
  vi.stubEnv("PROCESS_QUEUE_SECRET", "synthetic");
  load.mockResolvedValue({ ok: true, readOnly: true, clients: [] });
});
afterEach(() => vi.unstubAllEnvs());

it("rejects a missing or wrong secret before reading", async () => {
  expect((await GET(request() as never)).status).toBe(401);
  expect((await GET(request("wrong") as never)).status).toBe(401);
  expect(load).not.toHaveBeenCalled();
});

it("returns the read-only report", async () => {
  const response = await GET(request("synthetic") as never);
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ ok: true, readOnly: true });
});

it("does not leak a database error", async () => {
  load.mockRejectedValue(new Error("connect postgres://opensdoors:super-secret@db/prod"));
  const response = await GET(request("synthetic") as never);
  expect(response.status).toBe(500);
  const body = await response.json() as { error?: string };
  expect(body.error).toBe("Send health could not be read");
  expect(JSON.stringify(body)).not.toMatch(/super-secret|postgres:\/\//);
});
