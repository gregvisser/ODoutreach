import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The sync remembers which tab it read, so it stops paying to re-derive it.
 *
 * Resolving a sheet's real tab costs a `spreadsheets.get` per source. Measured
 * against production on 2026-08-29, ALL 34 configured sources had no saved
 * range — so every 15-minute cron asked Google 68 questions to answer 34 that
 * had not changed since the last run, against a ceiling of 60 reads per minute
 * per user. (The row that asked for this said "~29 of the 34"; the real number
 * is 34 of 34.)
 *
 * The measure is the one the queue asked for: a sweep over N sources issues at
 * most N reads once every range is known. So these tests run the REAL
 * `syncAllConfiguredSuppressionSources` over a store that the sync writes back
 * into, twice, and count the Google calls. Staging a "second run" by handing
 * the second sweep pre-saved rows would prove nothing about whether the first
 * one saved anything.
 *
 * The other half is the reason this is safe to do at all. Remembering a range
 * is a write to a client's configuration, so a range that came from a GUESS
 * must never be written — and until now a metadata call refused for quota
 * returned `[]`, which fell back to `Sheet1!A1:Z50000`, on a path that DELETES
 * before it inserts. A momentary quota blip could aim a REPLACE at the wrong
 * tab and silently unblock a client's whole do-not-contact list.
 */
const {
  valuesGet,
  metaGet,
  refreshContactSuppressionFlagsForClient,
} = vi.hoisted(() => ({
  valuesGet: vi.fn(),
  metaGet: vi.fn(),
  refreshContactSuppressionFlagsForClient: vi.fn(),
}));

type Row = {
  id: string;
  clientId: string;
  kind: "DOMAIN";
  spreadsheetId: string | null;
  sheetRange: string | null;
  syncStatus: string;
  lastError: string | null;
  lastSyncedAt: Date | null;
  client: { name: string };
};

/**
 * The source rows, mutable, standing in for the table.
 *
 * A plain object store rather than a `vi.fn()` returning fixtures, precisely so
 * an `update` that saves a range is visible to the next `findMany`. That
 * feedback IS the behaviour under test.
 */
const store = new Map<string, Row>();

function seed(count: number) {
  store.clear();
  for (let i = 0; i < count; i += 1) {
    store.set(`src-${i}`, {
      id: `src-${i}`,
      clientId: `client-${i}`,
      kind: "DOMAIN",
      spreadsheetId: `sheet-${i}`,
      sheetRange: null,
      syncStatus: "NOT_CONFIGURED",
      lastError: null,
      lastSyncedAt: null,
      client: { name: `Client ${i}` },
    });
  }
}

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
    suppressionSource: {
      findMany: vi.fn(async () => [...store.values()]),
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) =>
        store.get(where.id) ?? null,
      ),
      update: vi.fn(
        async ({
          where,
          data,
        }: {
          where: { id: string };
          data: Partial<Row>;
        }) => {
          const row = store.get(where.id);
          if (row) store.set(where.id, { ...row, ...data });
          return store.get(where.id);
        },
      ),
    },
    // Every source in this suite starts empty and gains one domain, which the
    // replace guard allows — nothing is being removed.
    $transaction: (fn: (tx: unknown) => unknown) =>
      fn({
        suppressedDomain: {
          count: async () => 0,
          deleteMany: async () => ({ count: 0 }),
          createMany: async () => ({ count: 1 }),
        },
      }),
  },
}));

import { syncSuppressionSourceFromGoogle } from "./suppression-sync";
import { syncAllConfiguredSuppressionSources } from "./suppression-sync-all";

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

function tabs(...titles: string[]) {
  return { data: { sheets: titles.map((title) => ({ properties: { title } })) } };
}

