import { describe, expect, it } from "vitest";

import {
  buildSenderSignatureViewModel,
  chooseSignatureForSend,
  htmlSignatureToText,
  normaliseSignatureHtml,
  SENDER_SIGNATURE_STATUS,
  type SenderSignatureMailbox,
} from "./sender-signature";

function makeMailbox(
  overrides: Partial<SenderSignatureMailbox> = {},
): SenderSignatureMailbox {
  return {
    provider: "GOOGLE",
    email: "sender@example.com",
    displayName: null,
    senderDisplayName: null,
    senderSignatureHtml: null,
    senderSignatureText: null,
    senderSignatureSource: null,
    senderSignatureSyncedAt: null,
    senderSignatureSyncError: null,
    ...overrides,
  };
}

describe("htmlSignatureToText", () => {
  it("converts block tags to newlines and strips inline tags", () => {
    const html =
      "<div>Hi <strong>Maria</strong></div><p>Best,<br>Greg</p><script>alert(1)</script>";
    expect(htmlSignatureToText(html)).toBe("Hi Maria\nBest,\nGreg");
  });

  it("decodes common entities", () => {
    expect(htmlSignatureToText("Greg &amp; OpensDoors &nbsp;team")).toBe(
      "Greg & OpensDoors team",
    );
  });

  it("returns empty string for null/empty input", () => {
    expect(htmlSignatureToText(null)).toBe("");
    expect(htmlSignatureToText("")).toBe("");
    expect(htmlSignatureToText("   ")).toBe("");
  });

  it("drops <style> blocks entirely", () => {
    const html = "<style>.sig { color: red; }</style><div>Greg</div>";
    expect(htmlSignatureToText(html)).toBe("Greg");
  });
});

describe("normaliseSignatureHtml", () => {
  it("returns empty string when HTML is effectively empty", () => {
    expect(normaliseSignatureHtml("<style>a { }</style>")).toBe("");
    expect(normaliseSignatureHtml("<div>   </div>")).toBe("");
  });

  it("preserves meaningful HTML", () => {
    const html = "<div>Greg <a href='x'>link</a></div>";
    expect(normaliseSignatureHtml(html)).toContain("Greg");
  });
});

describe("buildSenderSignatureViewModel", () => {
  const fallback = {
    senderDisplayNameFallback: "Bidlow Client",
    emailSignatureFallback: "-- \nBidlow Team",
  };

  it("prefers mailbox text over brief fallback", () => {
    const vm = buildSenderSignatureViewModel(
      makeMailbox({
        senderSignatureText: "Greg Visser\nBidlow",
        senderSignatureSource: "manual",
      }),
      fallback,
    );
    expect(vm.hasMailboxSignature).toBe(true);
    expect(vm.resolvedSignatureText).toBe("Greg Visser\nBidlow");
    expect(vm.source).toBe("manual");
    expect(SENDER_SIGNATURE_STATUS[vm.source]).toBe("Set in OpensDoors");
  });

  it("tags synced Gmail signatures as gmail_send_as", () => {
    const vm = buildSenderSignatureViewModel(
      makeMailbox({
        senderSignatureText: "Greg\nBidlow",
        senderSignatureSource: "gmail_send_as",
        senderSignatureSyncedAt: new Date("2026-04-22T10:00:00.000Z"),
      }),
      fallback,
    );
    expect(vm.source).toBe("gmail_send_as");
    expect(vm.lastSyncedAtIso).toBe("2026-04-22T10:00:00.000Z");
    expect(SENDER_SIGNATURE_STATUS[vm.source]).toBe("Synced from Gmail (send-as)");
  });

  it("falls back to the brief signature when mailbox is empty", () => {
    const vm = buildSenderSignatureViewModel(makeMailbox(), fallback);
    expect(vm.hasMailboxSignature).toBe(false);
    expect(vm.resolvedSignatureText).toBe("-- \nBidlow Team");
    expect(vm.source).toBe("client_brief_fallback");
  });

  it("reports unsupported for Microsoft when nothing is set anywhere", () => {
    const vm = buildSenderSignatureViewModel(
      makeMailbox({ provider: "MICROSOFT" }),
      { senderDisplayNameFallback: null, emailSignatureFallback: null },
    );
    expect(vm.source).toBe("unsupported_provider");
    expect(vm.automaticSyncSupported).toBe(false);
    expect(SENDER_SIGNATURE_STATUS[vm.source]).toBe(
      "Microsoft 365: set in OpensDoors (no Outlook pull)",
    );
  });

  it("reports missing for Google when neither mailbox nor brief have a signature", () => {
    const vm = buildSenderSignatureViewModel(makeMailbox(), {
      senderDisplayNameFallback: null,
      emailSignatureFallback: null,
    });
    expect(vm.source).toBe("missing");
    expect(vm.automaticSyncSupported).toBe(true);
  });

  it("resolves display name from mailbox > brief > email", () => {
    const a = buildSenderSignatureViewModel(
      makeMailbox({ senderDisplayName: "Greg (mailbox)" }),
      fallback,
    );
    expect(a.resolvedDisplayName).toBe("Greg (mailbox)");

    const b = buildSenderSignatureViewModel(makeMailbox(), fallback);
    expect(b.resolvedDisplayName).toBe("Bidlow Client");

    const c = buildSenderSignatureViewModel(makeMailbox(), {
      senderDisplayNameFallback: null,
      emailSignatureFallback: null,
    });
    expect(c.resolvedDisplayName).toBe("sender@example.com");
  });

  it("surfaces sync error through the view model", () => {
    const vm = buildSenderSignatureViewModel(
      makeMailbox({ senderSignatureSyncError: "Permission denied" }),
      fallback,
    );
    expect(vm.syncError).toBe("Permission denied");
  });
});

