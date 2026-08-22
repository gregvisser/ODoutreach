import { describe, expect, it } from "vitest";

import {
  LIST_UNSUBSCRIBE_POST_VALUE,
  buildListUnsubscribeHeaders,
  buildMailtoUnsubscribeHeaders,
  listUnsubscribeHeadersToRfc5322Lines,
} from "./list-unsubscribe-headers";

describe("buildListUnsubscribeHeaders", () => {
  it("accepts a well-formed https URL and angle-brackets the value", () => {
    const h = buildListUnsubscribeHeaders(
      "https://opensdoors.bidlow.co.uk/unsubscribe/raw-token",
    );
    expect(h).not.toBeNull();
    expect(h!.listUnsubscribe).toBe(
      "<https://opensdoors.bidlow.co.uk/unsubscribe/raw-token>",
    );
    expect(h!.listUnsubscribePost).toBe(LIST_UNSUBSCRIBE_POST_VALUE);
    expect(h!.listUnsubscribePost).toBe("List-Unsubscribe=One-Click");
  });

  it("accepts http://localhost URLs for local dev", () => {
    const h = buildListUnsubscribeHeaders(
      "http://localhost:3000/unsubscribe/abc",
    );
    expect(h).not.toBeNull();
    expect(h!.listUnsubscribe).toBe("<http://localhost:3000/unsubscribe/abc>");
  });

  it("trims surrounding whitespace before validation", () => {
    const h = buildListUnsubscribeHeaders(
      "   https://example.com/unsubscribe/x   ",
    );
    expect(h).not.toBeNull();
    expect(h!.listUnsubscribe).toBe("<https://example.com/unsubscribe/x>");
  });

  it("rejects mailto: URLs — this rail is http(s) only", () => {
    const h = buildListUnsubscribeHeaders(
      "mailto:unsubscribe@example.com?subject=unsub",
    );
    expect(h).toBeNull();
  });

  it("rejects ftp and other non-http(s) schemes", () => {
    expect(buildListUnsubscribeHeaders("ftp://example.com/x")).toBeNull();
    expect(buildListUnsubscribeHeaders("javascript:alert(1)")).toBeNull();
  });

  it("rejects malformed URLs", () => {
    expect(buildListUnsubscribeHeaders("not a url")).toBeNull();
    expect(buildListUnsubscribeHeaders("")).toBeNull();
    expect(buildListUnsubscribeHeaders("   ")).toBeNull();
  });

  it("rejects null / undefined / non-string input", () => {
    expect(buildListUnsubscribeHeaders(null)).toBeNull();
    expect(buildListUnsubscribeHeaders(undefined)).toBeNull();
  });

  it("rejects values containing CR or LF (header injection guard)", () => {
    expect(
      buildListUnsubscribeHeaders("https://example.com/u\r\nX-Evil: 1"),
    ).toBeNull();
    expect(
      buildListUnsubscribeHeaders("https://example.com/u\nSubject: x"),
    ).toBeNull();
    expect(buildListUnsubscribeHeaders("https://example.com/u\r")).toBeNull();
  });
});

describe("buildMailtoUnsubscribeHeaders", () => {
  it("builds a mailto header carrying only the sender's own domain", () => {
    const h = buildMailtoUnsubscribeHeaders("sender@clientdomain.com");
    expect(h).not.toBeNull();
    expect(h!.listUnsubscribe).toBe(
      "<mailto:sender@clientdomain.com?subject=Unsubscribe>",
    );
  });

  it("NEVER emits List-Unsubscribe-Post — RFC 8058 one-click is HTTPS only", () => {
    const h = buildMailtoUnsubscribeHeaders("sender@clientdomain.com");
    expect(h).not.toBeNull();
    expect(h!.listUnsubscribePost).toBeUndefined();
  });

  it("normalises case and surrounding whitespace", () => {
    const h = buildMailtoUnsubscribeHeaders("  Sender@ClientDomain.COM  ");
    expect(h).not.toBeNull();
    expect(h!.listUnsubscribe).toBe(
      "<mailto:sender@clientdomain.com?subject=Unsubscribe>",
    );
  });

  it("rejects values containing CR or LF (header injection guard)", () => {
    expect(
      buildMailtoUnsubscribeHeaders("a@b.com\r\nX-Evil: 1"),
    ).toBeNull();
    expect(buildMailtoUnsubscribeHeaders("a@b.com\nSubject: x")).toBeNull();
    expect(buildMailtoUnsubscribeHeaders("a@b.com\r")).toBeNull();
  });

  it("rejects characters that would break the header grammar", () => {
    expect(buildMailtoUnsubscribeHeaders("<a@b.com>")).toBeNull();
    expect(buildMailtoUnsubscribeHeaders('"a"@b.com')).toBeNull();
    expect(buildMailtoUnsubscribeHeaders("a@b.com, c@d.com")).toBeNull();
    expect(buildMailtoUnsubscribeHeaders("a@b.com; c@d.com")).toBeNull();
    expect(buildMailtoUnsubscribeHeaders("a b@c.com")).toBeNull();
  });

  it("rejects anything that is not a plausible single address", () => {
    expect(buildMailtoUnsubscribeHeaders("no-at-sign")).toBeNull();
    expect(buildMailtoUnsubscribeHeaders("@nolocalpart.com")).toBeNull();
    expect(buildMailtoUnsubscribeHeaders("two@at@signs.com")).toBeNull();
    expect(buildMailtoUnsubscribeHeaders("a@nodot")).toBeNull();
    expect(buildMailtoUnsubscribeHeaders("a@.leadingdot.com")).toBeNull();
    expect(buildMailtoUnsubscribeHeaders("a@trailingdot.")).toBeNull();
  });

  it("rejects null / undefined / empty input", () => {
    expect(buildMailtoUnsubscribeHeaders(null)).toBeNull();
    expect(buildMailtoUnsubscribeHeaders(undefined)).toBeNull();
    expect(buildMailtoUnsubscribeHeaders("")).toBeNull();
    expect(buildMailtoUnsubscribeHeaders("   ")).toBeNull();
  });
});

describe("listUnsubscribeHeadersToRfc5322Lines", () => {
  it("produces the exact two header lines in canonical order", () => {
    const h = buildListUnsubscribeHeaders("https://example.com/unsubscribe/x");
    expect(h).not.toBeNull();
    const lines = listUnsubscribeHeadersToRfc5322Lines(h!);
    expect(lines).toEqual([
      "List-Unsubscribe: <https://example.com/unsubscribe/x>",
      "List-Unsubscribe-Post: List-Unsubscribe=One-Click",
    ]);
  });

  it("produces a SINGLE line for the mailto rail — no one-click Post header", () => {
    const h = buildMailtoUnsubscribeHeaders("sender@clientdomain.com");
    expect(h).not.toBeNull();
    const lines = listUnsubscribeHeadersToRfc5322Lines(h!);
    expect(lines).toEqual([
      "List-Unsubscribe: <mailto:sender@clientdomain.com?subject=Unsubscribe>",
    ]);
    expect(lines.join("\r\n")).not.toContain("List-Unsubscribe-Post");
  });
});
