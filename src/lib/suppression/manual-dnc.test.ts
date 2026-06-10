import { describe, expect, it } from "vitest";

import { normalizeManualDncEntry } from "./manual-dnc";

describe("normalizeManualDncEntry", () => {
  it("normalizes and validates emails", () => {
    expect(normalizeManualDncEntry("EMAIL", "  Cerys.Orriss@Aarsleff.CO.UK ")).toEqual({
      ok: true,
      kind: "EMAIL",
      value: "cerys.orriss@aarsleff.co.uk",
    });
  });

  it("rejects invalid emails", () => {
    const r = normalizeManualDncEntry("EMAIL", "not-an-email");
    expect(r.ok).toBe(false);
  });

  it("normalizes bare domains, URLs, and www prefixes", () => {
    expect(normalizeManualDncEntry("DOMAIN", "Aarsleff.co.uk")).toEqual({
      ok: true,
      kind: "DOMAIN",
      value: "aarsleff.co.uk",
    });
    expect(normalizeManualDncEntry("DOMAIN", "https://www.aarsleff.co.uk/contact")).toEqual({
      ok: true,
      kind: "DOMAIN",
      value: "aarsleff.co.uk",
    });
  });

  it("accepts a full email when DOMAIN was chosen and uses its domain part", () => {
    expect(normalizeManualDncEntry("DOMAIN", "cerysorriss@aarsleff.co.uk")).toEqual({
      ok: true,
      kind: "DOMAIN",
      value: "aarsleff.co.uk",
    });
  });

  it("rejects invalid domains and empty input", () => {
    expect(normalizeManualDncEntry("DOMAIN", "not a domain").ok).toBe(false);
    expect(normalizeManualDncEntry("EMAIL", "   ").ok).toBe(false);
  });
});