describe("do-not-contact sync — a resolved tab is remembered, not re-derived", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    metaGet.mockResolvedValue(tabs("Domains"));
    valuesGet.mockResolvedValue({ data: { values: [["blocked.example"]] } });
  });

  // The queue's own measure, in its own words: "a sync-all run over N sources
  // issues at most N reads when every range is known."
  it("issues 2N Google reads the first sweep and N the second, over 5 sources", async () => {
    seed(5);

    const first = await syncAllConfiguredSuppressionSources();
    expect(first.succeeded).toBe(5);
    expect(first.failed).toBe(0);
    expect(metaGet.mock.calls.length + valuesGet.mock.calls.length).toBe(10);

    metaGet.mockClear();
    valuesGet.mockClear();

    const second = await syncAllConfiguredSuppressionSources();
    expect(second.succeeded).toBe(5);
    expect(metaGet).not.toHaveBeenCalled();
    expect(valuesGet).toHaveBeenCalledTimes(5);
  });

  it("saves the resolved range onto the source, so it can be seen and changed", async () => {
    seed(1);

    await syncAllConfiguredSuppressionSources();

    expect(store.get("src-0")?.sheetRange).toBe("'Domains'!A1:Z50000");
  });

  it("reads the SAME range on the second sweep as it resolved on the first", async () => {
    seed(1);
    await syncAllConfiguredSuppressionSources();
    const firstRange = (valuesGet.mock.calls.at(-1) as [{ range: string }])[0]
      .range;

    await syncAllConfiguredSuppressionSources();
    const secondRange = (valuesGet.mock.calls.at(-1) as [{ range: string }])[0]
      .range;

    expect(secondRange).toBe(firstRange);
    expect(secondRange).toBe("'Domains'!A1:Z50000");
  });

  it("never overwrites a range an operator typed", async () => {
    seed(1);
    store.set("src-0", { ...store.get("src-0")!, sheetRange: "Domains!B:B" });

    await syncAllConfiguredSuppressionSources();

    expect(store.get("src-0")?.sheetRange).toBe("Domains!B:B");
    // And it did not pay for a lookup it had no use for.
    expect(metaGet).not.toHaveBeenCalled();
  });

  it("remembers nothing on a dry run, which is only ever a question", async () => {
    seed(1);

    const r = await syncAllConfiguredSuppressionSources({ dryRun: true });

    expect(r.succeeded).toBe(1);
    expect(store.get("src-0")?.sheetRange).toBeNull();
  });

  // The refused shrink is not a doubt about WHICH tab — Google served this
  // range. Train Hugger's domain list has sat in this state since 2026-08-14.
  it("remembers the range even when the shrink guard refuses the write", async () => {
    seed(1);
    valuesGet.mockResolvedValue({ data: { values: [] } });
    const { prisma } = await import("@/lib/db");
    vi.spyOn(prisma, "$transaction").mockImplementation(
      ((fn: (tx: unknown) => unknown) =>
        fn({
          suppressedDomain: {
            count: async () => 373,
            deleteMany: async () => ({ count: 0 }),
            createMany: async () => ({ count: 0 }),
          },
        })) as never,
    );

    const r = await syncAllConfiguredSuppressionSources();

    expect(r.failed).toBe(1);
    expect(store.get("src-0")?.sheetRange).toBe("'Domains'!A1:Z50000");
    vi.restoreAllMocks();
  });
});

describe("do-not-contact sync — an unreadable tab list refuses, it does not guess", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    seed(1);
    valuesGet.mockResolvedValue({ data: { values: [["blocked.example"]] } });
  });

  it("REFUSES rather than falling back to Sheet1 when the lookup is refused", async () => {
    metaGet.mockRejectedValue(QUOTA());

    const r = await syncSuppressionSourceFromGoogle({ sourceId: "src-0" });

    expect(r.ok).toBe(false);
    // The whole point: Google was never asked for any cells, so nothing was
    // deleted and nothing was written from a guessed tab.
    expect(valuesGet).not.toHaveBeenCalled();
    expect(store.get("src-0")?.syncStatus).toBe("ERROR");
  });

  it("saves no range when it could not resolve one", async () => {
    metaGet.mockRejectedValue(QUOTA());

    await syncSuppressionSourceFromGoogle({ sourceId: "src-0" });

    expect(store.get("src-0")?.sheetRange).toBeNull();
  });

  it("tells the operator nothing changed, and what to do if it persists", async () => {
    metaGet.mockRejectedValue(QUOTA());

    const r = await syncSuppressionSourceFromGoogle({ sourceId: "src-0" });

    expect(r.error).toContain("Nothing was changed");
    expect(r.error).toContain("tab and range");
  });

  it("refuses a lookup that succeeds but names no tabs — an unusable answer", async () => {
    metaGet.mockResolvedValue(tabs());

    const r = await syncSuppressionSourceFromGoogle({ sourceId: "src-0" });

    expect(r.ok).toBe(false);
    expect(valuesGet).not.toHaveBeenCalled();
  });

  // One broken sheet must never stop the sweep, and refusing must not become a
  // way for one client's quota blip to silence thirty-three others.
  it("lets the rest of the sweep through when one sheet cannot be resolved", async () => {
    seed(3);
    metaGet
      .mockRejectedValueOnce(QUOTA())
      .mockRejectedValueOnce(QUOTA())
      .mockRejectedValueOnce(QUOTA())
      .mockResolvedValue(tabs("Domains"));

    const r = await syncAllConfiguredSuppressionSources();

    // The limiter retries a quota refusal twice, so three rejections exhaust
    // exactly one source; the other two resolve normally.
    expect(r.failed).toBe(1);
    expect(r.succeeded).toBe(2);
  });
});
