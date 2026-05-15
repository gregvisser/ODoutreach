import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * PR #140 (G2a) — ReportingDailySnapshot is now runtime-dead.
 *
 * No code path writes to the model, and PR #140 removed the last two
 * read paths:
 *   * `src/server/queries/reporting.ts` (getReportingSnapshotsForStaff)
 *   * `src/server/queries/dashboard.ts` (getDashboardSummaryForStaff,
 *     which wrapped reportingDailySnapshot.findMany).
 *
 * Both files were unused — they had no import sites in the app — and
 * are deleted. The Prisma model itself is intentionally left in place;
 * the schema cleanup is deferred to a separately approved migration so
 * that PR #140 does not touch the database.
 *
 * This test locks the cleanup so a future change cannot accidentally
 * reintroduce a UI dependency on the rollup table.
 */

const REPORTING_PAGE_SOURCE = readFileSync(
  join(process.cwd(), "src/app/(app)/reporting/page.tsx"),
  "utf8",
);

describe("ReportingDailySnapshot is runtime-dead (PR #140)", () => {
  it("removes src/server/queries/reporting.ts", () => {
    const path = join(process.cwd(), "src/server/queries/reporting.ts");
    expect(existsSync(path)).toBe(false);
  });

  it("removes src/server/queries/dashboard.ts", () => {
    const path = join(process.cwd(), "src/server/queries/dashboard.ts");
    expect(existsSync(path)).toBe(false);
  });

  it("the /reporting page does not reference the snapshot rollup", () => {
    expect(REPORTING_PAGE_SOURCE).not.toContain("reportingDailySnapshot");
    expect(REPORTING_PAGE_SOURCE).not.toContain("getReportingSnapshotsForStaff");
    expect(REPORTING_PAGE_SOURCE).not.toContain(
      "getDashboardSummaryForStaff",
    );
    expect(REPORTING_PAGE_SOURCE).not.toContain("@/server/queries/reporting");
    expect(REPORTING_PAGE_SOURCE).not.toContain("@/server/queries/dashboard");
  });

  it("the /reporting page reads live database counts only", () => {
    expect(REPORTING_PAGE_SOURCE).toContain("loadGlobalOutreachMetrics");
    expect(REPORTING_PAGE_SOURCE).toContain("loadClientOutreachMetrics");
    // Copy must continue to label the source of truth as the live DB.
    expect(REPORTING_PAGE_SOURCE).toMatch(
      /Live\s+counts? from the database|live\s+counts? from the database/,
    );
  });

  it("does not surface a 'No snapshot data' empty state any more", () => {
    expect(REPORTING_PAGE_SOURCE).not.toMatch(/no snapshot data/i);
    expect(REPORTING_PAGE_SOURCE).not.toMatch(/Snapshot table is empty/i);
  });

  it("the Prisma model carries a DEPRECATED marker for future operators", () => {
    const schema = readFileSync(
      join(process.cwd(), "prisma/schema.prisma"),
      "utf8",
    );
    const block = schema.slice(
      schema.indexOf("// ——— Reporting aggregates"),
      schema.indexOf("model ReportingDailySnapshot {") + 50,
    );
    expect(block).toMatch(/DEPRECATED/);
    expect(block).toMatch(/no migration is added/);
  });
});
