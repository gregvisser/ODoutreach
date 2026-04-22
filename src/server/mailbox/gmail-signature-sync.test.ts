import { describe, expect, it } from "vitest";

import {
  fetchGmailSendAsForToken,
  selectSendAsFromPayload,
} from "./gmail-signature-sync";

describe("selectSendAsFromPayload", () => {
  it("prefers the exact mailbox-email match", () => {
    const result = selectSendAsFromPayload(
      {
        sendAs: [
          {
            sendAsEmail: "primary@example.com",
            displayName: "Primary Inbox",
            signature: "<div>Primary</div>",
            isDefault: true,
            isPrimary: true,
          },
          {
            sendAsEmail: "outreach@example.com",
            displayName: "Outreach Sender",
            signature: "<div>Greg Visser</div><div>Bidlow</div>",
          },
        ],
      },
      "outreach@example.com",
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.matchedEmail).toBe("outreach@example.com");
    expect(result.selection).toBe("exact_match");
    expect(result.displayName).toBe("Outreach Sender");
    expect(result.signatureText).toBe("Greg Visser\nBidlow");
    expect(result.signatureHtml).toContain("Greg Visser");
  });

  it("falls back to the default entry when no exact match exists", () => {
    const result = selectSendAsFromPayload(
      {
        sendAs: [
          { sendAsEmail: "shared@example.com", isDefault: true, signature: "<div>Shared</div>" },
        ],
      },
      "different@example.com",
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.selection).toBe("default");
    expect(result.signatureText).toBe("Shared");
  });

  it("falls back to the primary entry when no default exists", () => {
    const result = selectSendAsFromPayload(
      {
        sendAs: [
          { sendAsEmail: "shared@example.com", isPrimary: true, signature: "" },
        ],
      },
      "different@example.com",
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.selection).toBe("primary");
    expect(result.signatureHtml).toBeNull();
    expect(result.signatureText).toBeNull();
  });

  it("returns no_sendas_match when nothing matches", () => {
    const result = selectSendAsFromPayload({ sendAs: [] }, "x@example.com");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("no_sendas_match");
  });

  it("tolerates missing signatures", () => {
    const result = selectSendAsFromPayload(
      {
        sendAs: [
          {
            sendAsEmail: "hi@example.com",
            displayName: "Hi",
            isPrimary: true,
          },
        ],
      },
      "hi@example.com",
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.signatureHtml).toBeNull();
    expect(result.signatureText).toBeNull();
  });
});

describe("fetchGmailSendAsForToken", () => {
  function mockFetch(res: Partial<Response> & { json?: () => Promise<unknown>; text?: () => Promise<string> }): typeof fetch {
    return (async () =>
      ({
        ok: res.ok ?? false,
        status: res.status ?? 500,
        json: res.json ?? (async () => ({})),
        text: res.text ?? (async () => ""),
      }) as Response) as unknown as typeof fetch;
  }

  it("maps 403 to scope_missing with an operator hint", async () => {
    const result = await fetchGmailSendAsForToken({
      accessToken: "tok",
      mailboxEmail: "a@example.com",
      fetchImpl: mockFetch({
        ok: false,
        status: 403,
        text: async () => "forbidden",
      }),
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("scope_missing");
    expect(result.message).toMatch(/Gmail settings permission/);
  });

  it("maps other HTTP errors to http_error", async () => {
    const result = await fetchGmailSendAsForToken({
      accessToken: "tok",
      mailboxEmail: "a@example.com",
      fetchImpl: mockFetch({ ok: false, status: 500, text: async () => "boom" }),
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("http_error");
  });

  it("parses a happy-path response", async () => {
    const result = await fetchGmailSendAsForToken({
      accessToken: "tok",
      mailboxEmail: "outreach@example.com",
      fetchImpl: mockFetch({
        ok: true,
        status: 200,
        json: async () => ({
          sendAs: [
            {
              sendAsEmail: "outreach@example.com",
              displayName: "Outreach",
              signature: "<div>Greg</div>",
              isDefault: false,
              isPrimary: false,
            },
          ],
        }),
      }),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.matchedEmail).toBe("outreach@example.com");
    expect(result.signatureText).toBe("Greg");
  });
});
