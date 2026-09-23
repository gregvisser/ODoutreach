import { describe, expect, it } from "vitest";

import { inspectMailboxSignature } from "./mailbox-signature-inspection";

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
});
