import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Two live client blocklists were broken by the same line: when no range is
 * saved the sync asks Google for `Sheet1!A1:Z50000`, and neither sheet has a
 * tab called Sheet1. Pareto FM was left with NO domain protection at all;
 * Train Hugger served 373 stale rows.
 *
 * The tab names were never a mystery — `spreadsheets.get` returns them, and
 * this file already called it in the failure path to write a nicer error. So
 * these tests pin two things:
 *
 *  1. With no range saved, resolve the sheet's FIRST tab instead of guessing.
 *  2. The replace REFUSES rather than warns. This path deletes then inserts, so
 *     resolving the wrong tab would silently unblock everyone on the list. On
 *     Train Hugger that is 373 domains going from blocked to sendable on a live
 *     cold-email system.
 */
const {
  valuesGet,
  metaGet,
  sourceFindUnique,
  sourceUpdate,
  domainCount,
  domainDeleteMany,
  domainCreateMany,
  refreshContactSuppressionFlagsForClient,
} = vi.hoisted(() => ({
  valuesGet: vi.fn(),
  metaGet: vi.fn(),
  sourceFindUnique: vi.fn(),
  sourceUpdate: vi.fn(),
  domainCount: vi.fn(),
  domainDeleteMany: vi.fn(),
  domainCreateMany: vi.fn(),
  refreshContactSuppressionFlagsForClient: vi.fn(),
}));

vi.mock("googleapis", () => ({
  google: {
    auth: { GoogleAuth: class {} },
    sheets: () => ({
      spreadsheets: { values: { get: valuesGet }, get: metaGet },
    }),
  },
}));
vi.mock("./auth", () => ({
  loadServiceAccountCredentials: () => ({ client_email: "sa@test", private_key: "k" }),
}));
vi.mock("./service-account-display", () => ({
  getGoogleServiceAccountDisplayInfo: () => ({
    configured: true,
    clientEmail: "sa@test",
  }),
}));
vi.mock("@/server/outreach/suppression-guard", () => ({
  refreshContactSuppressionFlagsForClient,
}));
vi.mock("@/lib/db", () => ({
  prisma: {
    suppressionSource: { findUnique: sourceFindUnique, update: sourceUpdate },
    $transaction: (fn: (tx: unknown) => unknown) =>
      fn({
        suppressedDomain: {
          count: domainCount,
          deleteMany: domainDeleteMany,
          createMany: domainCreateMany,
        },
      }),
  },
}));

import { syncSuppressionSourceFromGoogle } from "./suppression-sync";

function sourceRow(sheetRange: string | null) {
  return {
    id: "src-1",
    clientId: "c1",
    kind: "DOMAIN" as const,
    spreadsheetId: "sheet-123",
    sheetRange,
  };
}

/** What `spreadsheets.get` returns for a sheet with these tabs, in order. */
function tabs(...titles: string[]) {
  return {
    data: { sheets: titles.map((title) => ({ properties: { title } })) },
  };
}

function rangeAskedFor(): string {
  const call = valuesGet.mock.calls.at(-1) as [{ range: string }] | undefined;
  if (!call) throw new Error("Google was never asked for any values");
  return call[0].range;
}

describe("suppression sync — resolving the tab instead of guessing Sheet1", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    valuesGet.mockResolvedValue({ data: { values: [["blocked.example"]] } });
    sourceUpdate.mockResolvedValue({});
    domainCount.mockResolvedValue(0);
    domainDeleteMany.mockResolvedValue({ count: 0 });
    domainCreateMany.mockResolvedValue({ count: 1 });
  });

  // Pareto FM: one tab, called "Domains", no range ever saved.
  it("reads a single-tab sheet's real tab when no range is saved", async () => {
    sourceFindUnique.mockResolvedValue(sourceRow(null));
    metaGet.mockResolvedValue(tabs("Domains"));

    const r = await syncSuppressionSourceFromGoogle({ sourceId: "src-1" });

    expect(r.ok).toBe(true);
    expect(rangeAskedFor()).toContain("Domains");
    expect(rangeAskedFor()).not.toContain("Sheet1");
  });

  // Train Hugger: "Domains" first, "Company Names" second.
  it("reads the FIRST tab when the sheet has several", async () => {
    sourceFindUnique.mockResolvedValue(sourceRow(null));
    metaGet.mockResolvedValue(tabs("Domains", "Company Names"));

    await syncSuppressionSourceFromGoogle({ sourceId: "src-1" });

    expect(rangeAskedFor()).toContain("Domains");
    expect(rangeAskedFor()).not.toContain("Company Names");
  });

  it("quotes a first tab whose name has a space, so A1 notation stays valid", async () => {
    sourceFindUnique.mockResolvedValue(sourceRow(null));
    metaGet.mockResolvedValue(tabs("Company Names", "Domains"));

    await syncSuppressionSourceFromGoogle({ sourceId: "src-1" });

    expect(rangeAskedFor()).toBe("'Company Names'!A1:Z50000");
  });

  it("still lets an explicit saved range win over the resolved tab", async () => {
    sourceFindUnique.mockResolvedValue(sourceRow("Company Names!B:B"));
    metaGet.mockResolvedValue(tabs("Domains", "Company Names"));

    await syncSuppressionSourceFromGoogle({ sourceId: "src-1" });

    expect(rangeAskedFor()).toBe("Company Names!B:B");
  });

  // This used to fall back to `Sheet1!A1:Z50000`, on the reasoning that a
  // transient metadata error should leave behaviour exactly as it was. That
  // reasoning missed what the caller does next: a delete-then-insert. Guessing
  // a tab here is not "as it was", it is a REPLACE aimed at a tab nobody chose
  // — the 373-domain outcome above, arriving by a different door. Refusing
  // costs one 15-minute cycle; guessing can cost a client's whole blocklist.
  it("REFUSES rather than guessing Sheet1 when the tab names cannot be read", async () => {
    sourceFindUnique.mockResolvedValue(sourceRow(null));
    metaGet.mockRejectedValue(new Error("network"));

    const r = await syncSuppressionSourceFromGoogle({ sourceId: "src-1" });

    expect(r.ok).toBe(false);
    expect(valuesGet).not.toHaveBeenCalled();
    expect(domainDeleteMany).not.toHaveBeenCalled();
  });
});

