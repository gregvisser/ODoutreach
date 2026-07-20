import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { fetchGmailInboundMessageFullBody } from "./gmail-message-body";

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function jsonResponse(body: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => body };
}

/** Base64url-encoded body part, as Gmail returns it. */
function b64(text: string): string {
  return Buffer.from(text, "utf8").toString("base64url");
}

describe("fetchGmailInboundMessageFullBody — input guards", () => {
  it("refuses an empty access token without calling Gmail", async () => {
    const result = await fetchGmailInboundMessageFullBody({
      accessToken: "",
      providerMessageId: "abc",
    });

    expect(result).toEqual({
      ok: false,
      error: "Missing access token",
      errorCode: "no_token",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses an empty message id without calling Gmail", async () => {
    const result = await fetchGmailInboundMessageFullBody({
      accessToken: "token",
      providerMessageId: "",
    });

    expect(result).toEqual({
      ok: false,
      error: "Missing providerMessageId",
      errorCode: "no_message_id",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("fetchGmailInboundMessageFullBody — request shape", () => {
  it("requests the full format with a bearer token", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ id: "abc", payload: { mimeType: "text/plain" } }),
    );

    await fetchGmailInboundMessageFullBody({
      accessToken: "tok-123",
      providerMessageId: "abc",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("https://gmail.googleapis.com/gmail/v1/users/me/messages/abc");
    expect(url).toContain("format=full");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tok-123");
  });

  it("url-encodes a message id containing unsafe characters", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ id: "a/b", payload: {} }));

    await fetchGmailInboundMessageFullBody({
      accessToken: "tok",
      providerMessageId: "a/b+c",
    });

    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toContain("a%2Fb%2Bc");
  });
});

describe("fetchGmailInboundMessageFullBody — provider errors", () => {
  it("surfaces the Gmail error message and code on an HTTP failure", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ error: { code: 404, message: "Not Found" } }, false, 404),
    );

    expect(
      await fetchGmailInboundMessageFullBody({
        accessToken: "tok",
        providerMessageId: "missing",
      }),
    ).toEqual({
      ok: false,
      error: "Gmail message fetch failed: Not Found",
      errorCode: "gmail_404",
    });
  });

  it("falls back to a generic code when Gmail supplies no error code", async () => {
    fetchMock.mockResolvedValue(jsonResponse({}, false, 500));

    expect(
      await fetchGmailInboundMessageFullBody({
        accessToken: "tok",
        providerMessageId: "abc",
      }),
    ).toEqual({
      ok: false,
      error: "Gmail message fetch failed: Gmail message fetch failed",
      errorCode: "gmail_http_error",
    });
  });

  it("treats an unparseable error body as an HTTP error rather than throwing", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 502,
      json: async () => {
        throw new Error("invalid json");
      },
    });

    const result = await fetchGmailInboundMessageFullBody({
      accessToken: "tok",
      providerMessageId: "abc",
    });

    expect(result.ok).toBe(false);
    expect(result).toMatchObject({ errorCode: "gmail_http_error" });
  });

  it("rejects a success response that carries no message id", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ payload: { mimeType: "text/plain" } }));

    expect(
      await fetchGmailInboundMessageFullBody({
        accessToken: "tok",
        providerMessageId: "abc",
      }),
    ).toEqual({
      ok: false,
      error: "Gmail returned no message",
      errorCode: "gmail_empty_response",
    });
  });
});

describe("fetchGmailInboundMessageFullBody — success", () => {
  it("returns the normalized plain-text body", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        id: "msg-1",
        payload: {
          mimeType: "text/plain",
          body: { data: b64("Thanks, not interested.") },
        },
      }),
    );

    const result = await fetchGmailInboundMessageFullBody({
      accessToken: "tok",
      providerMessageId: "msg-1",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.providerMessageId).toBe("msg-1");
    expect(result.normalized.text).toContain("Thanks, not interested.");
    expect(result.normalized.contentType).toBe("text");
  });

  it("returns the id Gmail reported, not the one requested", async () => {
    // Gmail is the authority on the canonical id; trusting our input would
    // silently mislink a reply if the two ever diverge.
    fetchMock.mockResolvedValue(
      jsonResponse({
        id: "canonical-id",
        payload: { mimeType: "text/plain", body: { data: b64("hi") } },
      }),
    );

    const result = await fetchGmailInboundMessageFullBody({
      accessToken: "tok",
      providerMessageId: "requested-id",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.providerMessageId).toBe("canonical-id");
  });

  it("still succeeds when the message has no usable body", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ id: "msg-2", payload: {} }));

    const result = await fetchGmailInboundMessageFullBody({
      accessToken: "tok",
      providerMessageId: "msg-2",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.normalized.contentType).toBe("empty");
  });
});
