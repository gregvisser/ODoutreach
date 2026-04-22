import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * PR P — tests for `fetchInboundMessageFullBody` that verify tenant
 * scoping, provider routing, and cache persistence. All external
 * dependencies (prisma, OAuth token helpers, provider HTTP fetches)
 * are mocked via `vi.hoisted` so the assertions remain focused on
 * behaviour.
 */
const {
  inboundFindFirst,
  mailboxFindFirst,
  inboundUpdate,
  requireAccess,
  getMsToken,
  getGoogleToken,
  fetchMs,
  fetchGmail,
} = vi.hoisted(() => ({
  inboundFindFirst: vi.fn(),
  mailboxFindFirst: vi.fn(),
  inboundUpdate: vi.fn(),
  requireAccess: vi.fn().mockResolvedValue(undefined),
  getMsToken: vi.fn().mockResolvedValue("ms-access"),
  getGoogleToken: vi.fn().mockResolvedValue("gm-access"),
  fetchMs: vi.fn(),
  fetchGmail: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    inboundMailboxMessage: {
      findFirst: inboundFindFirst,
      update: inboundUpdate,
    },
    clientMailboxIdentity: { findFirst: mailboxFindFirst },
  },
}));

vi.mock("@/server/tenant/access", () => ({
  requireClientAccess: requireAccess,
}));

vi.mock("@/server/mailbox/microsoft-mailbox-access", () => ({
  getMicrosoftGraphAccessTokenForMailbox: getMsToken,
}));
vi.mock("@/server/mailbox/google-mailbox-access", () => ({
  getGoogleGmailAccessTokenForMailbox: getGoogleToken,
}));
vi.mock("@/server/mailbox/microsoft-graph-message-body", () => ({
  fetchMicrosoftInboundMessageFullBody: fetchMs,
}));
vi.mock("@/server/mailbox/gmail-message-body", () => ({
  fetchGmailInboundMessageFullBody: fetchGmail,
}));

import { fetchInboundMessageFullBody } from "./fetch-inbound-message-full-body";

const STAFF = { id: "staff-1" } as unknown as import("@/generated/prisma/client").StaffUser;

