import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Wiring contract for the do-not-contact sheet RANGE field.
 *
 * This is the house substitute for a render test (see
 * `suppression-sync-all.test.ts` for the same pattern): the repo has no DOM
 * test harness, and the defect class this guards against is not "the logic is
 * wrong" but "nothing ever calls it".
 *
 * The defect it exists to prevent, in full, because it had a live cost:
 * `sheetRange` was accepted by the server action's zod schema, trimmed,
 * written to the row, read back by the sync, and backed by a real column — and
 * NO component ever rendered an input for it. So the value was always absent,
 * the range was always null, and every client's sheet was read as
 * `Sheet1!A1:Z50000`. Two clients whose tab is called `Domains` had their
 * whole-domain block lists silently stop updating for days, while the
 * product's own error message told operators to "Update the range if your data
 * is on another tab" against a field that did not exist.
 *
 * Server-side behaviour is covered behaviourally next door
 * (`client-suppression-source-actions.test.ts` for persistence,
 * `suppression-sync.test.ts` for the range actually reaching Google). What
 * cannot be asserted without a DOM is that the card still has a caller, so
 * that is what this file pins.
 */
const card = readFileSync(
  join(
    process.cwd(),
    "src/components/clients/client-suppression-inline-card.tsx",
  ),
  "utf8",
);

describe("do-not-contact sheet range — the card is a caller", () => {
  it("renders a range input for BOTH the email and the domain list", () => {
    expect(card).toContain('id="sup-email-range"');
    expect(card).toContain('id="sup-domain-range"');
  });

  it("binds each range input to state, so what is typed can be read back", () => {
    expect(card).toMatch(/value=\{emailRange\}/);
    expect(card).toMatch(/value=\{domainRange\}/);
    expect(card).toMatch(/setEmailRange\(/);
    expect(card).toMatch(/setDomainRange\(/);
  });

  it("passes sheetRange to the server action — the link that was missing", () => {
    expect(card).toMatch(/upsertSuppressionSpreadsheetAction\(\s*\{[^}]*sheetRange/);
  });

  it("seeds each box from the saved range, so re-saving cannot silently wipe it", () => {
    expect(card).toMatch(/useState\(\s*emailSrc\?\.sheetRange \?\? ""\s*\)/);
    expect(card).toMatch(/useState\(\s*domainSrc\?\.sheetRange \?\? ""\s*\)/);
  });

  it("shows the default range as the placeholder, so the fallback is not a secret", () => {
    expect(card).toContain("Sheet1!A1:Z50000");
  });

  it("lets a connected sheet's range be changed without re-pasting the URL", () => {
    // Save was previously disabled unless the URL box had content, which would
    // have made the new field unreachable for the exact clients that need it:
    // Train Hugger and Pareto FM are already connected — only the tab is wrong.
    // So an empty URL box falls back to the id already on the row.
    expect(card).toMatch(/emailUrl\.trim\(\) \|\| emailSrc\?\.spreadsheetId/);
    expect(card).toMatch(/domainUrl\.trim\(\) \|\| domainSrc\?\.spreadsheetId/);
  });
});
