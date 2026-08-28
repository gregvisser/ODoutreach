import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The bottom link of the sheet-range chain: whatever range is stored on the
 * source row is the range Google is actually asked for.
 *
 * This half already worked — it is pinned here because the chain above it
 * (operator types a range → it is persisted) was broken for days without this
 * being noticed, and a chain is only proven end to end if every link has a
 * test. See `client-suppression-range-wiring.test.ts` for the link that was
 * missing.
 */
const {
  valuesGet,
  sourceFindUnique,
  sourceUpdate,
  domainCount,
  domainDeleteMany,
  domainCreateMany,
  refreshContactSuppressionFlagsForClient,
} = vi.hoisted(() => ({
  valuesGet: vi.fn(),
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
    sheets: () => ({ spreadsheets: { values: { get: valuesGet } } }),
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

/** The range the product falls back to when a source has none saved. */
const DEFAULT_RANGE = "Sheet1!A1:Z50000";

function sourceRow(sheetRange: string | null) {
  return {
    id: "src-1",
    clientId: "c1",
    kind: "DOMAIN" as const,
    spreadsheetId: "sheet-123",
    sheetRange,
  };
}

describe("syncSuppressionSourceFromGoogle — the saved range is the range read", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    valuesGet.mockResolvedValue({ data: { values: [["trainhugger.com"]] } });
    sourceUpdate.mockResolvedValue({});
    domainCount.mockResolvedValue(0);
    domainDeleteMany.mockResolvedValue({ count: 0 });
    domainCreateMany.mockResolvedValue({ count: 1 });
  });

  it("asks Google for the tab the operator saved, not Sheet1", async () => {
    sourceFindUnique.mockResolvedValue(sourceRow("Domains!A:A"));

    const r = await syncSuppressionSourceFromGoogle({ sourceId: "src-1" });

    expect(r.ok).toBe(true);
    expect(valuesGet).toHaveBeenCalledWith({
      spreadsheetId: "sheet-123",
      range: "Domains!A:A",
    });
    // The live failure this whole item exists to fix: reading Sheet1 when the
    // client's data is on a tab called Domains.
    expect(valuesGet).not.toHaveBeenCalledWith(
      expect.objectContaining({ range: DEFAULT_RANGE }),
    );
  });

  it("accepts a bare tab name, so an operator need not know A1 notation", async () => {
    sourceFindUnique.mockResolvedValue(sourceRow("Domains"));

    await syncSuppressionSourceFromGoogle({ sourceId: "src-1" });

    expect(valuesGet).toHaveBeenCalledWith({
      spreadsheetId: "sheet-123",
      range: "Domains",
    });
  });

  // This mock has no `spreadsheets.get`, so the tab lookup fails and the sync
  // falls back to the historic default — which is the guarantee being pinned
  // here. When the tabs CAN be read, no saved range now resolves the sheet's
  // first tab instead; see `suppression-sync-tab-resolution.test.ts`.
  it("falls back to the default when no range is saved and no tab is known", async () => {
    sourceFindUnique.mockResolvedValue(sourceRow(null));

    await syncSuppressionSourceFromGoogle({ sourceId: "src-1" });

    expect(valuesGet).toHaveBeenCalledWith({
      spreadsheetId: "sheet-123",
      range: DEFAULT_RANGE,
    });
  });

  it("writes the rows it found in the operator's tab", async () => {
    sourceFindUnique.mockResolvedValue(sourceRow("Domains!A:A"));

    const r = await syncSuppressionSourceFromGoogle({ sourceId: "src-1" });

    expect(r).toMatchObject({ ok: true, rowsWritten: 1 });
    expect(domainCreateMany).toHaveBeenCalledWith({
      data: [{ clientId: "c1", sourceId: "src-1", domain: "trainhugger.com" }],
      skipDuplicates: true,
    });
  });
});
