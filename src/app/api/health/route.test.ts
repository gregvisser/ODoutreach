import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { queryRaw } = vi.hoisted(() => ({ queryRaw: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { $queryRaw: queryRaw } }));

import { GET } from "./route";

/**
 * `relay-watch.ps1` asks this endpoint whether the safety gate is live and
 * REFUSES to run an autonomous cycle unless it says yes. That makes the shape
 * of this response a safety contract, not a convenience — if the field
 * disappears, the relay stops running, which is the safe direction but a silent
 * and confusing one.
 *
 * The second property is a privacy one. This endpoint has no auth. It may say
 * HOW MANY clients an agent is allowed to send for; it must never say WHICH.
 */

const ENV = ["AUTONOMOUS_RELAY_ACTIVE", "AUTONOMOUS_SEND_ALLOWLIST"] as const;
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  vi.clearAllMocks();
  for (const k of ENV) saved[k] = process.env[k];
  queryRaw.mockResolvedValue([{ "?column?": 1 }]);
});

afterEach(() => {
  for (const k of ENV) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("the health endpoint reports the safety gate", () => {
  it("says the gate is off when no relay is running", async () => {
    delete process.env.AUTONOMOUS_RELAY_ACTIVE;

    const body = await (await GET()).json();

    expect(body.ok).toBe(true);
    expect(body.autonomousRelay).toEqual({ active: false, allowlistedClients: 0 });
  });

  it("says the gate is on, and how many clients it covers", async () => {
    process.env.AUTONOMOUS_RELAY_ACTIVE = "1";
    process.env.AUTONOMOUS_SEND_ALLOWLIST = "bidlowai";

    const body = await (await GET()).json();

    expect(body.autonomousRelay).toEqual({ active: true, allowlistedClients: 1 });
  });

  it("reports zero allowlisted clients when the gate is on but misconfigured", async () => {
    // The watcher treats this as "everything would be refused" and stops,
    // rather than starting work that could not have sent anything anyway.
    process.env.AUTONOMOUS_RELAY_ACTIVE = "1";
    process.env.AUTONOMOUS_SEND_ALLOWLIST = "";

    const body = await (await GET()).json();

    expect(body.autonomousRelay).toEqual({ active: true, allowlistedClients: 0 });
  });
});

describe("it never says WHICH client", () => {
  it("leaks no slug anywhere in the response", async () => {
    process.env.AUTONOMOUS_RELAY_ACTIVE = "1";
    process.env.AUTONOMOUS_SEND_ALLOWLIST = "bidlowai,train-hugger";

    const raw = JSON.stringify(await (await GET()).json());

    expect(raw).not.toMatch(/bidlowai/i);
    expect(raw).not.toMatch(/train-hugger/i);
  });
});

describe("a database failure still answers 503", () => {
  it("does not start reporting a gate it cannot vouch for", async () => {
    queryRaw.mockRejectedValue(new Error("down"));

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(body.ok).toBe(false);
    // No gate claim at all — the watcher's `-not $r.autonomousRelay` check then
    // refuses, which is right: an app that cannot reach its database should not
    // be having an agent run against it.
    expect(body.autonomousRelay).toBeUndefined();
  });
});
