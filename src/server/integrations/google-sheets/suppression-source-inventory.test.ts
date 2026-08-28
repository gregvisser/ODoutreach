import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Counting what a blocklist actually holds, without asking Google.
 *
 * The number under test is `storedRows`. Every other reading of "is this client
 * protected?" available on 2026-08-28 was indirect — a sync's success stamp, a
 * summed total across 34 sources, an error string from weeks ago — and all of
 * them said things were fine while Pareto FM's domain list held nothing.
 */
const { findMany } = vi.hoisted(() => ({ findMany: vi.fn() }));

vi.mock("@/lib/db", () => ({
  prisma: { suppressionSource: { findMany } },
}));

import { listSuppressionSourceInventory } from "./suppression-source-inventory";

function source(over: Record<string, unknown> = {}) {
  return {
    id: "s1",
    kind: "DOMAIN",
    spreadsheetId: "sheet-1",
    sheetRange: null,
    syncStatus: "SUCCESS",
    lastSyncedAt: new Date("2026-08-28T11:00:00.000Z"),
    lastError: null,
    client: { name: "Pareto FM" },
    _count: { suppressedEmails: 7, suppressedDomains: 0 },
    ...over,
  };
}

describe("do-not-contact source inventory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /**
   * The bug this test exists for.
   *
   * Pareto FM has 7 suppressed EMAILS and 0 suppressed DOMAINS. Summing the two
   * counts would report their domain list as holding 7 rows — "protected" —
   * when it holds none and every domain in their sheet is sendable. A source
   * counts only the table matching its own kind.
   */
  it("counts only the table matching the source's own kind", async () => {
    findMany.mockResolvedValue([
      source({ kind: "DOMAIN" }),
      source({ id: "s2", kind: "EMAIL" }),
    ]);

    const r = await listSuppressionSourceInventory();

    expect(r.entries[0]).toMatchObject({
      sourceId: "s1",
      kind: "Whole domains",
      storedRows: 0,
    });
    expect(r.entries[1]).toMatchObject({
      sourceId: "s2",
      kind: "Email addresses",
      storedRows: 7,
    });
  });

  it("counts the lists holding nothing, because that is the number to react to", async () => {
    findMany.mockResolvedValue([
      source({ kind: "DOMAIN" }), // 0 domains — no protection
      source({ id: "s2", kind: "EMAIL" }), // 7 emails
      source({
        id: "s3",
        kind: "DOMAIN",
        client: { name: "Train Hugger" },
        _count: { suppressedEmails: 124, suppressedDomains: 373 },
      }),
    ]);

    const r = await listSuppressionSourceInventory();

    expect(r.sources).toBe(3);
    expect(r.empty).toBe(1);
  });

  it("reports the handle needed to sync that one sheet", async () => {
    findMany.mockResolvedValue([source({ id: "cmpnsa18a00m0gapb5fh8nox6" })]);

    const r = await listSuppressionSourceInventory();

    expect(r.entries[0].sourceId).toBe("cmpnsa18a00m0gapb5fh8nox6");
  });

  it("says whether a range is SAVED, since a saved one overrides tab resolution", async () => {
    findMany.mockResolvedValue([
      source({ sheetRange: null }),
      source({ id: "s2", sheetRange: "   " }),
      source({ id: "s3", sheetRange: "'Domains'!A1:Z50000" }),
    ]);

    const r = await listSuppressionSourceInventory();

    expect(r.entries.map((e) => e.rangeSaved)).toEqual([false, false, true]);
  });

  it("flags a source with no spreadsheet linked — the sync never picks it up", async () => {
    findMany.mockResolvedValue([source({ spreadsheetId: null })]);

    const r = await listSuppressionSourceInventory();

    expect(r.entries[0].spreadsheetLinked).toBe(false);
  });

  /**
   * The whole point of this module is that it is cheap and cannot fail the way
   * the dry run fails. A Google client appearing in this path would reintroduce
   * the quota ceiling and the timeout to the one call that has to work when
   * everything else is timing out.
   */
  it("asks the database and nothing else — no Google client, no write", async () => {
    findMany.mockResolvedValue([source()]);

    await listSuppressionSourceInventory();

    expect(findMany).toHaveBeenCalledTimes(1);
    const call = findMany.mock.calls[0] as [Record<string, unknown>];
    expect(call[0]).not.toHaveProperty("where.spreadsheetId");
  });
});

describe("the inventory route and its workflow", () => {
  it("is bearer-gated and read-only", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const route = readFileSync(
      join(process.cwd(), "src/app/api/internal/suppression/sources/route.ts"),
      "utf8",
    );

    expect(route).toContain("PROCESS_QUEUE_SECRET");
    expect(route).toContain("Bearer ${secret}");
    expect(route).toContain("status: 401");
    // A POST here would be a second, unguarded way to write a blocklist.
    expect(route).not.toMatch(/export async function POST/);
  });

  it("the workflow reads the running build directly, not through the CDN", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const workflow = readFileSync(
      join(process.cwd(), ".github/workflows/dnc-sheet-inventory.yml"),
      "utf8",
    );

    expect(workflow).toContain("app-opensdoors-outreach-prod.azurewebsites.net");
    expect(workflow).not.toContain("opensdoors.bidlow.co.uk");
  });
});
