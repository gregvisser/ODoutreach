import { afterEach, describe, expect, it, vi } from "vitest";

import { sendMicrosoftGraphSendMail } from "./microsoft-graph-sendmail";

describe("sendMicrosoftGraphSendMail", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns success on 202 from Graph", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(null, { status: 202 }),
      ),
    );
    const r = await sendMicrosoftGraphSendMail({
      accessToken: "t",
      to: "a@b.co",
      subject: "s",
      bodyText: "b",
      correlationId: "corr-1",
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.providerMessageId).toBe("msgraph:sendmail:corr-1");
      expect(r.providerName).toBe("microsoft_graph");
    }
  });

  it("omits singleValueExtendedProperties when no list-unsubscribe URL is supplied", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 202 }));
    vi.stubGlobal("fetch", fetchMock);

    await sendMicrosoftGraphSendMail({
      accessToken: "t",
      to: "a@b.co",
      subject: "s",
      bodyText: "b",
      correlationId: "corr-x",
    });

    const body = JSON.parse(String(fetchMock.mock.calls[0][1].body)) as {
      message: Record<string, unknown>;
    };
    expect(body.message.subject).toBe("s");
    expect(body.message.toRecipients).toEqual([
      { emailAddress: { address: "a@b.co" } },
    ]);
    expect(body.message).not.toHaveProperty("singleValueExtendedProperties");
  });

  it("emits String 0x1045 extended property for List-Unsubscribe URL", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 202 }));
    vi.stubGlobal("fetch", fetchMock);

    await sendMicrosoftGraphSendMail({
      accessToken: "t",
      to: "a@b.co",
      subject: "s",
      bodyText: "b",
      correlationId: "corr-h",
      options: {
        listUnsubscribeUrl: "https://opensdoors.bidlow.co.uk/unsubscribe/abc",
      },
    });

    const body = JSON.parse(String(fetchMock.mock.calls[0][1].body)) as {
      message: {
        singleValueExtendedProperties?: Array<{ id: string; value: string }>;
      };
    };
    expect(body.message.singleValueExtendedProperties).toEqual([
      {
        id: "String 0x1045",
        value: "<https://opensdoors.bidlow.co.uk/unsubscribe/abc>",
      },
    ]);
  });

  it("ignores malformed list-unsubscribe URLs (mailto / CRLF / empty)", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 202 }));
    vi.stubGlobal("fetch", fetchMock);

    for (const bad of [
      "mailto:unsubscribe@example.com",
      "not a url",
      "",
      "https://example.com/u\r\nX-Evil: 1",
    ]) {
      fetchMock.mockClear();
      await sendMicrosoftGraphSendMail({
        accessToken: "t",
        to: "a@b.co",
        subject: "s",
        bodyText: "b",
        correlationId: "corr-bad",
        options: { listUnsubscribeUrl: bad },
      });
      const body = JSON.parse(String(fetchMock.mock.calls[0][1].body)) as {
        message: Record<string, unknown>;
      };
      expect(body.message).not.toHaveProperty("singleValueExtendedProperties");
    }
  });

  it("returns failure for 403 (e.g. missing Mail.Send)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response("nope", { status: 403, statusText: "Forbidden" }),
      ),
    );
    const r = await sendMicrosoftGraphSendMail({
      accessToken: "t",
      to: "a@b.co",
      subject: "s",
      bodyText: "b",
      correlationId: "corr-2",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe("403");
    }
  });
});
