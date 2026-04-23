import { describe, expect, it } from "vitest";

import {
  CLIENT_LOGO_ALT_MAX,
  CLIENT_LOGO_URL_MAX,
  deriveClientMonogram,
  validateClientBrandInput,
} from "./client-brand";

describe("validateClientBrandInput", () => {
  it("accepts a fully blank payload as 'no branding'", () => {
    const result = validateClientBrandInput({ logoUrl: "", logoAltText: "" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.normalized.logoUrl).toBeNull();
      expect(result.normalized.logoAltText).toBeNull();
    }
  });

  it("accepts an https URL with alt text", () => {
    const result = validateClientBrandInput({
      logoUrl: "https://example.com/logo.png",
      logoAltText: "Acme Corp logo",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.normalized.logoUrl).toBe("https://example.com/logo.png");
      expect(result.normalized.logoAltText).toBe("Acme Corp logo");
    }
  });

  it("accepts an http URL (local dev / internal hosts)", () => {
    const result = validateClientBrandInput({
      logoUrl: "http://localhost:3000/logo.svg",
      logoAltText: "",
    });
    expect(result.ok).toBe(true);
  });

  it("rejects a non-http(s) URL", () => {
    const result = validateClientBrandInput({
      logoUrl: "javascript:alert(1)",
      logoAltText: "",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("LOGO_URL_INVALID");
  });

  it("rejects a relative path", () => {
    const result = validateClientBrandInput({
      logoUrl: "/images/acme.png",
      logoAltText: "",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("LOGO_URL_INVALID");
  });

  it("rejects a URL over the maximum length", () => {
    const result = validateClientBrandInput({
      logoUrl: `https://example.com/${"x".repeat(CLIENT_LOGO_URL_MAX)}`,
      logoAltText: "",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("LOGO_URL_TOO_LONG");
  });

  it("rejects alt text over the maximum length", () => {
    const result = validateClientBrandInput({
      logoUrl: "https://example.com/logo.png",
      logoAltText: "a".repeat(CLIENT_LOGO_ALT_MAX + 1),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("LOGO_ALT_TOO_LONG");
  });

  it("rejects alt text without a logo URL", () => {
    const result = validateClientBrandInput({
      logoUrl: "",
      logoAltText: "Acme Corp logo",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("LOGO_ALT_WITHOUT_URL");
  });

  it("trims whitespace before validating", () => {
    const result = validateClientBrandInput({
      logoUrl: "   https://example.com/logo.png   ",
      logoAltText: "   Acme logo   ",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.normalized.logoUrl).toBe("https://example.com/logo.png");
      expect(result.normalized.logoAltText).toBe("Acme logo");
    }
  });
});

describe("deriveClientMonogram", () => {
  it("returns two initials from a two-word name", () => {
    expect(deriveClientMonogram("Acme Corp")).toBe("AC");
    expect(deriveClientMonogram("James Munro")).toBe("JM");
  });

  it("returns first two letters of a single-word name", () => {
    expect(deriveClientMonogram("OpensDoors")).toBe("OP");
    expect(deriveClientMonogram("A")).toBe("A");
  });

  it("uses first letters of the first two words in multi-word names", () => {
    expect(deriveClientMonogram("Open Doors Outreach")).toBe("OD");
  });

  it("strips diacritics", () => {
    expect(deriveClientMonogram("Café Münchén")).toBe("CM");
  });

  it("falls back to '?' for empty / whitespace input", () => {
    expect(deriveClientMonogram("")).toBe("?");
    expect(deriveClientMonogram("   ")).toBe("?");
  });
});
