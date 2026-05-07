import { describe, expect, it } from "vitest";

import { buildMailboxGovernedEmailBodies, stripTrailingPlainSignature } from "./outreach-mailbox-bodies";

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
