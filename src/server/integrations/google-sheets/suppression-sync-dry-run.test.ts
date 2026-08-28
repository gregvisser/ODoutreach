import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Asking a do-not-contact sheet what it WOULD do, without doing it.
 *
 * The sync is delete-then-insert against a live blocklist. Cycle 65 made the
 * replace refuse a shrink, which stops the worst outcome — but there was still
 * no way to find out what a sheet resolves to, or how many rows it holds,
 * except by running the replace on real client data and reading the aggregate
 * afterwards. "How many rows does Train Hugger's sheet actually have?" could
 * only be answered by pressing the thing that deletes Train Hugger's rows.
 *
 * So the same code path can now be asked to stop just before it writes. That
 * is the point of routing it through `syncSuppressionSourceFromGoogle` rather
 * than a separate preview function: a preview that resolves the tab, dedupes,
 * or applies the public-suffix rule DIFFERENTLY from the real sync predicts
 * nothing. Same resolution, same normalisation, same guard — no writes.
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
  loadServiceAccountCredentials: () => ({
    client_email: "sa@test",
    private_key: "k",
  }),
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

function tabs(...titles: string[]) {
  return {
    data: { sheets: titles.map((title) => ({ properties: { title } })) },
  };
}

/** Every way this module can change stored state or the source row. */
function nothingWasWritten() {
  expect(domainDeleteMany).not.toHaveBeenCalled();
  expect(domainCreateMany).not.toHaveBeenCalled();
  expect(refreshContactSuppressionFlagsForClient).not.toHaveBeenCalled();
  // Not even the status column. A dry run that stamps SYNCING/SUCCESS or
  // clears lastError has edited the client's record to answer a question.
  expect(sourceUpdate).not.toHaveBeenCalled();
}

describe("a dry run reports without writing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sourceUpdate.mockResolvedValue({});
    domainDeleteMany.mockResolvedValue({ count: 0 });
    domainCreateMany.mockResolvedValue({ count: 1 });
    metaGet.mockResolvedValue(tabs("Domains"));
  });

  // Pareto FM's live state: nothing stored, sheet never read successfully.
  it("says what it WOULD write and touches nothing", async () => {
    sourceFindUnique.mockResolvedValue(sourceRow(null));
    domainCount.mockResolvedValue(0);
    valuesGet.mockResolvedValue({
      data: { values: [["a.example"], ["b.example"], ["c.example"]] },
    });

    const r = await syncSuppressionSourceFromGoogle({
      sourceId: "src-1",
      dryRun: true,
    });

    expect(r.ok).toBe(true);
    expect(r.dryRun).toBe(true);
    expect(r.wouldWrite).toBe(3);
    expect(r.previousCount).toBe(0);
    nothingWasWritten();
  });

  it("never reports rowsWritten, because a dry run wrote no rows", async () => {
    sourceFindUnique.mockResolvedValue(sourceRow(null));
    domainCount.mockResolvedValue(0);
    valuesGet.mockResolvedValue({ data: { values: [["a.example"]] } });

    const r = await syncSuppressionSourceFromGoogle({
      sourceId: "src-1",
      dryRun: true,
    });

    expect(r.rowsWritten).toBeUndefined();
  });

  // The question that could not be answered without pressing Sync.
  it("names the tab it resolved, so the answer can be checked against the Sheet", async () => {
    sourceFindUnique.mockResolvedValue(sourceRow(null));
    domainCount.mockResolvedValue(0);
    valuesGet.mockResolvedValue({ data: { values: [["a.example"]] } });
    metaGet.mockResolvedValue(tabs("Domains", "Company Names"));

    const r = await syncSuppressionSourceFromGoogle({
      sourceId: "src-1",
      dryRun: true,
    });

    expect(r.resolvedRange).toBe("'Domains'!A1:Z50000");
  });

  it("reports the resolved range on a REAL sync too, not only a dry run", async () => {
    sourceFindUnique.mockResolvedValue(sourceRow(null));
    domainCount.mockResolvedValue(0);
    valuesGet.mockResolvedValue({ data: { values: [["a.example"]] } });

    const r = await syncSuppressionSourceFromGoogle({ sourceId: "src-1" });

    expect(r.ok).toBe(true);
    expect(r.resolvedRange).toBe("'Domains'!A1:Z50000");
    expect(r.rowsWritten).toBe(1);
  });

  // Train Hugger's live state: 373 stored. A dry run must show the refusal
  // WITHOUT being the thing that finds out the hard way.
  it("shows the guard would refuse a 373-to-0, and still deletes nothing", async () => {
    sourceFindUnique.mockResolvedValue(sourceRow(null));
    domainCount.mockResolvedValue(373);
    valuesGet.mockResolvedValue({ data: { values: [] } });

    const r = await syncSuppressionSourceFromGoogle({
      sourceId: "src-1",
      dryRun: true,
    });

    expect(r.ok).toBe(false);
    expect(r.blockedShrink).toMatchObject({
      previousCount: 373,
      wouldWrite: 0,
      removed: 373,
    });
    nothingWasWritten();
  });

  it("does not record the refusal on the source row during a dry run", async () => {
    sourceFindUnique.mockResolvedValue(sourceRow(null));
    domainCount.mockResolvedValue(373);
    valuesGet.mockResolvedValue({ data: { values: [] } });

    await syncSuppressionSourceFromGoogle({ sourceId: "src-1", dryRun: true });

    // Writing ERROR + lastError here would make asking a question look
    // identical to a failed scheduled sync on the Sources screen.
    expect(sourceUpdate).not.toHaveBeenCalled();
  });

  it("honours an explicit saved range, exactly as the real sync does", async () => {
    sourceFindUnique.mockResolvedValue(sourceRow("Company Names!B:B"));
    domainCount.mockResolvedValue(0);
    valuesGet.mockResolvedValue({ data: { values: [["a.example"]] } });

    const r = await syncSuppressionSourceFromGoogle({
      sourceId: "src-1",
      dryRun: true,
    });

    expect(r.resolvedRange).toBe("Company Names!B:B");
    expect(valuesGet.mock.calls.at(-1)?.[0].range).toBe("Company Names!B:B");
  });

  // The count must come from the same normalisation the real sync uses, or the
  // preview is a different program that happens to read the same sheet.
  it("counts what the real sync would store, not raw cells", async () => {
    sourceFindUnique.mockResolvedValue(sourceRow(null));
    domainCount.mockResolvedValue(0);
    valuesGet.mockResolvedValue({
      data: {
        values: [
          ["https://www.a.example/careers"], // normalises to a.example
          ["A.EXAMPLE"], // same domain again — deduped
          ["co.uk"], // bare public suffix — dropped
          ["not a domain"], // dropped
          ["b.example"],
        ],
      },
    });

    const r = await syncSuppressionSourceFromGoogle({
      sourceId: "src-1",
      dryRun: true,
    });

    expect(r.wouldWrite).toBe(2);
  });
});
