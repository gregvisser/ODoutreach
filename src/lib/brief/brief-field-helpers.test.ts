import { describe, expect, it } from "vitest";

import {
  isMainContactComplete,
  isStructuredAddressComplete,
  parseStructuredBusinessAddress,
} from "./brief-field-helpers";

describe("parseStructuredBusinessAddress", () => {
  it("parses valid object", () => {
    const a = parseStructuredBusinessAddress({
      line1: "1 Test St",
      country: "UK",
    });
    expect(a?.line1).toBe("1 Test St");
  });
});

describe("isStructuredAddressComplete", () => {
  it("accepts legacy one-line string", () => {
    expect(isStructuredAddressComplete(null, "1 High St")).toBe(true);
  });
  it("accepts structured with formatted summary", () => {
    expect(
      isStructuredAddressComplete(
        { formattedSummary: "1 High St, London" },
        undefined,
      ),
    ).toBe(true);
  });
  it("accepts line1 with city and country", () => {
    expect(
      isStructuredAddressComplete(
        { line1: "1 St", city: "Leeds", country: "UK" },
        undefined,
      ),
    ).toBe(true);
  });
  it("rejects empty", () => {
    expect(isStructuredAddressComplete(null, "  ")).toBe(false);
  });
});

describe("isMainContactComplete", () => {
  it("requires name and email", () => {
    expect(
      isMainContactComplete({ firstName: "A", email: "a@b.co" }),
    ).toBe(true);
  });
  it("rejects missing @", () => {
    expect(isMainContactComplete({ firstName: "A", lastName: "B", email: "bad" })).toBe(
      false,
    );
  });
});
