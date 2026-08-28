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

describe("resolveDefaultSheetRange", () => {
  it("uses the only tab of a single-tab sheet", () => {
    // Pareto FM's sheet.
    expect(resolveDefaultSheetRange(["Domains"])).toBe("'Domains'!A1:Z50000");
  });

  it("uses the FIRST tab when there are several", () => {
    // Train Hugger's sheet.
    expect(resolveDefaultSheetRange(["Domains", "Company Names"])).toBe(
      "'Domains'!A1:Z50000",
    );
  });

  it("skips a blank title rather than building an empty range", () => {
    expect(resolveDefaultSheetRange(["  ", "Domains"])).toBe(
      "'Domains'!A1:Z50000",
    );
  });

  it("falls back to the historic default when the tabs are unknown", () => {
    // An empty list means the metadata call failed, not that the sheet is
    // empty — behave exactly as the product did before rather than invent.
    expect(resolveDefaultSheetRange([])).toBe(DEFAULT_SHEET_RANGE);
  });
});
