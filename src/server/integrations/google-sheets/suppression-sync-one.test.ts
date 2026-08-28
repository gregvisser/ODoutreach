import { beforeEach, describe, expect, it, vi } from "vitest";

import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Re-syncing ONE do-not-contact sheet on demand.
 *
 * ## Why this exists, and why it is not just "run the cron"
 *
 * The only thing that writes a blocklist is a side-step of the replies cron,
 * which syncs all thirty-four sheets in a single HTTP request. Three facts made
 * that unusable as a way to land one client's list:
 *
 * 1. **The cron does not reliably run.** GitHub dropped every scheduled run
 *    between 01:50Z and 12:00Z on 2026-08-28 — both crons, ten hours, straight
 *    through the working window.
 * 2. **The request is at the edge of the platform timeout.** Pacing sixty-eight
 *    Google reads at 1.1s is seventy-five seconds of pure waiting inside one
 *    request. Three dispatches that morning answered 502 (65s), 207 (83s) and
 *    499 (241s). Azure gives up at about 230.
 * 3. **The one source that needed writing is processed LAST.** Sources are
 *    ordered `updatedAt: asc`, and Pareto FM's domain list sat at the end of
 *    the run — so the timeout lands precisely on the sheet this was for.
 *
 * A run that stops at source thirty of thirty-four still reports the sheets it
 * managed. That is not corruption — each source is atomic — but it means "I ran
 * the sync" and "that client's list was written" are different sentences, which
 * is the defect this project keeps rediscovering.
 *
 * Naming one sheet makes the request two Google reads instead of sixty-eight,
 * and it narrows what is written from thirty-four clients' data to one.
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

const ALL = [
  source("s1", "Pareto FM", "DOMAIN"),
  source("s2", "Train Hugger", "DOMAIN"),
  source("s3", "Panda Recycling", "EMAIL"),
];

function whereOfLastFindMany(): Record<string, unknown> {
  const call = findMany.mock.calls.at(-1) as
    | [{ where: Record<string, unknown> }]
    | undefined;
  if (!call) throw new Error("the sources were never queried");
  return call[0].where;
}

describe("syncing one named do-not-contact sheet", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    syncSuppressionSourceFromGoogle.mockResolvedValue({
      ok: true,
      rowsWritten: 121,
      previousCount: 0,
      resolvedRange: "'Domains'!A1:Z50000",
    });
  });

  it("asks the database for that source only, never for all of them", async () => {
    findMany.mockResolvedValue([ALL[0]]);

    const r = await syncAllConfiguredSuppressionSources({ sourceId: "s1" });

    // The filter must be in the QUERY, not applied afterwards: reading
    // thirty-four rows and then skipping thirty-three would still let a future
    // edit sync them by accident.
    expect(whereOfLastFindMany()).toMatchObject({ id: "s1" });
    expect(syncSuppressionSourceFromGoogle).toHaveBeenCalledTimes(1);
    expect(syncSuppressionSourceFromGoogle).toHaveBeenCalledWith(
      expect.objectContaining({ sourceId: "s1" }),
    );
    expect(r.sources).toBe(1);
    expect(r.outcomes).toEqual([
      expect.objectContaining({ client: "Pareto FM", rowsWritten: 121 }),
    ]);
  });

  it("still only targets sheets that have a spreadsheet configured", async () => {
    findMany.mockResolvedValue([ALL[0]]);

    await syncAllConfiguredSuppressionSources({ sourceId: "s1" });

    expect(whereOfLastFindMany()).toMatchObject({
      id: "s1",
      spreadsheetId: { not: null },
    });
  });

  /**
   * The one that matters.
   *
   * A mistyped id matches no row, so the loop runs zero times and every count
   * is zero — `succeeded: 0, failed: 0, errors: []`. `jobOutcome` derives `ok`
   * from exactly those, so the route would answer **200 ok: true** for a sync
   * that touched nothing at all, and the operator would read "it worked" about
   * a blocklist that was never written.
   *
   * That is this repository's signature defect — built, wired, reporting
   * success, never fired — reproduced in a brand new code path. Naming a sheet
   * that does not exist is a failure, and it has to say so.
   */
  it("FAILS LOUDLY when the named sheet matches nothing, instead of reporting a clean run", async () => {
    findMany.mockResolvedValue([]);

    const r = await syncAllConfiguredSuppressionSources({ sourceId: "nope" });

    expect(syncSuppressionSourceFromGoogle).not.toHaveBeenCalled();
    expect(r.failed).toBe(1);
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0]).toContain("nope");
    expect(r.succeeded).toBe(0);
  });

  /**
   * A workflow input that arrives empty must not mean "then do all of them".
   *
   * `--field source_id=` and a forgotten shell variable both produce `""`. If
   * blank fell through to the unfiltered query, the safest-looking mistake an
   * operator can make would write thirty-four clients' blocklists.
   */
  it("refuses a blank sourceId rather than falling back to syncing everything", async () => {
    findMany.mockResolvedValue(ALL);

    const r = await syncAllConfiguredSuppressionSources({ sourceId: "   " });

    expect(findMany).not.toHaveBeenCalled();
    expect(syncSuppressionSourceFromGoogle).not.toHaveBeenCalled();
    expect(r.failed).toBe(1);
    expect(r.errors[0]).toMatch(/blank|empty/i);
  });

  it("with no sourceId at all, every configured sheet is still synced", async () => {
    findMany.mockResolvedValue(ALL);

    const r = await syncAllConfiguredSuppressionSources();

    expect(whereOfLastFindMany()).not.toHaveProperty("id");
    expect(syncSuppressionSourceFromGoogle).toHaveBeenCalledTimes(3);
    expect(r.sources).toBe(3);
  });

  it("reports the source id back, so the next run can name the same sheet", async () => {
    findMany.mockResolvedValue([ALL[0]]);

    const r = await syncAllConfiguredSuppressionSources({ sourceId: "s1" });

    expect(r.outcomes[0]).toMatchObject({ sourceId: "s1" });
  });
});

/**
 * The manual workflow, and the reason it is a separate file from the cron.
 *
 * `alerts.yml` fires on `workflow_run` for a named list of workflows and emails
 * Greg. Dispatching "Sync replies" to reach the sync would therefore have sent
 * him mail as a side effect of an operator pressing a button. Keeping this
 * workflow off that list is what makes running it a write and nothing else.
 */
describe("the manual single-sheet sync workflow", () => {
  const root = process.cwd();
  const workflow = readFileSync(
    join(root, ".github/workflows/sync-one-dnc-sheet.yml"),
    "utf8",
  );
  const alerts = readFileSync(
    join(root, ".github/workflows/alerts.yml"),
    "utf8",
  );

  it("is manual only — it must never acquire a schedule", () => {
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).not.toMatch(/^\s*schedule:/m);
  });

  it("requires the operator to name a sheet", () => {
    expect(workflow).toMatch(/required:\s*true/);
    expect(workflow).toContain("source_id");
  });

  it("reads the running build directly, not through the CDN", () => {
    expect(workflow).toContain(
      "app-opensdoors-outreach-prod.azurewebsites.net",
    );
    expect(workflow).not.toContain("opensdoors.bidlow.co.uk");
  });

  it("does not send Greg an email as a side effect of an operator writing a list", () => {
    expect(alerts).not.toContain("Sync one do-not-contact sheet");
  });

  it("refuses to report success on a response that says it was a dry run", () => {
    // The inverse of the dry-run workflow's guard: that one fails if the server
    // WROTE, this one fails if it did not. Either way the claim is checked
    // against what the running build reports, not against what was asked for.
    expect(workflow).toContain(".dryRun");
  });
});
