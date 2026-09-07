import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { closeIntegrationPool, resetIntegrationDatabase } from "@/test/integration/database";

const { valuesGet, refreshFlags } = vi.hoisted(() => ({ valuesGet: vi.fn(), refreshFlags: vi.fn() }));
vi.mock("googleapis", () => ({ google: {
  auth: { GoogleAuth: class {} },
  sheets: () => ({ spreadsheets: { values: { get: valuesGet } } }),
} }));
vi.mock("./auth", () => ({ loadServiceAccountCredentials: () => ({ client_email: "test@example.test", private_key: "synthetic" }) }));
vi.mock("./service-account-display", () => ({ getGoogleServiceAccountDisplayInfo: () => ({ configured: true, clientEmail: "test@example.test" }) }));
vi.mock("./sheets-read-limiter", () => ({ limitSheetsRead: (fn: () => unknown) => fn() }));
vi.mock("@/server/outreach/suppression-guard", () => ({ refreshContactSuppressionFlagsForClient: refreshFlags }));

import { syncSuppressionSourceFromGoogle } from "./suppression-sync";

beforeEach(async () => {
  vi.resetAllMocks();
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("External HTTP forbidden"); }));
  await resetIntegrationDatabase();
  await prisma.client.createMany({ data: ["client", "other"].map((id) => ({ id, name: id, slug: id })) });
});
afterEach(() => { expect(fetch).not.toHaveBeenCalled(); vi.unstubAllGlobals(); });
afterAll(async () => { await prisma.$disconnect(); await closeIntegrationPool(); });