describe("chooseSignatureForSend", () => {
  const fallback = {
    senderDisplayNameFallback: "Bidlow",
    emailSignatureFallback: "Brief signature",
  };

  it("picks mailbox text over brief", () => {
    const sel = chooseSignatureForSend({
      mailbox: makeMailbox({
        senderSignatureText: "Mailbox signature",
        senderSignatureSource: "manual",
        senderDisplayName: "Greg",
      }),
      clientBrief: fallback,
    });
    expect(sel.emailSignatureText).toBe("Mailbox signature");
    expect(sel.source).toBe("manual");
    expect(sel.senderDisplayName).toBe("Greg");
  });

  it("converts mailbox HTML to text when no text is stored", () => {
    const sel = chooseSignatureForSend({
      mailbox: makeMailbox({
        senderSignatureHtml: "<div>Greg</div><div>Bidlow</div>",
        senderSignatureSource: "gmail_send_as",
      }),
      clientBrief: fallback,
    });
    expect(sel.emailSignatureText).toBe("Greg\nBidlow");
    expect(sel.source).toBe("gmail_send_as");
  });

  it("falls back to brief when mailbox is empty", () => {
    const sel = chooseSignatureForSend({
      mailbox: makeMailbox(),
      clientBrief: fallback,
    });
    expect(sel.emailSignatureText).toBe("Brief signature");
    expect(sel.source).toBe("client_brief_fallback");
  });

  it("reports unsupported_provider for Microsoft when nothing is set anywhere", () => {
    const sel = chooseSignatureForSend({
      mailbox: makeMailbox({ provider: "MICROSOFT" }),
      clientBrief: {
        senderDisplayNameFallback: null,
        emailSignatureFallback: null,
      },
    });
    expect(sel.emailSignatureText).toBeNull();
    expect(sel.source).toBe("unsupported_provider");
  });

  it("reports missing for Google when nothing is set anywhere", () => {
    const sel = chooseSignatureForSend({
      mailbox: makeMailbox({ provider: "GOOGLE" }),
      clientBrief: {
        senderDisplayNameFallback: null,
        emailSignatureFallback: null,
      },
    });
    expect(sel.emailSignatureText).toBeNull();
    expect(sel.source).toBe("missing");
  });
});
