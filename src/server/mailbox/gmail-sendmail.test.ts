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

  it("omits extra headers when none are supplied (PR N regression guard)", () => {
    const rfc = buildRfc5322PlainTextEmail({
      from: "a@x.com",
      to: "b@y.com",
      subject: "Hi",
      bodyText: "Body",
    });
    expect(rfc).not.toContain("List-Unsubscribe");
    expect(rfc).not.toContain("List-Unsubscribe-Post");
  });

  it("injects List-Unsubscribe + List-Unsubscribe-Post headers before standard headers", () => {
    const rfc = buildRfc5322PlainTextEmail({
      from: "a@x.com",
      to: "b@y.com",
      subject: "Hi",
      bodyText: "Body",
      extraHeaders: [
        { name: "List-Unsubscribe", value: "<https://example.com/u/abc>" },
        { name: "List-Unsubscribe-Post", value: "List-Unsubscribe=One-Click" },
      ],
    });
    expect(rfc).toContain("List-Unsubscribe: <https://example.com/u/abc>\r\n");
    expect(rfc).toContain(
      "List-Unsubscribe-Post: List-Unsubscribe=One-Click\r\n",
    );
    const listUnsubIdx = rfc.indexOf("List-Unsubscribe:");
    const fromIdx = rfc.indexOf("From:");
    expect(listUnsubIdx).toBeGreaterThanOrEqual(0);
    expect(listUnsubIdx).toBeLessThan(fromIdx);
  });

  it("silently drops header entries containing CR or LF (injection guard)", () => {
    const rfc = buildRfc5322PlainTextEmail({
      from: "a@x.com",
      to: "b@y.com",
      subject: "Hi",
      bodyText: "Body",
      extraHeaders: [
        { name: "X-Safe", value: "ok" },
        { name: "X-Evil", value: "bad\r\nX-Injected: yes" },
        { name: "Bad:Name", value: "whatever" },
      ],
    });
    expect(rfc).toContain("X-Safe: ok\r\n");
    expect(rfc).not.toContain("X-Injected");
    expect(rfc).not.toContain("Bad:Name");
  });

  it("drops entries with empty name or empty value", () => {
    const rfc = buildRfc5322PlainTextEmail({
      from: "a@x.com",
      to: "b@y.com",
      subject: "Hi",
      bodyText: "Body",
      extraHeaders: [
        { name: "", value: "ok" },
        { name: "X-Good", value: "" },
        { name: "X-Really-Good", value: "yes" },
      ],
    });
    expect(rfc).toContain("X-Really-Good: yes\r\n");
    expect(rfc).not.toMatch(/\r\n: ok\r\n/);
    expect(rfc).not.toContain("X-Good:");
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