describe("fetchInboundMessageFullBody (PR P)", () => {
  beforeEach(() => {
    inboundFindFirst.mockReset();
    mailboxFindFirst.mockReset();
    inboundUpdate.mockReset();
    requireAccess.mockClear();
    getMsToken.mockClear();
    getGoogleToken.mockClear();
    fetchMs.mockReset();
    fetchGmail.mockReset();
  });

  it("returns INBOUND_NOT_FOUND when message does not belong to the client", async () => {
    inboundFindFirst.mockResolvedValue(null);
    const res = await fetchInboundMessageFullBody({
      staff: STAFF,
      clientId: "client-a",
      inboundMessageId: "msg-x",
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.errorCode).toBe("INBOUND_NOT_FOUND");
    expect(requireAccess).toHaveBeenCalledWith(STAFF, "client-a");
    expect(inboundFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "msg-x", clientId: "client-a" },
      }),
    );
    expect(inboundUpdate).not.toHaveBeenCalled();
  });

  it("returns MAILBOX_NOT_CONNECTED when mailbox is disconnected", async () => {
    inboundFindFirst.mockResolvedValue({
      id: "m1",
      mailboxIdentityId: "mb1",
      providerMessageId: "pm1",
    });
    mailboxFindFirst.mockResolvedValue({
      id: "mb1",
      provider: "MICROSOFT",
      connectionStatus: "DISCONNECTED",
      email: "ops@acme.test",
    });
    const res = await fetchInboundMessageFullBody({
      staff: STAFF,
      clientId: "client-a",
      inboundMessageId: "m1",
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.errorCode).toBe("MAILBOX_NOT_CONNECTED");
    expect(fetchMs).not.toHaveBeenCalled();
    expect(inboundUpdate).not.toHaveBeenCalled();
  });

  it("fetches + persists Microsoft full body when connected", async () => {
    inboundFindFirst.mockResolvedValue({
      id: "m1",
      mailboxIdentityId: "mb1",
      providerMessageId: "pm1",
    });
    mailboxFindFirst.mockResolvedValue({
      id: "mb1",
      provider: "MICROSOFT",
      connectionStatus: "CONNECTED",
      email: "ops@acme.test",
    });
    fetchMs.mockResolvedValue({
      ok: true,
      providerMessageId: "pm1",
      normalized: {
        text: "Hello Greg",
        contentType: "text",
        size: 10,
        truncated: false,
      },
      rawContentType: "text",
    });

    const res = await fetchInboundMessageFullBody({
      staff: STAFF,
      clientId: "client-a",
      inboundMessageId: "m1",
    });

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.bodyText).toBe("Hello Greg");
      expect(res.fullBodySource).toBe("MICROSOFT_GRAPH");
      expect(res.bodyContentType).toBe("text");
      expect(res.fullBodySize).toBe(10);
    }
    expect(getMsToken).toHaveBeenCalledWith("mb1");
    expect(fetchMs).toHaveBeenCalledWith(
      expect.objectContaining({
        accessToken: "ms-access",
        providerMessageId: "pm1",
      }),
    );
    expect(inboundUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "m1" },
        data: expect.objectContaining({
          bodyText: "Hello Greg",
          bodyContentType: "text",
          fullBodySize: 10,
          fullBodySource: "MICROSOFT_GRAPH",
          fullBodyFetchedAt: expect.any(Date),
        }),
      }),
    );
  });

  it("routes GOOGLE provider through Gmail fetch helper", async () => {
    inboundFindFirst.mockResolvedValue({
      id: "m2",
      mailboxIdentityId: "mb2",
      providerMessageId: "pm2",
    });
    mailboxFindFirst.mockResolvedValue({
      id: "mb2",
      provider: "GOOGLE",
      connectionStatus: "CONNECTED",
      email: "replies@opensdoors.co",
    });
    fetchGmail.mockResolvedValue({
      ok: true,
      providerMessageId: "pm2",
      normalized: {
        text: "Thanks for reaching out.",
        contentType: "text",
        size: 23,
        truncated: false,
      },
    });

    const res = await fetchInboundMessageFullBody({
      staff: STAFF,
      clientId: "client-a",
      inboundMessageId: "m2",
    });

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.fullBodySource).toBe("GMAIL_API");
      expect(res.bodyText).toContain("Thanks");
    }
    expect(getGoogleToken).toHaveBeenCalledWith("mb2");
    expect(fetchMs).not.toHaveBeenCalled();
    expect(inboundUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          fullBodySource: "GMAIL_API",
        }),
      }),
    );
  });

  it("returns EMPTY_BODY and does not persist when provider returns blank text", async () => {
    inboundFindFirst.mockResolvedValue({
      id: "m3",
      mailboxIdentityId: "mb1",
      providerMessageId: "pm3",
    });
    mailboxFindFirst.mockResolvedValue({
      id: "mb1",
      provider: "MICROSOFT",
      connectionStatus: "CONNECTED",
      email: "ops@acme.test",
    });
    fetchMs.mockResolvedValue({
      ok: true,
      providerMessageId: "pm3",
      normalized: { text: "   ", contentType: "empty", size: 0, truncated: false },
      rawContentType: null,
    });

    const res = await fetchInboundMessageFullBody({
      staff: STAFF,
      clientId: "client-a",
      inboundMessageId: "m3",
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.errorCode).toBe("EMPTY_BODY");
    expect(inboundUpdate).not.toHaveBeenCalled();
  });

  it("propagates provider errors without persisting", async () => {
    inboundFindFirst.mockResolvedValue({
      id: "m4",
      mailboxIdentityId: "mb1",
      providerMessageId: "pm4",
    });
    mailboxFindFirst.mockResolvedValue({
      id: "mb1",
      provider: "MICROSOFT",
      connectionStatus: "CONNECTED",
      email: "ops@acme.test",
    });
    fetchMs.mockResolvedValue({
      ok: false,
      error: "Graph says no.",
      errorCode: "ErrorItemNotFound",
    });
    const res = await fetchInboundMessageFullBody({
      staff: STAFF,
      clientId: "client-a",
      inboundMessageId: "m4",
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.errorCode).toBe("ErrorItemNotFound");
    expect(inboundUpdate).not.toHaveBeenCalled();
  });

  it("PR Q — classifies Microsoft ErrorItemNotFound as message_not_available", async () => {
    inboundFindFirst.mockResolvedValue({
      id: "m5",
      mailboxIdentityId: "mb1",
      providerMessageId: "pm5",
    });
    mailboxFindFirst.mockResolvedValue({
      id: "mb1",
      provider: "MICROSOFT",
      connectionStatus: "CONNECTED",
      email: "ops@acme.test",
    });
    fetchMs.mockResolvedValue({
      ok: false,
      error:
        "Graph message fetch failed: The specified object was not found in the store.",
      errorCode: "ErrorItemNotFound",
    });

    const res = await fetchInboundMessageFullBody({
      staff: STAFF,
      clientId: "client-a",
      inboundMessageId: "m5",
    });

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.errorCode).toBe("ErrorItemNotFound");
      expect(res.category).toBe("message_not_available");
      expect(res.retryable).toBe(false);
      expect(res.title).toMatch(/no longer available/i);
      expect(res.error).toMatch(/moved or deleted/i);
      expect(res.error).not.toContain("The specified object was not found");
    }
    expect(inboundUpdate).not.toHaveBeenCalled();
  });

  it("PR Q — classifies Gmail 404 as message_not_available", async () => {
    inboundFindFirst.mockResolvedValue({
      id: "m6",
      mailboxIdentityId: "mb2",
      providerMessageId: "pm6",
    });
    mailboxFindFirst.mockResolvedValue({
      id: "mb2",
      provider: "GOOGLE",
      connectionStatus: "CONNECTED",
      email: "replies@opensdoors.co",
    });
    fetchGmail.mockResolvedValue({
      ok: false,
      error: "Gmail message fetch failed: Requested entity was not found.",
      errorCode: "gmail_404",
    });

    const res = await fetchInboundMessageFullBody({
      staff: STAFF,
      clientId: "client-a",
      inboundMessageId: "m6",
    });

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.category).toBe("message_not_available");
      expect(res.retryable).toBe(false);
    }
    expect(inboundUpdate).not.toHaveBeenCalled();
  });

  it("PR Q — classifies Microsoft auth errors as provider_auth_error", async () => {
    inboundFindFirst.mockResolvedValue({
      id: "m7",
      mailboxIdentityId: "mb1",
      providerMessageId: "pm7",
    });
    mailboxFindFirst.mockResolvedValue({
      id: "mb1",
      provider: "MICROSOFT",
      connectionStatus: "CONNECTED",
      email: "ops@acme.test",
    });
    fetchMs.mockResolvedValue({
      ok: false,
      error: "Graph message fetch failed: Access token has expired.",
      errorCode: "InvalidAuthenticationToken",
    });

    const res = await fetchInboundMessageFullBody({
      staff: STAFF,
      clientId: "client-a",
      inboundMessageId: "m7",
    });

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.category).toBe("provider_auth_error");
      expect(res.retryable).toBe(false);
      expect(res.title).toMatch(/reconnect/i);
    }
    expect(inboundUpdate).not.toHaveBeenCalled();
  });
});
