import { describe, expect, it } from "vitest";

import {
  LIST_UNSUBSCRIBE_POST_VALUE,
  buildListUnsubscribeHeaders,
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
});
