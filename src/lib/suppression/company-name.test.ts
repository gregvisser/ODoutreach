import { describe, expect, it } from "vitest";
import { canonicalCompanyName, matchCompanyName } from "./company-name";

const entries = (...names: string[]) => names.map((originalName, index) => ({
  id: `entry-${index}`, originalName, canonicalName: canonicalCompanyName(originalName),
}));

describe("company-name decisions", () => {
  it.each([" ACME LIMITED ", "Acme Ltd.", "ＡＣＭＥ L.t.d.", "Acme LLC", "Acme Corporation"])("blocks legal-form variant %s", name => {
    expect(matchCompanyName(name, entries("Acme")).outcome).toBe("BLOCK");
  });
  it("treats ampersand and and alike", () => {
    expect(matchCompanyName("Birch & Oak Ltd", entries("Birch and Oak")).outcome).toBe("BLOCK");
  });
  it.each(["Acme Group", "Acme (UK) Ltd", "Acme trading as Newbrand", "Acme Council"])("holds possible relationship %s without merging it", name => {
    expect(matchCompanyName(name, entries("Acme")).outcome).toBe("REVIEW");
    expect(canonicalCompanyName(name)).not.toBe("acme");
  });
  it("retains meaningful public-body words and locations", () => {
    expect(canonicalCompanyName("North Borough Council")).toBe("north borough council");
    expect(matchCompanyName("South Borough Council", entries("North Borough Council")).outcome).toBe("REVIEW");
    expect(matchCompanyName("Coastal City Authority", entries("North Borough Council")).outcome).toBe("CLEAR");
  });
  it.each(["Silverleaf", "Silver Leaf", "Silvrleaf", "Sivlerleef"])("holds close spelling %s", name => {
    expect(matchCompanyName(name, entries("Silverleef")).outcome).toBe("REVIEW");
  });
  it("does not fuzzy-match unrelated short acronyms", () => {
    expect(matchCompanyName("BP", entries("BT")).outcome).toBe("CLEAR");
  });
  it("requires review of missing employer when there is a list", () => {
    expect(matchCompanyName(null, entries("Acme"))).toMatchObject({ outcome: "REVIEW", reason: "missing_company" });
    expect(matchCompanyName(null, [])).toMatchObject({ outcome: "CLEAR", reason: "no_list" });
  });
  it("does not turn a legal form alone into a matching company", () => {
    expect(canonicalCompanyName("Ltd.")).toBe("");
  });
  it("does not infer unrelated trading names", () => {
    expect(matchCompanyName("Newbrand", entries("Acme"))).toMatchObject({ outcome: "CLEAR", reason: "no_match" });
  });
  it("reports every review candidate and gives exact entries precedence", () => {
    expect(matchCompanyName("Acme", entries("Acme Group", "Acme UK")).matchedEntryIds).toEqual(["entry-0", "entry-1"]);
    expect(matchCompanyName("Acme", entries("Acme Group", "Acme Ltd"))).toMatchObject({ outcome: "BLOCK", matchedEntryIds: ["entry-1"] });
  });
  it("keeps diacritics rather than silently changing a legal name", () => {
    expect(canonicalCompanyName("Café Élan Limited")).toBe("café élan");
  });
});
