import { describe, expect, it } from "vitest";

import {
  buildCleanUnsubscribeHtmlBody,
  buildEmailBodyParts,
} from "./email-body-parts";

describe("email body parts", () => {
  it("renders HTML unsubscribe as anchor text and hides the raw URL", () => {
    const url = "https://opensdoors.bidlow.co.uk/unsubscribe/raw-token";
    const html = buildCleanUnsubscribeHtmlBody({
      bodyText: `Hello\n\nSignature\n\n---\nUnsubscribe: ${url}\n`,
      unsubscribeUrl: url,
    });

    expect(html).toContain(`<a href="${url}">Unsubscribe</a>`);
    expect(html).not.toContain(`Unsubscribe: ${url}`);
  });

  it("keeps the raw URL in the plain-text fallback", () => {
    const url = "https://opensdoors.bidlow.co.uk/unsubscribe/raw-token";
    const parts = buildEmailBodyParts({
      bodyText: `Hello\n\nSignature\n\n---\nUnsubscribe: ${url}\n`,
      unsubscribeUrl: url,
    });

    expect(parts.text).toContain(`Unsubscribe: ${url}`);
  });

  it("places the HTML footer after the ODoutreach-controlled signature", () => {
    const url = "https://opensdoors.bidlow.co.uk/unsubscribe/raw-token";
    const html = buildCleanUnsubscribeHtmlBody({
      bodyText: `Hello\n\nAdam OpensDoors\nOpensDoors\n\n---\nUnsubscribe: ${url}\n`,
      unsubscribeUrl: url,
    });

    expect(html.indexOf("Adam OpensDoors")).toBeGreaterThan(-1);
    expect(html.indexOf(">Unsubscribe</a>")).toBeGreaterThan(
      html.indexOf("Adam OpensDoors"),
    );
  });

  it("escapes HTML in body text before rendering", () => {
    const html = buildCleanUnsubscribeHtmlBody({
      bodyText: `<script>alert("x")</script>`,
    });

    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>");
  });
});
