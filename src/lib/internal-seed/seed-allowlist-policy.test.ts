import { describe, expect, it } from "vitest";

import {
  buildSeedEmailSet,
  INTERNAL_SEED_ALLOWED_DOMAIN,
  INTERNAL_SEED_DEFAULT_ADDRESSES,
  isEmailInSeedSet,
  isSeedEmailDomainAllowed,
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

  it("every default seed address is on the allowed domain", () => {
    for (const { email } of INTERNAL_SEED_DEFAULT_ADDRESSES) {
      expect(isSeedEmailDomainAllowed(email)).toBe(true);
    }
    expect(INTERNAL_SEED_ALLOWED_DOMAIN).toBe("opensdoors.co.uk");
  });

  it("isSeedEmailDomainAllowed rejects any other domain", () => {
    expect(isSeedEmailDomainAllowed("prospect@acme.com")).toBe(false);
    expect(isSeedEmailDomainAllowed("nobody@bidlow.co.uk")).toBe(false);
  });

  it("isSeedEmailDomainAllowed rejects a lookalike/suffix domain", () => {
    expect(
      isSeedEmailDomainAllowed("attacker@opensdoors.co.uk.evil.com"),
    ).toBe(false);
    expect(isSeedEmailDomainAllowed("attacker@notopensdoors.co.uk")).toBe(
      false,
    );
  });

  it("isSeedEmailDomainAllowed is case-insensitive and rejects blank/invalid", () => {
    expect(isSeedEmailDomainAllowed("Adam@OpensDoors.co.uk")).toBe(true);
    expect(isSeedEmailDomainAllowed("")).toBe(false);
    expect(isSeedEmailDomainAllowed(null)).toBe(false);
    expect(isSeedEmailDomainAllowed(undefined)).toBe(false);
  });
});
