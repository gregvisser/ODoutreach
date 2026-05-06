import { describe, expect, it } from "vitest";

import { ensureUnsubscribeLinkInPlainTextBody } from "./ensure-unsubscribe-in-body";

describe("ensureUnsubscribeLinkInPlainTextBody", () => {
  it("appends a footer when the URL is missing", () => {
    const u = "https://app.example.com/unsubscribe/abc";
    const out = ensureUnsubscribeLinkInPlainTextBody("Hello", u);
    expect(out).toContain("Hello");
    expect(out).toContain(`Unsubscribe: ${u}`);
  });

  it("does not duplicate when the body already includes the URL", () => {
    const u = "https://app.example.com/unsubscribe/abc";
    const body = `Hi\n\n${u}`;
    const out = ensureUnsubscribeLinkInPlainTextBody(body, u);
    expect(out.match(/https:\/\/app\.example\.com\/unsubscribe\/abc/g)).toHaveLength(1);
    expect(out).toBe(`Hi\n\n---\nUnsubscribe: ${u}\n`);
  });

  it("keeps the unsubscribe line after a multi-line signature block", () => {
    const u = "https://app.example.com/unsubscribe/abc";
    const body = "Hi Ann,\n\n--\nGreg\nAcme\n\nWe help with X.";
    const out = ensureUnsubscribeLinkInPlainTextBody(body, u);
    const sigEnd = out.indexOf("We help with X.");
    const unsub = out.indexOf("Unsubscribe:");
    expect(sigEnd).toBeGreaterThan(-1);
    expect(unsub).toBeGreaterThan(sigEnd);
  });
});
