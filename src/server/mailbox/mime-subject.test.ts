import { describe, expect, it } from "vitest";
import { encodeMimeSubject } from "./mime-subject";
import { buildRfc5322PlainTextEmail } from "./gmail-sendmail";
import { buildReplyRfc5322PlainTextEmail } from "./gmail-reply";

const unicodeSubjects = [
  "ODoutreach authorised delivery test — 8 September 2026 — GTUK-0908-A",
  "Re: Café £30 – São Paulo",
  "你好 👋 — ".repeat(40),
  "a".repeat(1200),
  " A  subject with spaces at the ends ".repeat(4),
  "=?UTF-8?B?SGVsbG8=?=", // Literal user text must not become an encoded header.
];

describe("MIME subject interoperability", () => {
  it.each(["", "Hello", "Re: Hello", "a".repeat(67)])("keeps short ASCII text unchanged: %s", subject => {
    expect(encodeMimeSubject(subject)).toBe(subject);
  });
  it.each(unicodeSubjects)("emits bounded ASCII words preserving the complete subject: %s", subject => {
    const value = encodeMimeSubject(subject);
    const words = value.split("\r\n ");
    expect(words.every(word => /^=\?UTF-8\?B\?[A-Za-z0-9+/]+=*\?=$/.test(word))).toBe(true);
    expect((`Subject: ${value}`).split("\r\n").every(line => line.length <= 76)).toBe(true);
    const decoded = words.map(word => new TextDecoder("utf-8", { fatal: true }).decode(Buffer.from(word.slice(10, -2), "base64"))).join("");
    expect(decoded).toBe(subject);
  });
  it.each(["Bad\r\nBcc: someone@example.test", "Bad\nSubject: injected", "Bad\rvalue", "Bad\0value"])("rejects unsafe subject controls", subject => {
    expect(() => encodeMimeSubject(subject)).toThrow("single line");
  });
  it.each([false, true])("encodes new-mail subjects without changing bodies or unsubscribe headers (HTML=%s)", html => {
    const mime = buildRfc5322PlainTextEmail({ from: "a@example.test", to: "b@example.test", subject: "Café — £30", bodyText: "Original https://example.test/ — £30", ...(html ? { bodyHtml: "<p>Café</p>" } : {}), extraHeaders: [{ name: "List-Unsubscribe", value: "<https://example.test/unsubscribe>" }] });
    expect(mime).toContain("Subject: =?UTF-8?B?Q2Fmw6kg4oCUIMKjMzA=?=");
    expect(mime).toContain("List-Unsubscribe: <https://example.test/unsubscribe>");
    expect(mime).toContain("Original https://example.test/ — £30");
  });
  it("encodes reply subjects and retains reply references", () => {
    const mime = buildReplyRfc5322PlainTextEmail({ from: "a@example.test", to: "b@example.test", subject: "Re: Café", bodyText: "Thanks — received", inReplyToMessageId: "original@example.test", referencesMessageIds: ["previous@example.test", "original@example.test"] });
    expect(mime).toContain("Subject: =?UTF-8?B?UmU6IENhZsOp?=");
    expect(mime).toContain("In-Reply-To: <original@example.test>");
    expect(mime).toContain("References: <previous@example.test> <original@example.test>");
    expect(mime.endsWith("Thanks — received")).toBe(true);
  });
});
