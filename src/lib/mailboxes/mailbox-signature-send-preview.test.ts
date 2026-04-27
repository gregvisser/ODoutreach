import { describe, expect, it } from "vitest";

import {
  buildMailboxSignatureSendPreview,
  MAILBOX_SIGNATURE_PREVIEW_UNSUBSCRIBE_URL,
} from "./mailbox-signature-send-preview";
import type { SenderSignatureMailbox } from "./sender-signature";

function mbox(over: Partial<SenderSignatureMailbox> = {}): SenderSignatureMailbox {
  return {
    provider: "MICROSOFT",
    email: "a@b.com",
    displayName: null,
    senderDisplayName: null,
    senderSignatureHtml: null,
    senderSignatureText: "Regards,\nTeam",
    senderSignatureSource: "manual",
    senderSignatureSyncedAt: null,
    senderSignatureSyncError: null,
    ...over,
  };
}

const brief = {
  senderDisplayNameFallback: "C",
  emailSignatureFallback: null,
} as const;

describe("buildMailboxSignatureSendPreview", () => {
  it("appends the standard unsubscribe line after the signature (sample URL)", () => {
    const p = buildMailboxSignatureSendPreview({ mailbox: mbox(), clientBrief: brief });
    expect(p.isPreview).toBe(true);
    expect(p.bodyPlain).toContain("Regards");
    expect(p.bodyPlain).toContain("Unsubscribe:");
    expect(p.bodyPlain).toContain(MAILBOX_SIGNATURE_PREVIEW_UNSUBSCRIBE_URL);
    const unsubPos = p.bodyPlain.indexOf("Unsubscribe:");
    const firstSig = p.bodyPlain.indexOf("Regards");
    expect(unsubPos).toBeGreaterThan(firstSig);
    expect(p.footnote).toMatch(/no email|real unsubscribe/i);
  });

  it("uses a placeholder and still appends the footer when there is no signature", () => {
    const p = buildMailboxSignatureSendPreview({
      mailbox: mbox({
        senderSignatureText: null,
        senderSignatureSource: null,
      }),
      clientBrief: { senderDisplayNameFallback: null, emailSignatureFallback: null },
    });
    expect(p.signatureTextUsed).toBeNull();
    expect(p.bodyPlain).toContain("No mailbox signature configured");
    expect(p.footnote).toMatch(/unsubscribe footer will be added after the mailbox signature/i);
    expect(p.bodyPlain).toContain(MAILBOX_SIGNATURE_PREVIEW_UNSUBSCRIBE_URL);
  });

  it("uses only the public preview URL, not a secret token", () => {
    const p = buildMailboxSignatureSendPreview({ mailbox: mbox(), clientBrief: brief });
    expect(p.bodyPlain).toContain(MAILBOX_SIGNATURE_PREVIEW_UNSUBSCRIBE_URL);
    expect(p.bodyPlain).not.toMatch(/token=[a-z0-9]{20,}/i);
  });

  it("does not inject client brief signature when mailbox has no per-mailbox signature", () => {
    const p = buildMailboxSignatureSendPreview({
      mailbox: mbox({
        senderSignatureText: null,
        senderSignatureSource: null,
      }),
      clientBrief: {
        senderDisplayNameFallback: "Someone else",
        emailSignatureFallback: "Joe McKevitt\nVP",
      },
    });
    expect(p.bodyPlain).not.toContain("Joe McKevitt");
    expect(p.selection.source).toBe("unsupported_provider");
  });
});
