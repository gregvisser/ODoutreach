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

  it("the replies cron calls the sync-all route", () => {
    expect(repliesWorkflow).toContain("/api/internal/suppression/sync-all");
    expect(repliesWorkflow).toContain("Sync do-not-contact sheets");
  });
});

/**
 * ## The green run that was hiding two dead blocklists
 *
 * Production, 2026-08-26T18:59:54Z, run 33002377746 — a run GitHub reports as
 * **success**:
 *
 * ```
 * DNC sheet sync HTTP status: 207
 * {"sources":34,"succeeded":32,"failed":2,"rowsWritten":50688,
 *  "errors":["cmpnsa18a00m0gapb5fh8nox6: Check the Sheet tab name and range …",
 *            "cmt765z2d6lyhg0lf42svzik9: Check the Sheet tab name and range …"],
 *  "ok":false,"failedCount":2}
 * ```
 *
 * The route did its job: it answered `ok: false` and 207. The step above it in
 * the same file goes to great length to catch exactly this, and says why in a
 * comment — *"a status-only check is exactly how a run went green while 8 of 35
 * mailboxes were failing"*. The do-not-contact step, added afterwards, then
 * reproduced that defect line for line: it checks only the status, and **207 is
 * a 2xx**. So two do-not-contact sheets failed every fifteen minutes and no
 * alert has ever been sent about it.
 *
 * For a blocklist that is not a reporting nicety. A do-not-contact list that
 * silently stopped updating is how someone who asked never to be contacted gets
 * contacted, which is the single failure this product exists to prevent.
 *
 * These tests lock the fix at both ends: the step must ASSERT THE BODY and
 * record the failure where the alerting can see it, and the reasons it records
 * must name the CLIENT — `cmpnsa18a00m0gapb5fh8nox6` sends Greg hunting through
 * 34 sources; "Train Hugger — Whole domains" is a job.
 */
describe("a failing do-not-contact sheet reaches Greg", () => {
  it("the cron asserts the response BODY, because 207 passes a status check", () => {
    const step = repliesWorkflow.slice(
      repliesWorkflow.indexOf("Sync do-not-contact sheets"),
    );
    expect(step).toContain(".ok");
    expect(step).toMatch(/failedCount/);
  });

  it("records the failure where the PARTIAL alert reads it", () => {
    const step = repliesWorkflow.slice(
      repliesWorkflow.indexOf("Sync do-not-contact sheets"),
      repliesWorkflow.indexOf("Fail run — PARTIAL"),
    );
    // /tmp/run-problems.txt is what the final step turns into `::error
    // title=PARTIAL::` annotations, which is what the alert emails.
    expect(step).toContain("/tmp/run-problems.txt");
  });

  it("carries the per-sheet reasons, not just a count", () => {
    const step = repliesWorkflow.slice(
      repliesWorkflow.indexOf("Sync do-not-contact sheets"),
      repliesWorkflow.indexOf("Fail run — PARTIAL"),
    );
    expect(step).toContain(".errors");
  });

  it("names the client and the list, never a bare source id", () => {
    // The cuid-only line is the thing being removed; the query must reach for
    // the client's name and the list kind so the reason can say them.
    expect(syncAll).toContain("client:");
    expect(syncAll).toContain("name: true");
    expect(syncAll).toContain("kind: true");
    expect(syncAll).not.toMatch(/errors\.push\(\s*`\$\{source\.id\}/);
  });
});
