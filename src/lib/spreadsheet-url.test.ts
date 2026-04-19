import { describe, expect, it } from "vitest";

import { extractGoogleSpreadsheetId } from "./spreadsheet-url";

describe("extractGoogleSpreadsheetId", () => {
  it("accepts a raw spreadsheet id", () => {
    const id = "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms";
    expect(extractGoogleSpreadsheetId(id)).toBe(id);
  });

  it("parses a standard docs.google.com URL", () => {
    expect(
      extractGoogleSpreadsheetId(
        "https://docs.google.com/spreadsheets/d/1abcDEFghi_jklMNOpqrSTUv1234567890abcd/edit#gid=0",
      ),
    ).toBe("1abcDEFghi_jklMNOpqrSTUv1234567890abcd");
  });

  it("returns null for invalid input", () => {
    expect(extractGoogleSpreadsheetId("")).toBeNull();
    expect(extractGoogleSpreadsheetId("not-a-url")).toBeNull();
  });
});
