import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { sendMicrosoftGraphReply } from "./microsoft-graph-reply";

const ORIGINAL_FETCH = globalThis.fetch;

function mockFetch(response: {
  status: number;
  body?: string;
}): ReturnType<typeof vi.fn> {
  return vi.fn(async () =>
    new Response(response.body ?? "", { status: response.status }),
  ) as unknown as ReturnType<typeof vi.fn>;
}

describe("sendMicrosoftGraphReply", () => {
  beforeEach(() => {
    (globalThis as unknown as { fetch: typeof fetch }).fetch = ORIGINAL_FETCH;
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns ok with a stable correlation id on 202", async () => {
    const fetchMock = mockFetch({ status: 202 });
    (globalThis as unknown as { fetch: typeof fetch }).fetch =
      fetchMock as unknown as typeof fetch;

    const result = await sendMicrosoftGraphReply({
      accessToken: "tok",
      mailboxUserPrincipalName: "mailbox@test.dev",
      providerMessageId: "msg-1",
      bodyText: "Thanks!",
      correlationId: "corr-1",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.providerMessageId).toBe("msgraph:reply:corr-1");
      expect(result.providerName).toBe("microsoft_graph");
    }
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/users/mailbox%40test.dev/messages/msg-1/reply");
    expect(init.method).toBe("POST");
    const body = JSON.parse((init.body as string) ?? "{}") as {
      comment: string;
    };
    expect(body.comment).toBe("Thanks!");
    expect((init.headers as Record<string, string>).Authorization).toBe(
      "Bearer tok",
    );
  });

  it("encodes the providerMessageId safely in the path", async () => {
    const fetchMock = mockFetch({ status: 202 });
    (globalThis as unknown as { fetch: typeof fetch }).fetch =
      fetchMock as unknown as typeof fetch;

    await sendMicrosoftGraphReply({
      accessToken: "tok",
      mailboxUserPrincipalName: "mailbox@test.dev",
      providerMessageId: "AAMkAD/with spaces+slash",
      bodyText: "x",
      correlationId: "c",
    });
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toContain("AAMkAD%2Fwith%20spaces%2Bslash");
    expect(url).not.toContain(" ");
  });

  it("maps 404 to a 'message not found' error", async () => {
    (globalThis as unknown as { fetch: typeof fetch }).fetch = mockFetch({
      status: 404,
      body: '{"error":{"code":"ErrorItemNotFound"}}',
    }) as unknown as typeof fetch;

    const result = await sendMicrosoftGraphReply({
      accessToken: "tok",
      mailboxUserPrincipalName: "mailbox@test.dev",
      providerMessageId: "missing",
      bodyText: "x",
      correlationId: "c",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("404");
      expect(result.error).toMatch(/not found/i);
    }
  });

  it("maps 403 to a Mail.Send consent hint", async () => {
    (globalThis as unknown as { fetch: typeof fetch }).fetch = mockFetch({
      status: 403,
      body: "forbidden",
    }) as unknown as typeof fetch;

    const result = await sendMicrosoftGraphReply({
      accessToken: "tok",
      mailboxUserPrincipalName: "mailbox@test.dev",
      providerMessageId: "m",
      bodyText: "x",
      correlationId: "c",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("403");
      expect(result.error).toMatch(/Mail\.Send/);
    }
  });

  it("maps 429 throttling", async () => {
    (globalThis as unknown as { fetch: typeof fetch }).fetch = mockFetch({
      status: 429,
      body: "throttled",
    }) as unknown as typeof fetch;

    const result = await sendMicrosoftGraphReply({
      accessToken: "tok",
      mailboxUserPrincipalName: "mailbox@test.dev",
      providerMessageId: "m",
      bodyText: "x",
      correlationId: "c",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("429");
      expect(result.error).toMatch(/throttled/i);
    }
  });
});
