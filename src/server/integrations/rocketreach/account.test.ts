import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ROCKETREACH_API_V2_ACCOUNT,
  clearRocketReachAccountCache,
  loadRocketReachCreditSnapshot,
} from "./account";

afterEach(() => {
  clearRocketReachAccountCache();
  vi.unstubAllEnvs();
});

describe("loadRocketReachCreditSnapshot", () => {
  it("shows the free account balance and reuses it for a few minutes", async () => {
    vi.stubEnv("ROCKETREACH_API_KEY", "synthetic-not-sent");
    const transport = vi.fn(async (url: string) => {
      void url;
      return Response.json({
        credit_usage: [{ credit_type: "person_lookup", allocated: 20, remaining: 12 }],
      });
    });
    const first = await loadRocketReachCreditSnapshot({ now: 1_000, fetchImpl: transport as typeof fetch });
    const second = await loadRocketReachCreditSnapshot({ now: 1_000 + 60_000, fetchImpl: transport as typeof fetch });
    expect(first).toMatchObject({ state: "ready", remaining: 12 });
    expect(second).toMatchObject({ state: "ready", remaining: 12 });
    expect(transport).toHaveBeenCalledTimes(1);
    expect(transport.mock.calls[0]?.[0]).toBe(ROCKETREACH_API_V2_ACCOUNT);
  });

  it("degrades when the account endpoint fails and does not throw", async () => {
    vi.stubEnv("ROCKETREACH_API_KEY", "synthetic-not-sent");
    const transport = vi.fn(async () => {
      throw new Error("network down");
    });
    await expect(loadRocketReachCreditSnapshot({ force: true, fetchImpl: transport as typeof fetch })).resolves.toMatchObject({
      state: "unavailable",
    });
  });

  it("reports unconfigured when the API key is missing", async () => {
    vi.stubEnv("ROCKETREACH_API_KEY", "");
    await expect(loadRocketReachCreditSnapshot()).resolves.toEqual({ state: "unconfigured" });
  });
});
