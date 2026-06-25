import { describe, expect, it } from "vitest";

import {
  buildSeedEmailSet,
  INTERNAL_SEED_DEFAULT_ADDRESSES,
  isEmailInSeedSet,
  normalizeSeedEmail,
} from "./seed-allowlist-policy";

describe("seed-allowlist-policy", () => {
  it("ships the 6 expected default internal seed addresses", () => {
    expect(INTERNAL_SEED_DEFAULT_ADDRESSES.map((a) => a.email)).toEqual([
      "adam@opensdoors.co.uk",
      "elys@opensdoors.co.uk",
      "lucysg@opensdoors.co.uk",
      "james@opensdoors.co.uk",
      "joe@opensdoors.co.uk",
      "samantha@opensdoors.co.uk",
    ]);
  });

  it("normalizeSeedEmail lowercases + trims and tolerates junk", () => {
    expect(normalizeSeedEmail("  Adam@OpensDoors.co.uk ")).toBe(
      "adam@opensdoors.co.uk",
    );
    expect(normalizeSeedEmail(null)).toBe("");
    expect(normalizeSeedEmail(undefined)).toBe("");
  });

  it("isEmailInSeedSet matches case-insensitively against a normalized set", () => {
    const set = buildSeedEmailSet(
      INTERNAL_SEED_DEFAULT_ADDRESSES.map((a) => a.email),
    );
    expect(isEmailInSeedSet("ADAM@opensdoors.co.uk", set)).toBe(true);
    expect(isEmailInSeedSet("  james@opensdoors.co.uk ", set)).toBe(true);
    expect(isEmailInSeedSet("prospect@acme.com", set)).toBe(false);
    expect(isEmailInSeedSet("", set)).toBe(false);
    expect(isEmailInSeedSet(null, set)).toBe(false);
  });

  it("buildSeedEmailSet drops blank/invalid entries", () => {
    const set = buildSeedEmailSet(["  ", "a@b.com", ""]);
    expect(set.size).toBe(1);
    expect(set.has("a@b.com")).toBe(true);
  });
});
