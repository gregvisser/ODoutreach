import { describe, expect, it } from "vitest";

import {
  MAILTO_OPT_OUT_LINE,
  buildMailboxGovernedEmailBodies,
  stripTrailingPlainSignature,
} from "./outreach-mailbox-bodies";

const mailbox = {
  provider: "MICROSOFT" as const,
  email: "sender@opensdoors.co.uk",
  displayName: "Adam",
  senderDisplayName: "Adam Example",
  senderSignatureHtml:
    "<div><strong>OpensDoors</strong></div><p>Registered in England. Confidentiality applies.</p>",
  senderSignatureText: "Kind regards,\nAdam\nOpensDoors",
  senderSignatureSource: "manual",
  senderSignatureSyncedAt: null,
  senderSignatureSyncError: null,
};

describe("buildMailboxGovernedEmailBodies", () => {
  it("orders HTML as message → branded HTML signature → Unsubscribe anchor", () => {
    const url = "https://opensdoors.example/unsub?t=abc";
    const snapshot = [
      "Hello prospect,\n\nThanks for reading.",
      "",
      "Kind regards,",
      "Adam",
      "OpensDoors",
      "",
      "---",
      `Unsubscribe: ${url}`,
    ].join("\n");

    const { text, html } = buildMailboxGovernedEmailBodies({
      bodySnapshotPlain: snapshot,
      mailbox,
      hostedUnsubscribeUrl: url,
    });

    expect(text).toContain("Thanks for reading");
    expect(text.indexOf("OpensDoors")).toBeLessThan(text.indexOf("Unsubscribe:"));

    const sigIdx = html.indexOf("od-outreach-signature");
    const unsubIdx = html.indexOf(`href="https://opensdoors.example/unsub?t=abc"`);
    const anchorIdx = html.indexOf(">Unsubscribe</a>");
    expect(sigIdx).toBeGreaterThan(-1);
    expect(unsubIdx).toBeGreaterThan(sigIdx);
    expect(anchorIdx).toBeGreaterThan(sigIdx);
    expect(html.includes(`Unsubscribe: ${url}`)).toBe(false);
  });

  it("plain text keeps full URL and orders signature before unsubscribe line", () => {
    const url = "https://x.example/u";
    const snapshot = `Intro line.\n\n${mailbox.senderSignatureText}\n\n---\nUnsubscribe: ${url}`;
    const { text } = buildMailboxGovernedEmailBodies({
      bodySnapshotPlain: snapshot,
      mailbox,
      hostedUnsubscribeUrl: url,
    });
    expect(text).toMatch(/Intro line/);
    expect(text.indexOf("Kind regards")).toBeLessThan(text.indexOf("Unsubscribe:"));
    expect(text).toContain(url);
  });
});

describe("stripTrailingPlainSignature", () => {
  it("removes a trailing signature block", () => {
    expect(
      stripTrailingPlainSignature("Hello\n\nSig line", "Sig line"),
    ).toBe("Hello");
  });
});

describe("buildMailboxGovernedEmailBodies — mailto opt-out rail", () => {
  const snapshot = "Hello prospect,\n\nThanks for reading.";

  it("renders the visible opt-out instruction in plain text", () => {
    const { text } = buildMailboxGovernedEmailBodies({
      bodySnapshotPlain: snapshot,
      mailbox,
      mailtoUnsubscribeAddress: "sender@opensdoors.co.uk",
    });
    expect(text).toContain(MAILTO_OPT_OUT_LINE);
  });

  // The HTML body escapes the apostrophe in the copy to `&#39;`, so assertions
  // on rendered HTML use this escaping-safe fragment rather than the raw line.
  const OPT_OUT_FRAGMENT = "reply STOP to this email";

  it("renders the opt-out instruction in HTML, after the signature", () => {
    const { html } = buildMailboxGovernedEmailBodies({
      bodySnapshotPlain: snapshot,
      mailbox,
      mailtoUnsubscribeAddress: "sender@opensdoors.co.uk",
    });
    expect(html).toContain(OPT_OUT_FRAGMENT);
    expect(html.indexOf("OpensDoors")).toBeLessThan(html.indexOf(OPT_OUT_FRAGMENT));
  });

  it("escapes the copy when rendering it into HTML", () => {
    const { html } = buildMailboxGovernedEmailBodies({
      bodySnapshotPlain: snapshot,
      mailbox,
      mailtoUnsubscribeAddress: "sender@opensdoors.co.uk",
    });
    expect(html).toContain("we&#39;ll remove you");
  });

  it("emits NO url and NO anchor on this rail — the whole point of it", () => {
    const { text, html } = buildMailboxGovernedEmailBodies({
      bodySnapshotPlain: snapshot,
      mailbox,
      mailtoUnsubscribeAddress: "sender@opensdoors.co.uk",
    });
    expect(text).not.toMatch(/https?:\/\//);
    expect(html).not.toMatch(/https?:\/\//);
    expect(html).not.toContain("<a ");
    expect(html).not.toContain("Unsubscribe</a>");
  });

  it("a hosted url wins — mailto is the fallback, never both", () => {
    const url = "https://go.clientdomain.com/api/unsubscribe/tok";
    const { text, html } = buildMailboxGovernedEmailBodies({
      bodySnapshotPlain: snapshot,
      mailbox,
      hostedUnsubscribeUrl: url,
      mailtoUnsubscribeAddress: "sender@opensdoors.co.uk",
    });
    expect(html).toContain(`href="${url}"`);
    expect(text).not.toContain(MAILTO_OPT_OUT_LINE);
    expect(html).not.toContain(OPT_OUT_FRAGMENT);
  });

  it("ignores an unusable mailto address rather than emitting a broken opt-out", () => {
    const { text, html } = buildMailboxGovernedEmailBodies({
      bodySnapshotPlain: snapshot,
      mailbox,
      mailtoUnsubscribeAddress: "not-an-address",
    });
    expect(text).not.toContain(MAILTO_OPT_OUT_LINE);
    expect(html).not.toContain(OPT_OUT_FRAGMENT);
  });

  it("passing neither rail preserves the previous no-footer behaviour", () => {
    const { text, html } = buildMailboxGovernedEmailBodies({
      bodySnapshotPlain: snapshot,
      mailbox,
    });
    expect(text).not.toContain(MAILTO_OPT_OUT_LINE);
    expect(html).not.toContain(OPT_OUT_FRAGMENT);
    expect(html).not.toContain("Unsubscribe");
  });
});
