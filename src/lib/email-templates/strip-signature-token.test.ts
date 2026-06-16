import { describe, expect, it } from "vitest";

import {
  contentHasSignatureToken,
  stripSignatureToken,
} from "./strip-signature-token";

describe("contentHasSignatureToken", () => {
  it("detects the token (any casing / spacing)", () => {
    expect(contentHasSignatureToken("a {{email_signature}} b")).toBe(true);
    expect(contentHasSignatureToken("{{ Email_Signature }}")).toBe(true);
  });
  it("is false when absent", () => {
    expect(contentHasSignatureToken("Hi {{first_name}}")).toBe(false);
  });
});

describe("stripSignatureToken", () => {
  it("removes a signature line from the default template shape", () => {
    const before =
      "Hi {{first_name}},\n\nOpener about {{company_name}}.\n\n{{sender_name}}\n{{email_signature}}\n{{unsubscribe_link}}";
    expect(stripSignatureToken(before)).toBe(
      "Hi {{first_name}},\n\nOpener about {{company_name}}.\n\n{{sender_name}}\n{{unsubscribe_link}}",
    );
  });

  it("removes an inline token and tidies trailing whitespace", () => {
    expect(stripSignatureToken("Thanks {{email_signature}}")).toBe("Thanks");
  });

  it("leaves content without the token unchanged", () => {
    const s = "Hi {{first_name}},\n\nThanks,\n{{sender_name}}";
    expect(stripSignatureToken(s)).toBe(s);
  });

  it("is idempotent", () => {
    const before = "Body\n\n{{email_signature}}\n\nMore";
    const once = stripSignatureToken(before);
    expect(stripSignatureToken(once)).toBe(once);
    expect(contentHasSignatureToken(once)).toBe(false);
  });
});
