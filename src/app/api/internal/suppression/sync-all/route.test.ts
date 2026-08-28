import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * The dry run must be something you ASK for, never something you get.
 *
 * This route is what the replies cron calls every fifteen minutes to keep
 * every do-not-contact list current. If a dry run could be reached by
 * accident — an empty body, a malformed one, a truthy-but-not-true value —
 * every blocklist would quietly stop updating while the run still reported
 * success. That is the same failure as the outage this route exists to fix,
 * only quieter: the 2026-08-28 run answered 207 with two dead sheets inside a
 * healthy-looking total for weeks before anyone noticed.
 *
 * So: `=== true` and nothing else.
 */
const { syncAllConfiguredSuppressionSources } = vi.hoisted(() => ({
  syncAllConfiguredSuppressionSources: vi.fn(),
}));

vi.mock("@/server/integrations/google-sheets/suppression-sync-all", () => ({
  syncAllConfiguredSuppressionSources,
}));

import { POST } from "./route";

function req(secret: string | null, body?: unknown, raw?: string) {
  return new Request("https://example.test/api/internal/suppression/sync-all", {
    method: "POST",
    headers: secret ? { authorization: `Bearer ${secret}` } : {},
    body: raw ?? JSON.stringify(body ?? {}),
  });
}

function dryRunUsed(): boolean {
  const call = syncAllConfiguredSuppressionSources.mock.calls.at(-1) as
    | [{ dryRun: boolean }]
    | undefined;
  if (!call) throw new Error("the sync was never called");
  return call[0].dryRun;
}

describe("POST /api/internal/suppression/sync-all", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    syncAllConfiguredSuppressionSources.mockReset();
  });

  function cleanRun() {
    syncAllConfiguredSuppressionSources.mockResolvedValue({
      sources: 1,
      succeeded: 1,
      failed: 0,
      rowsWritten: 42,
      errors: [],
      outcomes: [{ client: "Pareto FM", kind: "Whole domains", ok: true }],
    });
  }

  it("rejects an unauthorised caller before touching any sheet", async () => {
    vi.stubEnv("PROCESS_QUEUE_SECRET", "correct");

    const res = await POST(req("wrong") as never);

    expect(res.status).toBe(401);
    expect(syncAllConfiguredSuppressionSources).not.toHaveBeenCalled();
  });

  // The cron's exact body.
  it("treats the cron's empty body as a REAL sync", async () => {
    vi.stubEnv("PROCESS_QUEUE_SECRET", "correct");
    cleanRun();

    await POST(req("correct", {}) as never);

    expect(dryRunUsed()).toBe(false);
  });

  it("treats an unreadable body as a REAL sync, never a dry one", async () => {
    vi.stubEnv("PROCESS_QUEUE_SECRET", "correct");
    cleanRun();

    await POST(req("correct", undefined, "not json at all") as never);

    expect(dryRunUsed()).toBe(false);
  });

  it("does not accept a merely-truthy dryRun", async () => {
    vi.stubEnv("PROCESS_QUEUE_SECRET", "correct");
    cleanRun();

    await POST(req("correct", { dryRun: "yes" }) as never);

    expect(dryRunUsed()).toBe(false);
  });

  it("runs a dry run when one is explicitly asked for", async () => {
    vi.stubEnv("PROCESS_QUEUE_SECRET", "correct");
    syncAllConfiguredSuppressionSources.mockResolvedValue({
      sources: 1,
      succeeded: 1,
      failed: 0,
      rowsWritten: 0,
      errors: [],
      dryRun: true,
      outcomes: [
        {
          client: "Pareto FM",
          kind: "Whole domains",
          ok: true,
          wouldWrite: 42,
          previousCount: 0,
          resolvedRange: "'Domains'!A1:Z50000",
        },
      ],
    });

    const res = await POST(req("correct", { dryRun: true }) as never);
    const json = (await res.json()) as {
      dryRun: boolean;
      outcomes: { client: string; wouldWrite: number }[];
    };

    expect(dryRunUsed()).toBe(true);
    expect(json.dryRun).toBe(true);
    expect(json.outcomes[0]).toMatchObject({
      client: "Pareto FM",
      wouldWrite: 42,
    });
  });

  it("returns the per-sheet outcomes so a count can be read per client", async () => {
    vi.stubEnv("PROCESS_QUEUE_SECRET", "correct");
    cleanRun();

    const res = await POST(req("correct", {}) as never);
    const json = (await res.json()) as {
      ok: boolean;
      outcomes: { client: string }[];
    };

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.outcomes).toHaveLength(1);
    expect(json.outcomes[0].client).toBe("Pareto FM");
  });
});
