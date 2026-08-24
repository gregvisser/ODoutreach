import { describe, expect, it } from "vitest";

import { extractGmailBody, mapGmailMessageToRow } from "./gmail-inbox";

/**
 * The Gmail fetch used `format=metadata`, which returns headers and NO body at
 * all. Everything downstream — the NDR bounce classifier and the opt-out
 * classifier — therefore received Gmail's ~200-character snippet.
 *
 * Measured on production 2026-08-24: 355 Gmail messages, SEVEN with any
 * bodyText, average length 57 characters. Microsoft, over the same store: 6,240
 * messages, 6,067 with bodyText, average 4,023. Of 147 real Gmail NDRs sitting
 * in the raw message store, not one had a body for the parser to read.
 *
 * These tests cover the traversal rather than the HTTP call: Gmail nests the
 * readable text arbitrarily deep inside a MIME tree, and getting that wrong
 * would leave the fetch fixed but the body still empty.
 */

const b64 = (s: string) =>
  Buffer.from(s, "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_");

describe("extractGmailBody walks the MIME tree", () => {
  it("reads a simple text/plain body", () => {
    const r = extractGmailBody({
      mimeType: "text/plain",
      body: { data: b64("Please remove me from your list.") },
    });
    expect(r.text).toBe("Please remove me from your list.");
    expect(r.contentType).toBe("text");
  });

  it("prefers text/plain over text/html in a multipart/alternative", () => {
    const r = extractGmailBody({
      mimeType: "multipart/alternative",
      parts: [
        { mimeType: "text/plain", body: { data: b64("the plain one") } },
        { mimeType: "text/html", body: { data: b64("<p>the html one</p>") } },
      ],
    });
    expect(r.text).toBe("the plain one");
    expect(r.contentType).toBe("text");
  });

  it("falls back to stripped html when there is no plain part", () => {
    const r = extractGmailBody({
      mimeType: "multipart/alternative",
      parts: [
        { mimeType: "text/html", body: { data: b64("<p>Hello</p><p>Take me off.</p>") } },
      ],
    });
    expect(r.contentType).toBe("html");
    expect(r.text).toContain("Hello");
    expect(r.text).toContain("Take me off.");
    expect(r.text).not.toContain("<p>");
  });

  it("finds the body nested several levels down — the real NDR shape", () => {
    // A bounce is typically multipart/report wrapping the DSN and the original.
    const r = extractGmailBody({
      mimeType: "multipart/mixed",
      parts: [
        {
          mimeType: "multipart/report",
          parts: [
            {
              mimeType: "text/plain",
              body: {
                data: b64(
                  "Address not found. Your message wasn't delivered to sam@example.com because the address couldn't be found. 550 5.1.1 The email account that you tried to reach does not exist.",
                ),
              },
            },
            { mimeType: "message/delivery-status", body: { data: b64("Final-Recipient: rfc822; sam@example.com") } },
          ],
        },
      ],
    });
    expect(r.text).toContain("550 5.1.1");
    expect(r.text).toContain("sam@example.com");
  });

  it("ignores attachments", () => {
    const r = extractGmailBody({
      mimeType: "multipart/mixed",
      parts: [
        { mimeType: "text/plain", body: { data: b64("real body") } },
        {
          mimeType: "application/pdf",
          filename: "invoice.pdf",
          body: { attachmentId: "att-1", size: 90000 },
        },
      ],
    });
    expect(r.text).toBe("real body");
  });

  it("returns empty rather than throwing on a payload with no body", () => {
    expect(extractGmailBody({ mimeType: "multipart/mixed", parts: [] }).text).toBe("");
    expect(extractGmailBody(undefined).text).toBe("");
  });
});

describe("mapGmailMessageToRow populates fullBody", () => {
  const base = {
    id: "m1",
    threadId: "t1",
    snippet: "a short preview",
    internalDate: "1756032000000",
    sizeEstimate: 4096,
  };
  const headers = [
    { name: "From", value: "Sam <sam@example.com>" },
    { name: "To", value: "outreach@client.co.uk" },
    { name: "Subject", value: "Re: Catering Options" },
  ];

  it("carries the decoded body, not the snippet", () => {
    const row = mapGmailMessageToRow({
      ...base,
      payload: {
        mimeType: "text/plain",
        headers,
        body: { data: b64("A much longer body than the snippet, with the opt-out at the end. Please remove me.") },
      },
    });
    expect(row).not.toBeNull();
    expect(row?.fullBody?.bodyText).toContain("Please remove me.");
    expect(row?.fullBody?.fullBodySource).toBe("GMAIL_API");
    // The preview is still the snippet — the body is the new, separate field.
    expect(row?.bodyPreview).toBe("a short preview");
  });

  it("leaves fullBody null when the message genuinely has no body", () => {
    const row = mapGmailMessageToRow({ ...base, payload: { headers } });
    expect(row?.fullBody).toBeNull();
  });
});
