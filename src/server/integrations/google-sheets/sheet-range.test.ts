import { describe, expect, it } from "vitest";

import {
  DEFAULT_SHEET_RANGE,
  quoteSheetTitle,
  resolveDefaultSheetRange,
  wholeTabRange,
} from "./sheet-range";

describe("quoteSheetTitle", () => {
  it("quotes a plain name", () => {
    expect(quoteSheetTitle("Domains")).toBe("'Domains'");
  });

  it("survives a name with a space", () => {
    expect(quoteSheetTitle("Company Names")).toBe("'Company Names'");
  });

  it("doubles an internal apostrophe, which is how A1 escapes it", () => {
    expect(quoteSheetTitle("Greg's list")).toBe("'Greg''s list'");
  });
});

describe("wholeTabRange", () => {
  it("reads the same span the old hardcoded default did", () => {
    expect(wholeTabRange("Domains")).toBe("'Domains'!A1:Z50000");
  });
});

/**
 * The tab titles below are not invented. They are quoted verbatim from the
 * production replies-cron run of 2026-08-28T01:54:31Z, which reported both
 * sheets failing and named their real tabs in the error it wrote:
 *
 *   Train Hugger — Whole domains: … This Sheet's tabs are: "Domains", "Company Names".
 *   Pareto FM    — Whole domains: … This Sheet's tabs are: "Domains".
 *
 * So "read the first tab" resolves to "Domains" for both — checked against
 * what the live system actually reported, not against an assumption about how
 * a client names things.
 */
describe("resolveDefaultSheetRange", () => {
  it("uses the only tab of a single-tab sheet", () => {
    // Pareto FM's sheet, as production reported it.
    expect(resolveDefaultSheetRange(["Domains"])).toBe("'Domains'!A1:Z50000");
  });

  it("uses the FIRST tab when there are several", () => {
    // Train Hugger's sheet, as production reported it.
    expect(resolveDefaultSheetRange(["Domains", "Company Names"])).toBe(
      "'Domains'!A1:Z50000",
    );
  });

  it("skips a blank title rather than building an empty range", () => {
    expect(resolveDefaultSheetRange(["  ", "Domains"])).toBe(
      "'Domains'!A1:Z50000",
    );
  });

  /**
   * The regression this fix could have caused, and the reason it did not.
   *
   * Resolving the first tab changes the range for EVERY source with no saved
   * range — which on 2026-08-28 was all 34, including 32 that were syncing
   * perfectly. Those 32 work because their sheet does have a "Sheet1". If one
   * of them has "Sheet1" sitting second, "read the first tab" would quietly
   * point a healthy live blocklist at a different tab, and the replace guard
   * only refuses a shrink or a zero — a same-size substitution passes it.
   *
   * So an existing "Sheet1" still wins. That leaves every working list reading
   * exactly the tab it read yesterday, and only sheets that never had a
   * "Sheet1" — the two broken ones — change behaviour at all.
   */
  it("keeps reading Sheet1 when the sheet has one, even if it is not first", () => {
    expect(resolveDefaultSheetRange(["Company Names", "Sheet1"])).toBe(
      "'Sheet1'!A1:Z50000",
    );
  });

  it("matches on Sheet1 exactly, not on a name that merely contains it", () => {
    expect(resolveDefaultSheetRange(["Domains", "Sheet10"])).toBe(
      "'Domains'!A1:Z50000",
    );
  });

  it("falls back to the historic default when the tabs are unknown", () => {
    // An empty list means the metadata call failed, not that the sheet is
    // empty — behave exactly as the product did before rather than invent.
    expect(resolveDefaultSheetRange([])).toBe(DEFAULT_SHEET_RANGE);
  });
});
