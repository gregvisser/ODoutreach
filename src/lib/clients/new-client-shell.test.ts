import { describe, expect, it } from "vitest";

import {
  CLIENT_SLUG_MAX,
  generateSlugFromName,
  validateNewClientShellInput,
} from "./new-client-shell";

describe("generateSlugFromName", () => {
  it("lowercases and hyphenates", () => {
    expect(generateSlugFromName("Acme Corp")).toBe("acme-corp");
  });

  it("collapses multiple separators", () => {
    expect(generateSlugFromName("Acme  &  Co, Ltd.")).toBe("acme-co-ltd");
  });

  it("strips diacritics", () => {
    expect(generateSlugFromName("Café München")).toBe("cafe-munchen");
  });

  it("trims leading/trailing separators", () => {
    expect(generateSlugFromName("  — Acme —  ")).toBe("acme");
  });

  it("returns empty string when nothing survives", () => {
    expect(generateSlugFromName("    ")).toBe("");
    expect(generateSlugFromName("###")).toBe("");
  });

  it("caps slug length to CLIENT_SLUG_MAX", () => {
    const longName = "a".repeat(200);
    const slug = generateSlugFromName(longName);
    expect(slug.length).toBeLessThanOrEqual(CLIENT_SLUG_MAX);
  });
});

describe("validateNewClientShellInput", () => {
  it("accepts a minimal valid payload", () => {
    const res = validateNewClientShellInput({
      name: " Acme Corp ",
      slug: "acme-corp",
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.normalized.name).toBe("Acme Corp");
      expect(res.normalized.slug).toBe("acme-corp");
      expect(res.normalized.industry).toBeNull();
      expect(res.normalized.website).toBeNull();
      expect(res.normalized.notes).toBeNull();
    }
  });

  it("rejects empty name", () => {
    const res = validateNewClientShellInput({ name: "   ", slug: "acme" });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("NAME_MISSING");
  });

  it("rejects too-short name", () => {
    const res = validateNewClientShellInput({ name: "A", slug: "acme" });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("NAME_TOO_SHORT");
  });

  it("rejects empty slug", () => {
    const res = validateNewClientShellInput({ name: "Acme", slug: "" });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("SLUG_MISSING");
  });

  it("rejects slug with invalid characters", () => {
    const res = validateNewClientShellInput({ name: "Acme", slug: "Acme Corp" });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("SLUG_INVALID");
  });

  it("rejects slug with leading hyphen", () => {
    const res = validateNewClientShellInput({ name: "Acme", slug: "-acme" });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("SLUG_INVALID");
  });

  it("accepts optional website when valid https url", () => {
    const res = validateNewClientShellInput({
      name: "Acme",
      slug: "acme",
      website: "https://example.com",
    });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.normalized.website).toBe("https://example.com");
  });

  it("rejects website without scheme", () => {
    const res = validateNewClientShellInput({
      name: "Acme",
      slug: "acme",
      website: "example.com",
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("WEBSITE_INVALID");
  });

  it("returns null for empty optional fields", () => {
    const res = validateNewClientShellInput({
      name: "Acme",
      slug: "acme",
      industry: "   ",
      website: "",
      notes: "",
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.normalized.industry).toBeNull();
      expect(res.normalized.website).toBeNull();
      expect(res.normalized.notes).toBeNull();
    }
  });

  it("rejects oversized notes", () => {
    const res = validateNewClientShellInput({
      name: "Acme",
      slug: "acme",
      notes: "x".repeat(3000),
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("NOTES_TOO_LONG");
  });
});
