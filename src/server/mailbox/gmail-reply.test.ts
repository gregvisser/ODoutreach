import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  buildReplyRfc5322PlainTextEmail,
  sendGmailReply,
} from "./gmail-reply";

const ORIGINAL_FETCH = globalThis.fetch;

function mockFetch(response: {
  status: number;
  body?: string;
}): ReturnType<typeof vi.fn> {
  return vi.fn(async () =>
    new Response(response.body ?? "", { status: response.status }),
  ) as unknown as ReturnType<typeof vi.fn>;
}

describe("buildReplyRfc5322PlainTextEmail", () => {
  it("wraps a bare message id in angle brackets for In-Reply-To", () => {
    const raw = buildReplyRfc5322PlainTextEmail({
      from: "sender@bidlow.co.uk",
      to: "contact@example.com",
      subject: "Re: Hello",
      bodyText: "Thanks!",
      inReplyToMessageId: "abc@mail.example.com",
    });
    expect(raw).toContain("In-Reply-To: <abc@mail.example.com>");
    expect(raw).toContain("References: <abc@mail.example.com>");
    expect(raw.endsWith("Thanks!")).toBe(true);
  });

  it("keeps existing angle brackets and preserves caller-provided references", () => {
    const raw = buildReplyRfc5322PlainTextEmail({
      from: "a@b.co",
      to: "c@d.co",
      subject: "Re: Hi",
      bodyText: "ok",
      inReplyToMessageId: "<x@mail>",
      referencesMessageIds: ["<w@mail>", "x@mail"],
    });
    expect(raw).toContain("In-Reply-To: <x@mail>");
    expect(raw).toContain("References: <w@mail> <x@mail>");
  });

  it("omits threading headers when no ids are supplied", () => {
    const raw = buildReplyRfc5322PlainTextEmail({
      from: "a@b.co",
      to: "c@d.co",
      subject: "Re: Hi",
      bodyText: "ok",
    });
    expect(raw).not.toContain("In-Reply-To:");
    expect(raw).not.toContain("References:");
  });
});

describe("sendGmailReply", () => {
  beforeEach(() => {
    (globalThis as unknown as { fetch: typeof fetch }).fetch = ORIGINAL_FETCH;
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("posts raw + threadId and returns provider id on success", async () => {
    const fetchMock = mockFetch({
      status: 200,
      body: JSON.stringify({ id: "1234", threadId: "thr-1" }),
    });
    (globalThis as unknown as { fetch: typeof fetch }).fetch =
      fetchMock as unknown as typeof fetch;

    const result = await sendGmailReply({
      accessToken: "tok",
      rfc5322Message: "From: a\nTo: b\n\nhi",
      threadId: "thr-1",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.providerMessageId).toBe("gmail:1234");
      expect(result.providerName).toBe("google_gmail");
    }
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse((init.body as string) ?? "{}") as {
      raw: string;
      threadId?: string;
    };
    expect(body.threadId).toBe("thr-1");
    expect(typeof body.raw).toBe("string");
    expect(body.raw.length).toBeGreaterThan(0);
  });

  it("omits threadId from the request when not provided", async () => {
    const fetchMock = mockFetch({
      status: 200,
      body: JSON.stringify({ id: "5678" }),
    });
    (globalThis as unknown as { fetch: typeof fetch }).fetch =
      fetchMock as unknown as typeof fetch;

    await sendGmailReply({
      accessToken: "tok",
      rfc5322Message: "From: a\nTo: b\n\nhi",
    });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse((init.body as string) ?? "{}") as Record<
      string,
      unknown
    >;
    expect(body).not.toHaveProperty("threadId");
  });

  it("maps 403 to a gmail.send scope error", async () => {
    (globalThis as unknown as { fetch: typeof fetch }).fetch = mockFetch({
      status: 403,
      body: "forbidden",
    }) as unknown as typeof fetch;

    const result = await sendGmailReply({
      accessToken: "tok",
      rfc5322Message: "x",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("403");
      expect(result.error).toMatch(/gmail\.send/);
    }
  });

  it("maps 404 when the thread is gone", async () => {
    (globalThis as unknown as { fetch: typeof fetch }).fetch = mockFetch({
      status: 404,
      body: '{"error":{"message":"Requested entity was not found."}}',
    }) as unknown as typeof fetch;

    const result = await sendGmailReply({
      accessToken: "tok",
      rfc5322Message: "x",
      threadId: "missing",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("404");
    }
  });
});
