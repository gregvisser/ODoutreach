import { describe, expect, it } from "vitest";

import {
  buildWeakMatchKey,
  normalizeLinkedInUrl,
  normalizePhoneDigits,
} from "@/lib/universe/normalize-identifiers";

describe("universe identifier normalization", () => {
  it("normalizes linkedin URLs consistently", () => {
    expect(normalizeLinkedInUrl("https://www.linkedin.com/in/foo-bar/")).toBe(
      "www.linkedin.com/in/foo-bar",
    );
    expect(normalizeLinkedInUrl("")).toBeNull();
  });

  it("normalizes phone digits", () => {
    expect(normalizePhoneDigits("+44 7700 900123")).toBe("447700900123");
    expect(normalizePhoneDigits("123")).toBeNull();
  });

  it("builds stable weak keys", () => {
    const a = buildWeakMatchKey({ company: "Acme", fullName: "Jane Doe", title: "CFO" });
    const b = buildWeakMatchKey({ company: "Acme", fullName: "Jane Doe", title: "CFO" });
    expect(a).toBe(b);
    expect(buildWeakMatchKey({ company: "", fullName: "X", title: "" })).toBeNull();
  });
});
