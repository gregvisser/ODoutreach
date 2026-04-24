import { describe, expect, it } from "vitest";

import { ADDRESS_SEARCH_MAX_LEN, validateAddressSearchInput } from "./address-search-input";

describe("validateAddressSearchInput", () => {
  it("rejects empty and whitespace", () => {
    expect(validateAddressSearchInput("   ").ok).toBe(false);
  });

  it("rejects short queries", () => {
    expect(validateAddressSearchInput("ab").ok).toBe(false);
  });

  it("accepts minimum length", () => {
    const v = validateAddressSearchInput("abc");
    expect(v).toEqual({ ok: true, query: "abc" });
  });

  it("normalizes internal whitespace", () => {
    const v = validateAddressSearchInput("  10  Downing   st  ");
    expect(v).toEqual({ ok: true, query: "10 Downing st" });
  });

  it("rejects overly long input", () => {
    const v = validateAddressSearchInput("x".repeat(ADDRESS_SEARCH_MAX_LEN + 1));
    expect(v.ok).toBe(false);
  });
});
