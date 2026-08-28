import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * What the scheduled run says about EACH sheet.
 *
 * The brief for row 48 asks for "the true row counts" of two named clients'
 * lists. That could not be answered. `SuppressionSyncAllResult` carried
 * `succeeded`, `failed` and one summed `rowsWritten` across all 34 sources, so
 * a sheet that worked vanished into a total and a sheet that broke appeared
 * only as a sentence in `errors`. There was no number per client anywhere —
 * the 2026-08-28 production run reported `rowsWritten: 50692` and not one row
 * of that total could be attributed to a client.
 *
 * A blocklist is per-client by definition. Reporting it only in aggregate is
 * how "Pareto FM has no protection" sat inside a healthy-looking total.
 */
const { findMany, syncSuppressionSourceFromGoogle } = vi.hoisted(() => ({
  findMany: vi.fn(),
  syncSuppressionSourceFromGoogle: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: { suppressionSource: { findMany } },
}));
vi.mock("./suppression-sync", () => ({ syncSuppressionSourceFromGoogle }));

import { syncAllConfiguredSuppressionSources } from "./suppression-sync-all";

function source(id: string, name: string, kind: "DOMAIN" | "EMAIL") {
  return { id, kind, client: { name } };
}

describe("sync-all reports every sheet by name", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findMany.mockResolvedValue([
      source("s1", "Pareto FM", "DOMAIN"),
      source("s2", "Train Hugger", "DOMAIN"),
    ]);
  });

  it("attributes a row count to the client it belongs to", async () => {
    syncSuppressionSourceFromGoogle
      .mockResolvedValueOnce({
        ok: true,
        rowsWritten: 42,
        previousCount: 0,
        resolvedRange: "'Domains'!A1:Z50000",
      })
      .mockResolvedValueOnce({
        ok: true,
        rowsWritten: 400,
        previousCount: 373,
        resolvedRange: "'Domains'!A1:Z50000",
      });

    const r = await syncAllConfiguredSuppressionSources();

    expect(r.outcomes).toEqual([
      expect.objectContaining({
        client: "Pareto FM",
        kind: "Whole domains",
        ok: true,
        rowsWritten: 42,
        previousCount: 0,
        resolvedRange: "'Domains'!A1:Z50000",
      }),
      expect.objectContaining({
        client: "Train Hugger",
        ok: true,
        rowsWritten: 400,
        previousCount: 373,
      }),
    ]);
  });

  it("still reports the totals the cron reads", async () => {
    syncSuppressionSourceFromGoogle
      .mockResolvedValueOnce({ ok: true, rowsWritten: 42 })
      .mockResolvedValueOnce({ ok: false, error: "Check the Sheet tab name" });

    const r = await syncAllConfiguredSuppressionSources();

    expect(r).toMatchObject({
      sources: 2,
      succeeded: 1,
      failed: 1,
      rowsWritten: 42,
    });
    expect(r.errors[0]).toContain("Train Hugger");
  });

  it("carries a failing sheet's reason on its own outcome, not just in errors", async () => {
    syncSuppressionSourceFromGoogle
      .mockResolvedValueOnce({ ok: true, rowsWritten: 42 })
      .mockResolvedValueOnce({ ok: false, error: "Check the Sheet tab name" });

    const r = await syncAllConfiguredSuppressionSources();

    expect(r.outcomes[1]).toMatchObject({
      client: "Train Hugger",
      ok: false,
      error: "Check the Sheet tab name",
    });
  });

  it("marks a refused shrink as refused, so it reads differently from a broken sheet", async () => {
    syncSuppressionSourceFromGoogle
      .mockResolvedValueOnce({ ok: true, rowsWritten: 42 })
      .mockResolvedValueOnce({
        ok: false,
        error: "would remove 373",
        blockedShrink: { previousCount: 373, wouldWrite: 0, removed: 373 },
      });

    const r = await syncAllConfiguredSuppressionSources();

    // A sheet the guard PROTECTED and a sheet that could not be read are
    // different events with different actions, and both currently answer
    // `ok: false`. Only one of them means someone must open the Sheet.
    expect(r.outcomes[1]).toMatchObject({ refusedShrink: true });
  });

  it("gives a thrown source an outcome too, so no sheet is missing from the report", async () => {
    syncSuppressionSourceFromGoogle
      .mockResolvedValueOnce({ ok: true, rowsWritten: 42 })
      .mockRejectedValueOnce(new Error("boom"));

    const r = await syncAllConfiguredSuppressionSources();

    expect(r.outcomes).toHaveLength(2);
    expect(r.outcomes[1]).toMatchObject({ client: "Train Hugger", ok: false });
  });
});

describe("sync-all can be asked without writing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findMany.mockResolvedValue([source("s1", "Pareto FM", "DOMAIN")]);
    syncSuppressionSourceFromGoogle.mockResolvedValue({
      ok: true,
      dryRun: true,
      wouldWrite: 42,
      previousCount: 0,
      resolvedRange: "'Domains'!A1:Z50000",
    });
  });

  it("passes the dry run down to every source", async () => {
    await syncAllConfiguredSuppressionSources({ dryRun: true });

    expect(syncSuppressionSourceFromGoogle).toHaveBeenCalledWith({
      sourceId: "s1",
      dryRun: true,
    });
  });

  it("reports wouldWrite per client and sums nothing into rowsWritten", async () => {
    const r = await syncAllConfiguredSuppressionSources({ dryRun: true });

    expect(r.dryRun).toBe(true);
    expect(r.rowsWritten).toBe(0);
    expect(r.outcomes[0]).toMatchObject({
      client: "Pareto FM",
      wouldWrite: 42,
      previousCount: 0,
    });
  });

  it("defaults to a real sync when nothing is asked for", async () => {
    syncSuppressionSourceFromGoogle.mockResolvedValue({
      ok: true,
      rowsWritten: 42,
    });

    await syncAllConfiguredSuppressionSources();

    // The cron calls this with no argument and MUST still write. A dry run
    // that became the default would silently stop every blocklist updating.
    expect(syncSuppressionSourceFromGoogle).toHaveBeenCalledWith({
      sourceId: "s1",
      dryRun: false,
    });
  });
});
