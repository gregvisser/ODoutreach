import { describe, expect, it } from "vitest";

import {
  buildOpensDoorsBrandedSignatureHtml,
  buildOpensDoorsBrandedSignaturePlain,
} from "./opensdoors-branded-signature-template";

/**
 * Regression for the support ticket "it has put daniel@idverde twice": when a
 * mailbox has no real name the caller falls back to the email as the display
 * name, which used to render it once as a name line and again as the mailto
 * link. The address must now appear exactly once.
 */
describe("branded signature — email is never duplicated", () => {
  const email = "daniel.harper@idverde.co.uk";

  function countOccurrences(haystack: string, needle: string): number {
    return haystack.split(needle).length - 1;
  }

  it("HTML: omits the name line when the display name IS the email", () => {
    const html = buildOpensDoorsBrandedSignatureHtml({
      displayName: email,
      email,
      website: "https://idverde.co.uk",
    });
    // Once inside mailto:, once as the visible link text — and nowhere else.
    expect(countOccurrences(html, email)).toBe(2);
    expect(countOccurrences(html, `mailto:${email}`)).toBe(1);
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

  it("still shows a real name on its own line, plus the email link", () => {
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
