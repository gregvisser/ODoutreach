import { describe, it, expect } from "vitest";

import {
  MAX_INBOUND_BODY_CHARS,
  decodeBase64UrlPartBody,
  htmlToSafeText,
  normalizeGmailMessagePayload,
  normalizeMicrosoftMessageBody,
  truncateOrLimitBody,
} from "./inbound-body-normalization";

describe("htmlToSafeText", () => {
  it("returns empty string for empty input", () => {
    expect(htmlToSafeText("")).toBe("");
    expect(htmlToSafeText(null as unknown as string)).toBe("");
  });

  it("preserves plain-looking text", () => {
    expect(htmlToSafeText("Hello Greg")).toBe("Hello Greg");
  });

  it("strips script blocks and their contents", () => {
    const html = `Hi <script>alert('xss');</script>there`;
    const out = htmlToSafeText(html);
    expect(out).not.toContain("alert");
    expect(out).not.toContain("<");
    expect(out).toContain("Hi");
    expect(out).toContain("there");
  });

  it("strips style blocks and their contents", () => {
    const html = `Before<style>.x{color:red}</style>After`;
    const out = htmlToSafeText(html);
    expect(out).not.toContain("color");
    expect(out).not.toContain("<");
    expect(out).toContain("Before");
    expect(out).toContain("After");
  });

  it("strips HTML comments", () => {
    expect(htmlToSafeText("A<!-- secret -->B")).toBe("AB");
  });

  it("converts <br> to newlines and block tags to paragraph breaks", () => {
    const html = `<p>Line one</p><p>Line two<br/>continued</p>`;
    const out = htmlToSafeText(html);
    expect(out).toContain("Line one");
    expect(out).toContain("Line two");
    expect(out).toContain("continued");
    expect(out.split("\n").length).toBeGreaterThanOrEqual(2);
  });

  it("renders links as plain text (never executable)", () => {
    const html = `<a href="javascript:alert(1)">Click me</a>`;
    const out = htmlToSafeText(html);
    expect(out).toBe("Click me");
    expect(out).not.toContain("javascript:");
    expect(out).not.toContain("<");
  });

  it("decodes common HTML entities", () => {
    expect(htmlToSafeText("a&amp;b")).toBe("a&b");
    expect(htmlToSafeText("&lt;x&gt;")).toBe("<x>");
    expect(htmlToSafeText("&quot;hi&quot;")).toBe('"hi"');
    expect(htmlToSafeText("it&#39;s")).toBe("it's");
    expect(htmlToSafeText("a&nbsp;b")).toBe("a b");
    expect(htmlToSafeText("&#65;")).toBe("A");
    expect(htmlToSafeText("&#x41;")).toBe("A");
  });

  it("collapses runs of blank lines", () => {
    const html = `<p>a</p><p></p><p></p><p>b</p>`;
    const out = htmlToSafeText(html);
    expect(out).toMatch(/a\n\nb/);
    expect(out).not.toMatch(/\n\n\n/);
  });
});

describe("truncateOrLimitBody", () => {
  it("does not modify short bodies", () => {
    const { text, truncated } = truncateOrLimitBody("hello", 1000);
    expect(text).toBe("hello");
    expect(truncated).toBe(false);
  });

  it("truncates and appends a visible marker", () => {
    const { text, truncated } = truncateOrLimitBody("a".repeat(10), 5);
    expect(truncated).toBe(true);
    expect(text.startsWith("aaaaa")).toBe(true);
    expect(text).toContain("truncated");
  });

  it("handles non-string gracefully", () => {
    expect(truncateOrLimitBody(undefined as unknown as string)).toEqual({
      text: "",
      truncated: false,
    });
  });
});

