import { describe, expect, it } from "vitest";

import {
  buildRfc5322PlainTextEmail,
  rfc5322ToGmailRawBase64Url,
} from "./gmail-sendmail";

describe("buildRfc5322PlainTextEmail", () => {
  it("uses CRLF line endings between headers and body", () => {
    const rfc = buildRfc5322PlainTextEmail({
      from: "a@x.com",
      to: "b@y.com",
      subject: "Hi",
      bodyText: "Line1\nLine2",
    });
    expect(rfc).toContain("\r\n\r\n");
    expect(rfc.startsWith("From: a@x.com\r\n")).toBe(true);
  });
});

describe("rfc5322ToGmailRawBase64Url", () => {
  it("produces base64url without padding for Gmail raw send", () => {
    const raw = rfc5322ToGmailRawBase64Url("From: a@b.c\r\n\r\nx");
    expect(raw).not.toContain("+");
    expect(raw).not.toContain("/");
    expect(raw.endsWith("=")).toBe(false);
  });
});