describe("suppression sync — the replace refuses rather than warns", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sourceUpdate.mockResolvedValue({});
    domainDeleteMany.mockResolvedValue({ count: 0 });
    domainCreateMany.mockResolvedValue({ count: 1 });
    metaGet.mockResolvedValue(tabs("Domains"));
  });

  // The worst outcome this product has: 373 blocked domains become sendable.
  it("ABORTS a 373-to-0 sync and leaves the 373 in place", async () => {
    sourceFindUnique.mockResolvedValue(sourceRow(null));
    domainCount.mockResolvedValue(373);
    valuesGet.mockResolvedValue({ data: { values: [] } });

    const r = await syncSuppressionSourceFromGoogle({ sourceId: "src-1" });

    expect(r.ok).toBe(false);
    expect(domainDeleteMany).not.toHaveBeenCalled();
    expect(domainCreateMany).not.toHaveBeenCalled();
    expect(r.error).toContain("373");
  });

  it("ABORTS a sync that would remove most of a list", async () => {
    sourceFindUnique.mockResolvedValue(sourceRow(null));
    domainCount.mockResolvedValue(373);
    valuesGet.mockResolvedValue({ data: { values: [["still-blocked.example"]] } });

    const r = await syncSuppressionSourceFromGoogle({ sourceId: "src-1" });

    expect(r.ok).toBe(false);
    expect(domainDeleteMany).not.toHaveBeenCalled();
  });

  // Pareto FM's actual state: nothing stored, so nothing can be lost.
  it("allows a sync into an empty list — there is nothing to protect", async () => {
    sourceFindUnique.mockResolvedValue(sourceRow(null));
    domainCount.mockResolvedValue(0);
    valuesGet.mockResolvedValue({ data: { values: [["blocked.example"]] } });

    const r = await syncSuppressionSourceFromGoogle({ sourceId: "src-1" });

    expect(r.ok).toBe(true);
    expect(r.rowsWritten).toBe(1);
  });

  it("allows an ordinary edit that removes a couple of rows", async () => {
    sourceFindUnique.mockResolvedValue(sourceRow(null));
    domainCount.mockResolvedValue(6);
    valuesGet.mockResolvedValue({
      data: { values: [["a.example"], ["b.example"], ["c.example"], ["d.example"]] },
    });

    const r = await syncSuppressionSourceFromGoogle({ sourceId: "src-1" });

    expect(r.ok).toBe(true);
    expect(domainDeleteMany).toHaveBeenCalled();
  });

  it("lets an operator who confirms the shrink through", async () => {
    sourceFindUnique.mockResolvedValue(sourceRow(null));
    domainCount.mockResolvedValue(373);
    valuesGet.mockResolvedValue({ data: { values: [] } });

    const r = await syncSuppressionSourceFromGoogle({
      sourceId: "src-1",
      confirmShrink: true,
    });

    expect(r.ok).toBe(true);
    expect(domainDeleteMany).toHaveBeenCalled();
  });

  it("reports the blocked shrink so the caller can offer that confirmation", async () => {
    sourceFindUnique.mockResolvedValue(sourceRow(null));
    domainCount.mockResolvedValue(373);
    valuesGet.mockResolvedValue({ data: { values: [] } });

    const r = await syncSuppressionSourceFromGoogle({ sourceId: "src-1" });

    expect(r.blockedShrink).toMatchObject({
      previousCount: 373,
      wouldWrite: 0,
      removed: 373,
    });
  });
});