describe("normalizeMicrosoftMessageBody", () => {
  it("returns empty when body is missing and no fallback", () => {
    const out = normalizeMicrosoftMessageBody(null);
    expect(out).toEqual({
      text: "",
      contentType: "empty",
      size: 0,
      truncated: false,
    });
  });

  it("falls back to preview when body is empty", () => {
    const out = normalizeMicrosoftMessageBody(
      { content: "", contentType: "html" },
      "Hi there",
    );
    expect(out.text).toBe("Hi there");
    expect(out.contentType).toBe("text");
    expect(out.size).toBe("Hi there".length);
  });

  it("preserves text content when contentType is text", () => {
    const out = normalizeMicrosoftMessageBody({
      content: "Hello\nGreg",
      contentType: "text",
    });
    expect(out.text).toBe("Hello\nGreg");
    expect(out.contentType).toBe("text");
  });

  it("converts HTML content to safe text", () => {
    const out = normalizeMicrosoftMessageBody({
      content: `<p>Hi <script>bad()</script>Greg</p>`,
      contentType: "html",
    });
    expect(out.contentType).toBe("html");
    expect(out.text).toContain("Hi");
    expect(out.text).toContain("Greg");
    expect(out.text).not.toContain("bad");
    expect(out.text).not.toContain("<");
  });

  it("reports raw size and truncation", () => {
    const raw = "<p>" + "x".repeat(MAX_INBOUND_BODY_CHARS + 10) + "</p>";
    const out = normalizeMicrosoftMessageBody({
      content: raw,
      contentType: "html",
    });
    expect(out.size).toBe(raw.length);
    expect(out.truncated).toBe(true);
  });
});

describe("normalizeGmailMessagePayload", () => {
  it("returns empty when payload missing", () => {
    const out = normalizeGmailMessagePayload({ snippet: "" });
    expect(out).toEqual({
      text: "",
      contentType: "empty",
      size: 0,
      truncated: false,
    });
  });

  it("falls back to snippet when payload has no body parts", () => {
    const out = normalizeGmailMessagePayload({
      snippet: "Greg—thanks for reaching out.",
      payload: { mimeType: "multipart/alternative" },
    });
    expect(out.text).toBe("Greg—thanks for reaching out.");
    expect(out.contentType).toBe("text");
  });

  it("prefers text/plain when available", () => {
    const plain = "Hello Greg";
    const dataPlain = Buffer.from(plain, "utf8").toString("base64url");
    const html = "<p>Hello <b>Greg</b></p>";
    const dataHtml = Buffer.from(html, "utf8").toString("base64url");
    const out = normalizeGmailMessagePayload({
      snippet: "snip",
      payload: {
        mimeType: "multipart/alternative",
        parts: [
          { mimeType: "text/plain", body: { data: dataPlain } },
          { mimeType: "text/html", body: { data: dataHtml } },
        ],
      },
    });
    expect(out.contentType).toBe("text");
    expect(out.text).toBe(plain);
  });

  it("extracts text/plain from nested multipart/mixed with attachments", () => {
    const plain = "Please find attached";
    const dataPlain = Buffer.from(plain, "utf8").toString("base64url");
    const out = normalizeGmailMessagePayload({
      snippet: "snip",
      payload: {
        mimeType: "multipart/mixed",
        parts: [
          {
            mimeType: "multipart/alternative",
            parts: [{ mimeType: "text/plain", body: { data: dataPlain } }],
          },
          {
            mimeType: "application/pdf",
            filename: "report.pdf",
            body: { attachmentId: "abc" },
          },
        ],
      },
    });
    expect(out.text).toBe(plain);
    expect(out.contentType).toBe("text");
  });

  it("converts HTML to text when no plain part exists", () => {
    const html = "<p>Hi <script>evil()</script>Greg</p>";
    const data = Buffer.from(html, "utf8").toString("base64url");
    const out = normalizeGmailMessagePayload({
      snippet: "snip",
      payload: {
        mimeType: "text/html",
        body: { data },
      },
    });
    expect(out.contentType).toBe("html");
    expect(out.text).toContain("Hi");
    expect(out.text).toContain("Greg");
    expect(out.text).not.toContain("evil");
    expect(out.text).not.toContain("<");
  });
});

describe("decodeBase64UrlPartBody", () => {
  it("decodes URL-safe base64 to utf-8", () => {
    const original = "Hello—Greg";
    const encoded = Buffer.from(original, "utf8")
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    expect(decodeBase64UrlPartBody(encoded)).toBe(original);
  });

  it("returns empty string on missing or invalid input", () => {
    expect(decodeBase64UrlPartBody(null)).toBe("");
    expect(decodeBase64UrlPartBody("")).toBe("");
  });
});
