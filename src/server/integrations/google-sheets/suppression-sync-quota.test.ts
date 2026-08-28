import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The quota gate, proven to be IN the sync rather than merely to exist.
 *
 * Resolving each sheet's real tab costs a second Google call, so thirty-four
 * configured sources went from thirty-four requests to sixty-eight — over the
 * sixty-per-minute-per-user limit. The live dry run on 2026-08-28 reported
 * "Quota exceeded" for five sheets, Pareto FM among them: the very client the
 * tab fix was written for was knocked out by the tab fix.
 *
 * `sheets-read-limiter.test.ts` proves the gate paces and retries. These tests
 * prove the sync actually goes THROUGH it — unwire `limitSheetsRead` from
 * either call site and these go red, which is the check that was missing every
 * other time this project built something that reported success and never
 * fired.
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

/** Verbatim, from the 2026-08-28 11:18 UTC production run. */
const QUOTA = () =>
  Object.assign(
    new Error(
      "Quota exceeded for quota metric 'Read requests' and limit 'Read " +
        "requests per minute per user' of service 'sheets.googleapis.com' " +
        "for consumer 'project_number:452662141668'.",
    ),
    { code: 429 },
  );

function sourceRow(sheetRange: string | null = null) {
  return {
    id: "src-1",
    clientId: "c1",
    kind: "DOMAIN" as const,
    spreadsheetId: "sheet-123",
    sheetRange,
  };
}

function tabs(...titles: string[]) {
  return { data: { sheets: titles.map((title) => ({ properties: { title } })) } };
}

describe("suppression sync — the Google read quota gate is in the path", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sourceFindUnique.mockResolvedValue(sourceRow());
    metaGet.mockResolvedValue(tabs("Domains"));
    valuesGet.mockResolvedValue({ data: { values: [["blocked.example"]] } });
    sourceUpdate.mockResolvedValue({});
    domainCount.mockResolvedValue(0);
    domainDeleteMany.mockResolvedValue({ count: 0 });
    domainCreateMany.mockResolvedValue({ count: 1 });
  });

  it("retries the VALUES read when Google refuses it for quota, and succeeds", async () => {
    valuesGet
      .mockRejectedValueOnce(QUOTA())
      .mockResolvedValue({ data: { values: [["blocked.example"]] } });

    const r = await syncSuppressionSourceFromGoogle({ sourceId: "src-1" });

    expect(r.ok).toBe(true);
    expect(valuesGet).toHaveBeenCalledTimes(2);
  });

  it("retries the TAB-TITLES read for quota, so the range is still resolved", async () => {
    // This is the Pareto FM failure exactly: the metadata call was refused, the
    // range fell back to the historic `Sheet1` guess, and a client with no
    // domain protection stayed with none.
    metaGet.mockRejectedValueOnce(QUOTA()).mockResolvedValue(tabs("Domains"));

    const r = await syncSuppressionSourceFromGoogle({ sourceId: "src-1" });

    expect(r.ok).toBe(true);
    expect(metaGet).toHaveBeenCalledTimes(2);
    expect(r.resolvedRange).toBe("'Domains'!A1:Z50000");
    expect(r.resolvedRange).not.toContain("Sheet1");
  });

  it("does NOT retry a bad range, which no amount of waiting would fix", async () => {
    valuesGet.mockRejectedValue(new Error("Unable to parse range: Nope!A1:Z1"));

    const r = await syncSuppressionSourceFromGoogle({ sourceId: "src-1" });

    expect(r.ok).toBe(false);
    expect(valuesGet).toHaveBeenCalledTimes(1);
  });

  it("still reports a failure when the quota never clears, rather than hanging", async () => {
    valuesGet.mockRejectedValue(QUOTA());

    const r = await syncSuppressionSourceFromGoogle({ sourceId: "src-1" });

    expect(r.ok).toBe(false);
    // Bounded: the first attempt plus the configured retries, then it gives up
    // and the sheet is reported as failing.
    expect(valuesGet).toHaveBeenCalledTimes(3);
    expect(domainDeleteMany).not.toHaveBeenCalled();
  });
});
