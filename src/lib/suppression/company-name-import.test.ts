import { describe, expect, it } from "vitest";
import { previewCompanyNameImport } from "./company-name-import";

describe("company-name import preview", () => {
  it("retains the first row and original spelling in headerless CSV", () => {
    expect(previewCompanyNameImport('\uFEFF"Acme, Inc."\r\nBirch Limited\r\n', "csv")).toEqual({
      entries: [{ originalName: "Acme, Inc.", canonicalName: "acme" }, { originalName: "Birch Limited", canonicalName: "birch" }], duplicates: 0, errors: [],
    });
  });
  it("accepts comma-containing names as full lines in pasted text", () => {
    expect(previewCompanyNameImport("Acme, Inc.\n\nBirch & Oak", "text").entries).toHaveLength(2);
  });
  it("reports canonical duplicates and preserves first original spelling", () => {
    expect(previewCompanyNameImport("Acme Limited\nACME LTD\nAcme Group", "text")).toMatchObject({ duplicates: 1, errors: [], entries: [{ originalName: "Acme Limited" }, { originalName: "Acme Group" }] });
  });
  it.each([['Acme,Inc', 'csv'], ['Acme\tOther', 'text'], ['"Acme', 'csv'], ['Ltd.\nBirch', 'text'], ['"Acme\nOther"', 'csv']] as const)("exposes invalid rows rather than silently treating the list as accepted", (input, format) => {
    expect(previewCompanyNameImport(input, format).errors.length).toBeGreaterThan(0);
  });
  it("reports empty and oversized inputs", () => {
    expect(previewCompanyNameImport("\n\n", "text").errors).toHaveLength(1);
    expect(previewCompanyNameImport("a".repeat(301), "text").errors).toHaveLength(1);
    expect(previewCompanyNameImport("a".repeat(1_000_001), "text").entries).toEqual([]);
    expect(previewCompanyNameImport(Array.from({ length: 5_001 }, (_, i) => `Company ${i}`).join("\n"), "text").errors).toHaveLength(1);
  });
});
