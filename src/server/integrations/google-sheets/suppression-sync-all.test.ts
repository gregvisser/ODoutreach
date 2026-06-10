import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Contract test for the scheduled DNC sheet re-sync. The single-source
 * sync behaviour (atomic delete+recreate, bulk timeout, error copy) is
 * covered elsewhere; this locks the orchestration wiring so refactors
 * can't silently break the "staff edits the sheet → follow-ups stop"
 * guarantee.
 */
const root = process.cwd();
const syncAll = readFileSync(
  join(root, "src/server/integrations/google-sheets/suppression-sync-all.ts"),
  "utf8",
);
const route = readFileSync(
  join(root, "src/app/api/internal/suppression/sync-all/route.ts"),
  "utf8",
);
const repliesWorkflow = readFileSync(
  join(root, ".github/workflows/sync-replies.yml"),
  "utf8",
);

describe("suppression sync-all wiring", () => {
  it("reuses the single-source sync (atomic + bulk-timeout path), no hand-rolled writes", () => {
    expect(syncAll).toContain("syncSuppressionSourceFromGoogle");
    expect(syncAll).not.toMatch(/suppressedEmail\.(create|delete)/i);
    expect(syncAll).not.toMatch(/suppressedDomain\.(create|delete)/i);
  });

  it("only targets sources with a configured spreadsheet", () => {
    expect(syncAll).toContain("spreadsheetId: { not: null }");
  });

  it("isolates per-source failures so one broken sheet cannot stop the rest", () => {
    expect(syncAll).toContain("try {");
    expect(syncAll).toContain("result.errors.push");
  });

  it("the internal route is gated behind the PROCESS_QUEUE_SECRET bearer", () => {
    expect(route).toContain("PROCESS_QUEUE_SECRET");
    expect(route).toContain("Bearer ${secret}");
    expect(route).toContain("status: 401");
  });

  it("the replies cron calls the sync-all route non-fatally", () => {
    expect(repliesWorkflow).toContain("/api/internal/suppression/sync-all");
    expect(repliesWorkflow).toContain("Sync do-not-contact sheets");
    expect(repliesWorkflow).toContain("continuing.");
  });
});