describe.each(["EMAIL", "DOMAIN"] as const)("%s replacement against PostgreSQL", (kind) => {
  const value = (name: string) => kind === "EMAIL" ? `${name}@example.test` : `${name}.example.test`;
  const originals = Array.from({ length: 10 }, (_, i) => value(`old-${i}`));

  async function seed() {
    await prisma.suppressionSource.create({ data: { id: "source", clientId: "client", kind, spreadsheetId: "synthetic-sheet", sheetRange: "'Blocks'!A:A" } });
    const rows = originals.map((entry) => ({ clientId: "client", sourceId: "source", entry }));
    rows.push({ clientId: "other", sourceId: "", entry: value("other") }, { clientId: "client", sourceId: "", entry: value("manual") });
    if (kind === "EMAIL") await prisma.suppressedEmail.createMany({ data: rows.map(({ entry, sourceId, ...row }) => ({ ...row, sourceId: sourceId || null, email: entry })) });
    else await prisma.suppressedDomain.createMany({ data: rows.map(({ entry, sourceId, ...row }) => ({ ...row, sourceId: sourceId || null, domain: entry })) });
  }

  async function stored() {
    if (kind === "EMAIL") return (await prisma.suppressedEmail.findMany({ where: { sourceId: "source", clientId: "client" } })).map((row) => row.email).sort();
    return (await prisma.suppressedDomain.findMany({ where: { sourceId: "source", clientId: "client" } })).map((row) => row.domain).sort();
  }

  it.each([10, 15])("preserves all existing blocks when %i new entries conceal their removal", async (newCount) => {
    await seed();
    const additions = Array.from({ length: newCount }, (_, i) => value(`new-${i}`));
    valuesGet.mockResolvedValue({ data: { values: additions.map((entry) => [entry]) } });
    const result = await syncSuppressionSourceFromGoogle({ sourceId: "source" });
    expect(result.ok).toBe(false);
    expect(result.blockedShrink).toMatchObject({ previousCount: 10, wouldWrite: newCount, removed: 10 });
    expect(await stored()).toEqual([...originals, ...additions].sort());
    expect(result.addedWithoutRemoving).toBe(newCount);
    expect(result.error).toContain(`Added ${newCount} new blocked`);
    expect(refreshFlags).toHaveBeenCalledWith("client");

    // A scheduled retry must neither duplicate nor remove these protections.
    expect(await syncSuppressionSourceFromGoogle({ sourceId: "source" })).toMatchObject({ ok: false, addedWithoutRemoving: 0 });
    expect(await stored()).toEqual([...originals, ...additions].sort());
  });

  it("allows additions, retains manual and other-client blocks, and normalises duplicates", async () => {
    await seed();
    valuesGet.mockResolvedValue({ data: { values: [...originals, originals[0].toUpperCase(), value("added")].map((entry) => [entry]) } });
    expect(await syncSuppressionSourceFromGoogle({ sourceId: "source" })).toMatchObject({ ok: true, rowsWritten: 11 });
    expect(await stored()).toEqual([...originals, value("added")].sort());
    const manual = kind === "EMAIL" ? await prisma.suppressedEmail.findMany({ where: { sourceId: null } }) : await prisma.suppressedDomain.findMany({ where: { sourceId: null } });
    expect(manual.map((row) => row.clientId).sort()).toEqual(["client", "other"]);
  });

  it("reports actual removals in a dry run without changing the source or blocklist", async () => {
    await seed();
    const sourceBefore = await prisma.suppressionSource.findUniqueOrThrow({ where: { id: "source" } });
    valuesGet.mockResolvedValue({ data: { values: Array.from({ length: 15 }, (_, i) => [value(`new-${i}`)]) } });
    const result = await syncSuppressionSourceFromGoogle({ sourceId: "source", dryRun: true });
    expect(result).toMatchObject({ ok: false, dryRun: true, blockedShrink: { removed: 10, wouldWrite: 15 } });
    expect(result.addedWithoutRemoving).toBeUndefined();
    expect(await stored()).toEqual([...originals].sort());
    expect(await prisma.suppressionSource.findUniqueOrThrow({ where: { id: "source" } })).toEqual(sourceBefore);
    expect(refreshFlags).not.toHaveBeenCalled();
  });

  it("retains the existing small-edit allowance", async () => {
    await seed();
    valuesGet.mockResolvedValue({ data: { values: originals.slice(2).map((entry) => [entry]) } });
    expect(await syncSuppressionSourceFromGoogle({ sourceId: "source" })).toMatchObject({ ok: true, rowsWritten: 8 });
    expect(await stored()).toEqual(originals.slice(2).sort());
  });

  it("honours an explicitly confirmed replacement", async () => {
    await seed();
    valuesGet.mockResolvedValue({ data: { values: [[value("replacement")]] } });
    expect(await syncSuppressionSourceFromGoogle({ sourceId: "source", confirmShrink: true })).toMatchObject({ ok: true, rowsWritten: 1 });
    expect(await stored()).toEqual([value("replacement")]);
  });

  it("does not commit two conflicting destructive replacements based on the same old list", async () => {
    await seed();
    // Each removes five original entries (allowed). After either commits, the
    // other would remove all ten entries and must refuse those removals.
    const first = [...originals.slice(0, 5), ...Array.from({ length: 5 }, (_, i) => value(`first-${i}`))];
    const second = [...originals.slice(5), ...Array.from({ length: 5 }, (_, i) => value(`second-${i}`))];
    valuesGet.mockResolvedValueOnce({ data: { values: first.map((entry) => [entry]) } });
    valuesGet.mockResolvedValueOnce({ data: { values: second.map((entry) => [entry]) } });
    const results = await Promise.all([
      syncSuppressionSourceFromGoogle({ sourceId: "source" }),
      syncSuppressionSourceFromGoogle({ sourceId: "source" }),
    ]);
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    const refused = results.find((result) => !result.ok)!;
    if (refused.addedWithoutRemoving === 10) {
      expect(await stored()).toEqual([...first, ...second].sort());
    } else {
      // A serialization conflict rolls the second transaction back entirely.
      // DB reads can reorder which invocation reaches the synthetic sheet first.
      expect(refused.addedWithoutRemoving).toBeUndefined();
      expect([first.sort(), second.sort()]).toContainEqual(await stored());
    }
  });

  it("retries flag refresh after an additive commit without losing new or old blocks", async () => {
    await seed();
    const additions = Array.from({ length: 10 }, (_, i) => value(`new-${i}`));
    valuesGet.mockResolvedValue({ data: { values: additions.map((entry) => [entry]) } });
    refreshFlags.mockRejectedValueOnce(new Error("synthetic refresh failure"));
    expect(await syncSuppressionSourceFromGoogle({ sourceId: "source" })).toMatchObject({ ok: false });
    expect(await stored()).toEqual([...originals, ...additions].sort());
    expect(await syncSuppressionSourceFromGoogle({ sourceId: "source" })).toMatchObject({ ok: false, addedWithoutRemoving: 0 });
    expect(refreshFlags).toHaveBeenCalledTimes(2);
    expect(await stored()).toEqual([...originals, ...additions].sort());
  });
});
