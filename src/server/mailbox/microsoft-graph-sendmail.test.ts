import { afterEach, describe, expect, it, vi } from "vitest";

import {
  isMicrosoftMimeSendEnabled,
  sendMicrosoftGraphMimeSendMail,
  sendMicrosoftGraphSendMail,
} from "./microsoft-graph-sendmail";
import { buildRfc5322PlainTextEmail } from "./gmail-sendmail";

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
      mailboxUserPrincipalName: "sender@tenant.test",
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
      mailboxUserPrincipalName: "sender@tenant.test",
      to: "a@b.co",
      subject: "s",
      bodyText: "b",
      correlationId: "corr-x",
    });

    const [reqUrl] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(reqUrl).toContain("/users/sender%40tenant.test/sendMail");

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
      mailboxUserPrincipalName: "sender@tenant.test",
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

  it("sends HTML body with clean unsubscribe anchor when supplied", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 202 }));
    vi.stubGlobal("fetch", fetchMock);

    await sendMicrosoftGraphSendMail({
      accessToken: "t",
      mailboxUserPrincipalName: "sender@tenant.test",
      to: "a@b.co",
      subject: "s",
      bodyText: "Body\n\n---\nUnsubscribe: https://example.com/u/raw",
      bodyHtml: '<p>Body</p><p><a href="https://example.com/u/raw">Unsubscribe</a></p>',
      correlationId: "corr-html",
      options: {
        listUnsubscribeUrl: "https://example.com/u/raw",
      },
    });

    const body = JSON.parse(String(fetchMock.mock.calls[0][1].body)) as {
      message: { body: { contentType: string; content: string } };
    };
    expect(body.message.body.contentType).toBe("HTML");
    expect(body.message.body.content).toContain(">Unsubscribe</a>");
    expect(body.message.body.content).not.toContain("Unsubscribe: https://example.com/u/raw");
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
        mailboxUserPrincipalName: "sender@tenant.test",
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
      mailboxUserPrincipalName: "sender@tenant.test",
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

describe("isMicrosoftMimeSendEnabled", () => {
  const prev = process.env.MICROSOFT_MIME_SEND;
  afterEach(() => {
    if (prev === undefined) delete process.env.MICROSOFT_MIME_SEND;
    else process.env.MICROSOFT_MIME_SEND = prev;
  });
  it("is off unless explicitly set to 'on'", () => {
    delete process.env.MICROSOFT_MIME_SEND;
    expect(isMicrosoftMimeSendEnabled()).toBe(false);
    process.env.MICROSOFT_MIME_SEND = "true";
    expect(isMicrosoftMimeSendEnabled()).toBe(false);
    process.env.MICROSOFT_MIME_SEND = "on";
    expect(isMicrosoftMimeSendEnabled()).toBe(true);
  });
});

describe("sendMicrosoftGraphMimeSendMail", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("POSTs base64 MIME as text/plain and returns success on 202", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 202 }));
    vi.stubGlobal("fetch", fetchMock);

    // Build a real multipart MIME the same way the send path does.
    const mime = buildRfc5322PlainTextEmail({
      from: "sender@tenant.test",
      to: "a@b.co",
      subject: "Hello",
      bodyText: "Plain body\nUnsubscribe: https://x.co/u",
      bodyHtml: '<p>Body</p><p><a href="https://x.co/u">Unsubscribe</a></p>',
      extraHeaders: [
        { name: "List-Unsubscribe", value: "<https://x.co/u>" },
        { name: "List-Unsubscribe-Post", value: "List-Unsubscribe=One-Click" },
      ],
    });

    const r = await sendMicrosoftGraphMimeSendMail({
      accessToken: "t",
      mailboxUserPrincipalName: "sender@tenant.test",
      rfc5322Message: mime,
      correlationId: "corr-mime",
    });

    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.providerMessageId).toBe("msgraph:mime:corr-mime");
      expect(r.providerName).toBe("microsoft_graph");
    }

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/users/sender%40tenant.test/sendMail");
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe(
      "text/plain",
    );
    // Body is base64 that decodes back to the exact MIME — a real text/plain
    // part alongside the HTML, plus true one-click unsubscribe headers.
    const decoded = Buffer.from(String(init.body), "base64").toString("utf8");
    expect(decoded).toBe(mime);
    expect(decoded).toContain("Content-Type: multipart/alternative");
    expect(decoded).toContain("Content-Type: text/plain; charset=UTF-8");
    expect(decoded).toContain("Content-Type: text/html; charset=UTF-8");
    expect(decoded).toContain("List-Unsubscribe: <https://x.co/u>");
    expect(decoded).toContain(
      "List-Unsubscribe-Post: List-Unsubscribe=One-Click",
    );
  });

  it("returns failure for 403", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("nope", { status: 403 })),
    );
    const r = await sendMicrosoftGraphMimeSendMail({
      accessToken: "t",
      mailboxUserPrincipalName: "sender@tenant.test",
      rfc5322Message: "From: a@b.co\r\n\r\nx",
      correlationId: "corr-403",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("403");
  });
});
