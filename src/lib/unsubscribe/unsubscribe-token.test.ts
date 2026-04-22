import { describe, expect, it } from "vitest";

import {
  buildUnsubscribeUrl,
  deriveEmailDomain,
  generateRawUnsubscribeToken,
  hashUnsubscribeToken,
  maskEmailForDisplay,
  normaliseUnsubscribeEmail,
  UNSUBSCRIBE_TOKEN_ENCODED_LENGTH,
  UNSUBSCRIBE_TOKEN_SHAPE,
} from "./unsubscribe-token";

describe("generateRawUnsubscribeToken", () => {
  it("produces a base64url string of the expected length", () => {
    const raw = generateRawUnsubscribeToken();
    expect(typeof raw).toBe("string");
    expect(raw.length).toBe(UNSUBSCRIBE_TOKEN_ENCODED_LENGTH);
    expect(raw).toMatch(UNSUBSCRIBE_TOKEN_SHAPE);
    expect(raw).not.toContain("=");
    expect(raw).not.toContain("+");
    expect(raw).not.toContain("/");
  });

  it("returns a different value on each call", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 16; i += 1) {
      seen.add(generateRawUnsubscribeToken());
    }
    expect(seen.size).toBe(16);
  });
});

describe("hashUnsubscribeToken", () => {
  it("is deterministic for the same input", () => {
    const raw = "abc-test-token-value-123456";
    expect(hashUnsubscribeToken(raw)).toBe(hashUnsubscribeToken(raw));
  });

  it("differs for different inputs", () => {
    expect(hashUnsubscribeToken("token-a")).not.toBe(
      hashUnsubscribeToken("token-b"),
    );
  });

  it("returns 64 lowercase hex characters", () => {
    const hash = hashUnsubscribeToken("some-raw-token");
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("does not leak the raw token", () => {
    const raw = "sensitive-raw-token-value";
    const hash = hashUnsubscribeToken(raw);
    expect(hash).not.toContain(raw);
  });

  it("throws on empty input", () => {
    expect(() => hashUnsubscribeToken("")).toThrow();
  });
});

describe("buildUnsubscribeUrl", () => {
  const goodToken = "a".repeat(43);

  it("joins base + token without a double slash", () => {
    expect(
      buildUnsubscribeUrl({ baseUrl: "https://example.com/", rawToken: goodToken }),
    ).toBe(`https://example.com/unsubscribe/${goodToken}`);
    expect(
      buildUnsubscribeUrl({ baseUrl: "https://example.com", rawToken: goodToken }),
    ).toBe(`https://example.com/unsubscribe/${goodToken}`);
  });

  it("rejects an empty base", () => {
    expect(() =>
      buildUnsubscribeUrl({ baseUrl: "   ", rawToken: goodToken }),
    ).toThrow();
  });

  it("rejects a malformed token", () => {
    expect(() =>
      buildUnsubscribeUrl({ baseUrl: "https://example.com", rawToken: "" }),
    ).toThrow();
    expect(() =>
      buildUnsubscribeUrl({
        baseUrl: "https://example.com",
        rawToken: "has spaces",
      }),
    ).toThrow();
  });
});

describe("normaliseUnsubscribeEmail", () => {
  it("lowercases and trims", () => {
    expect(normaliseUnsubscribeEmail("  Alex@Bidlow.Co.UK  ")).toBe(
      "alex@bidlow.co.uk",
    );
  });

  it("handles nullish inputs without throwing", () => {
    expect(normaliseUnsubscribeEmail(null)).toBe("");
    expect(normaliseUnsubscribeEmail(undefined)).toBe("");
  });
});

describe("deriveEmailDomain", () => {
  it("returns the lowercase domain", () => {
    expect(deriveEmailDomain("Alex@Bidlow.Co.UK")).toBe("bidlow.co.uk");
  });

  it("returns null for non-email inputs", () => {
    expect(deriveEmailDomain(null)).toBeNull();
    expect(deriveEmailDomain("")).toBeNull();
    expect(deriveEmailDomain("no-at-sign")).toBeNull();
  });
});

describe("maskEmailForDisplay", () => {
  it("keeps the first char of the local part", () => {
    expect(maskEmailForDisplay("alex@bidlow.co.uk")).toBe("a***@bidlow.co.uk");
  });

  it("masks a single-char local part fully", () => {
    expect(maskEmailForDisplay("a@x.io")).toBe("*@x.io");
  });

  it("returns a generic string when the address is malformed", () => {
    expect(maskEmailForDisplay("not-an-email")).toBe("(unknown recipient)");
    expect(maskEmailForDisplay(null)).toBe("(unknown recipient)");
  });
});
