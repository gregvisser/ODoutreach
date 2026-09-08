import { describe, expect, it } from "vitest";
import { previewCompanyNameSheet } from "./company-name-sheet";

describe("headerless company-name Google Sheet values", () => {
  it("retains the first name after blank A1, commas and distinct meaningful names", () => {
    const result = previewCompanyNameSheet([[], ["Acme, Services Ltd"], ["Acme Group"], ["  ACME GROUP  "], []]);
    expect(result.errors).toEqual([]);
    expect(result.entries.map(entry => entry.originalName)).toEqual(["Acme, Services Ltd", "Acme Group"]);
    expect(result.duplicates).toBe(1);
  });
  it("reports the physical row of an invalid multiline cell without splitting it into companies", () => {
    const result = previewCompanyNameSheet([[], ["Valid Company"], ["Wrong\nSecond Name"]]);
    expect(result.errors).toEqual([expect.objectContaining({ row: 3 })]);
  });
  it.each([null, [["Name", "Other"]], [[42]], [[{}]], []])("refuses invalid or empty values: %j", values => {
    expect(previewCompanyNameSheet(values).errors.length).toBeGreaterThan(0);
  });
  it("refuses a truncated/oversized sheet and more than 5000 nonempty names", () => {
    expect(previewCompanyNameSheet(Array.from({ length: 50_001 }, () => [])).errors.length).toBeGreaterThan(0);
    expect(previewCompanyNameSheet(Array.from({ length: 5_001 }, (_, i) => [`Company ${i}`])).errors.length).toBeGreaterThan(0);
  });
});
