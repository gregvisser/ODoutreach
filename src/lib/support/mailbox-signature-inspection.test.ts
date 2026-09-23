import { describe, expect, it } from "vitest";

import {
  assessStoredSignatureHealth,
  inspectClientMailboxSignatures,
  inspectMailboxSignature,
} from "./mailbox-signature-inspection";

const client = {
  id: "client_1",
  slug: "morson-fm",
  name: "Morson FM",
  website: "https://morsonfm.example",
  logoUrl: "https://cdn.example/logo.png",
  signaturePhone: "01234 567890",
};

function mailbox(overrides: Partial<Parameters<typeof inspectMailboxSignature>[0]["mailbox"]> = {}) {
  return {
    id: "mb_1",
    email: "sender@morsonfm.example",
    displayName: "Sender",
    provider: "GOOGLE" as const,
    connectionStatus: "CONNECTED" as const,
    isSendingEnabled: true,
    lastError: null,
    senderDisplayName: "Sender",
    senderPhone: null,
    senderSignatureHtml:
      '<div>Kind regards<br/><img src="cid:logo001" alt="Logo"/></div>',
    senderSignatureText: null,
    senderSignatureSource: "gmail_send_as",
    senderSignatureSyncedAt: "2026-09-20T12:00:00.000Z",
    senderSignatureSyncError: null,
    ...overrides,
  };
}

describe("inspectMailboxSignature", () => {
  it("flags cid images and proposes a hosted-logo fix", () => {
    const report = inspectMailboxSignature({
      client,
      mailbox: mailbox(),
      allMailboxEmails: ["sender@morsonfm.example"],
    });
    expect(report.signature.imageSources.some((s) => s.scheme === "cid")).toBe(true);
    expect(report.proposedFixes.join(" ")).toMatch(/https/i);
    expect(report.proposedFixes.join(" ")).toMatch(/cid/i);
  });

  it("suggests reconnect when the mailbox is not connected", () => {
    const report = inspectMailboxSignature({
      client,
      mailbox: mailbox({ connectionStatus: "PENDING_CONNECTION" }),
      allMailboxEmails: ["sender@morsonfm.example"],
    });
    expect(report.proposedFixes[0]).toMatch(/Reconnect/i);
  });

  it("reports healthy M365 storage with https logo and no spurious signature edits", () => {
    const logo =
      "https://www.morsonfm.co.uk/wp-content/uploads/2021/12/MFMlogo4-300x260.png";
    const html = `<div>${"<p>Branded line with company details.</p>".repeat(12)}<img src="${logo}" alt="MFM"/></div>`;
    const longText = `${"Kind regards\nSender Name\nMorson FM\n".repeat(8)}Legal disclaimer and contact details.`;
    const report = inspectMailboxSignature({
      client,
      mailbox: mailbox({
        provider: "MICROSOFT",
        senderSignatureSource: "manual",
        senderSignatureHtml: html,
        senderSignatureText: longText,
      }),
      allMailboxEmails: ["sender@morsonfm.example"],
    });
    expect(report.signature.storedImageUrls).toContain(logo);
    expect(report.signature.operatorState.label).toContain("Ready");
    expect(report.storedSignatureHealthy).toBe(true);
    expect(report.proposedFixes).toHaveLength(0);
    expect(report.supportConclusion).toMatch(/Stored signature healthy/i);
    expect(report.supportConclusion).toMatch(/unconfirmed/i);
    expect(report.verificationLimits.staffActivityShowsSentHtml).toBe(false);
  });

  it("aggregates a multi-mailbox client report", () => {
    const logo = "https://www.morsonfm.co.uk/wp-content/uploads/2021/12/MFMlogo4-300x260.png";
    const html = `<img src="${logo}" alt="logo"/>`;
    const text = `Branded signature block. ${"Contact line. ".repeat(24)}`;
    const mb = (id: string, email: string) =>
      mailbox({
        id,
        email,
        provider: "MICROSOFT",
        senderSignatureHtml: html,
        senderSignatureText: text,
        senderSignatureSource: "manual",
      });
    const report = inspectClientMailboxSignatures(client, [
      mb("mb_1", "a@morsonfm.example"),
      mb("mb_2", "b@morsonfm.example"),
      mb("mb_3", "c@morsonfm.example"),
    ]);
    expect(report.mailboxes).toHaveLength(3);
    expect(report.supportConclusion).toMatch(/All 3 mailbox/i);
    expect(report.supportConclusion).toMatch(/recipient render unconfirmed/i);
  });
});

describe("assessStoredSignatureHealth", () => {
  it("marks blocked link signatures unhealthy", () => {
    const base = inspectMailboxSignature({
      client,
      mailbox: mailbox({
        senderSignatureHtml:
          '<a href="https://app-opensdoors-outreach-prod.azurewebsites.net/">track</a>',
        senderSignatureText: "x".repeat(200),
      }),
      allMailboxEmails: ["sender@morsonfm.example"],
    });
    const { healthy, supportConclusion } = assessStoredSignatureHealth({
      client: base.client,
      mailbox: base.mailbox,
      signature: base.signature,
    });
    expect(healthy).toBe(false);
    expect(supportConclusion).toMatch(/blocked/i);
  });
});
