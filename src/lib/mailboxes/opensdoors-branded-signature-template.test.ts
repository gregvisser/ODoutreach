import { describe, expect, it } from "vitest";

import {
  buildOpensDoorsBrandedSignatureHtml,
  buildOpensDoorsBrandedSignaturePlain,
  humanizeEmailLocalPart,
} from "./opensdoors-branded-signature-template";

function countOccurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

/**
 * Regression for the support ticket "it has put daniel@idverde twice": when a
 * mailbox has no real name the caller falls back to the email as the display
 * name. The raw address must never be printed as a name line as well as the
 * mailto link. Since the "no sender name" fix we now DERIVE a human name from
 * the email local-part instead of leaving the signature nameless — but the raw
 * address is still never duplicated.
 */
describe("branded signature — email is never duplicated", () => {
  const email = "daniel.harper@idverde.co.uk";

  it("HTML: derives a name from the email, never prints the raw address as a name", () => {
    const html = buildOpensDoorsBrandedSignatureHtml({
      displayName: email,
      email,
      website: "https://idverde.co.uk",
    });
    // Once inside mailto:, once as the visible link text — and nowhere else.
    expect(countOccurrences(html, email)).toBe(2);
    expect(countOccurrences(html, `mailto:${email}`)).toBe(1);
    // A readable name is derived from the local-part instead of a bare address.
    expect(html).toContain("Daniel Harper");
  });

  it("HTML: matches case-insensitively / ignores surrounding whitespace", () => {
    const html = buildOpensDoorsBrandedSignatureHtml({
      displayName: `  ${email.toUpperCase()}  `,
      email,
    });
    expect(countOccurrences(html, email)).toBe(2);
  });

  it("plain text: the email address appears exactly once", () => {
    const plain = buildOpensDoorsBrandedSignaturePlain({
      displayName: email,
      email,
    });
    expect(countOccurrences(plain, email)).toBe(1);
  });

  it("shows an explicit real name on its own line, plus the email link", () => {
    const html = buildOpensDoorsBrandedSignatureHtml({
      displayName: "Daniel Harper",
      email,
    });
    expect(html).toContain("Daniel Harper");
    expect(countOccurrences(html, email)).toBe(2); // mailto + link text only

    const plain = buildOpensDoorsBrandedSignaturePlain({
      displayName: "Daniel Harper",
      email,
    });
    expect(plain).toContain("Daniel Harper");
    expect(countOccurrences(plain, email)).toBe(1);
  });
});

describe("humanizeEmailLocalPart", () => {
  it("title-cases a single-word local part", () => {
    expect(humanizeEmailLocalPart("charlie@chevronsecurity.co.uk")).toBe("Charlie");
  });
  it("splits dotted / underscored / hyphenated names", () => {
    expect(humanizeEmailLocalPart("charlie.smith@x.com")).toBe("Charlie Smith");
    expect(humanizeEmailLocalPart("charlie_smith@x.com")).toBe("Charlie Smith");
    expect(humanizeEmailLocalPart("charlie-smith@x.com")).toBe("Charlie Smith");
  });
  it("drops +tags and digits", () => {
    expect(humanizeEmailLocalPart("charlie+outreach@x.com")).toBe("Charlie");
    expect(humanizeEmailLocalPart("charlie1@x.com")).toBe("Charlie");
  });
  it("returns null when nothing usable remains", () => {
    expect(humanizeEmailLocalPart("@x.com")).toBeNull();
    expect(humanizeEmailLocalPart("")).toBeNull();
    expect(humanizeEmailLocalPart("123@x.com")).toBeNull();
  });
});

describe("branded signature always carries a sender name (no-name fix)", () => {
  const base = {
    email: "charlie@chevronsecurity.co.uk",
    website: "https://chevronsecurity.co.uk/",
    logoUrl: "https://cdn.example.com/chevron.png",
    logoAlt: "Chevron Security",
    legalDisclaimer: "Confidential.",
  };

  it("derives a name from the email when no display name is given", () => {
    const html = buildOpensDoorsBrandedSignatureHtml({ ...base, displayName: "" });
    expect(html).toContain("Charlie");
    const plain = buildOpensDoorsBrandedSignaturePlain({ ...base, displayName: "" });
    expect(plain.startsWith("Charlie")).toBe(true);
  });

  it("uses an explicit real name as-is", () => {
    const plain = buildOpensDoorsBrandedSignaturePlain({
      ...base,
      displayName: "Charlie Smith",
    });
    expect(plain.startsWith("Charlie Smith")).toBe(true);
  });
});
