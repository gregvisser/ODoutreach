import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Row 150 — `loadInboundMessageDetailForClient` tests.
 *
 * Row 132 taught the two aggregate reply views (`replies-needing-a-person.ts`,
 * `client-outreach-replies.ts`) to OR `InboundReply.handledAt` together with
 * the older `InboundMailboxMessage.metadata.handling.handledAt` signal. This
 * loader — which feeds the message-detail page an operator can send a real
 * reply from — was never taught the same trick: it read the mailbox-message
 * metadata only, so a reply already marked "handled" from the reply-detail
 * page still showed "Unhandled" here with a live Send-reply button. Real
 * duplicate-send risk to a prospect.
 *
 * These tests prove the fold: when `InboundReply.handledAt` is set but the
 * message's own metadata has no handling block, this loader must still
 * report `handling.handledAt` as set.
 */

const prismaMock = vi.hoisted(() => ({
  inboundMailboxMessage: { findFirst: vi.fn() },
  clientMailboxIdentity: { findFirst: vi.fn() },
  outboundEmail: { findMany: vi.fn() },
  inboundReply: { findFirst: vi.fn() },
}));

vi.mock("@/lib/db", () => ({
  prisma: prismaMock,
}));

import { loadInboundMessageDetailForClient } from "./inbound-message-detail";

function baseMessage(overrides: Record<string, unknown> = {}) {
  return {
    id: "ibm-1",
    clientId: "c1",
    mailboxIdentityId: "mbx-1",
    providerMessageId: "prov-msg-1",
    fromEmail: "prospect@corp.com",
    toEmail: "adam@client.com",
    subject: "Re: Hello",
    snippet: "Thanks!",
    bodyPreview: "Thanks for reaching out!",
    receivedAt: new Date("2026-08-30T10:00:00Z"),
    metadata: {},
    ...overrides,
  };
}

function baseMailbox() {
  return {
    id: "mbx-1",
    email: "adam@client.com",
    displayName: "Adam",
    provider: "MICROSOFT",
    connectionStatus: "CONNECTED",
    canSend: true,
    isSendingEnabled: true,
    isActive: true,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.clientMailboxIdentity.findFirst.mockResolvedValue(baseMailbox());
  prismaMock.outboundEmail.findMany.mockResolvedValue([]);
  prismaMock.inboundReply.findFirst.mockResolvedValue(null);
});

describe("loadInboundMessageDetailForClient", () => {
  it("returns null for empty clientId/messageId", async () => {
    expect(
      await loadInboundMessageDetailForClient("", "ibm-1"),
    ).toBeNull();
    expect(
      await loadInboundMessageDetailForClient("c1", ""),
    ).toBeNull();
  });

  it("returns null when the message does not belong to the client", async () => {
    prismaMock.inboundMailboxMessage.findFirst.mockResolvedValue(null);
    const result = await loadInboundMessageDetailForClient("c1", "ibm-1");
    expect(result).toBeNull();
  });

  it("returns null when the mailbox row is missing", async () => {
    prismaMock.inboundMailboxMessage.findFirst.mockResolvedValue(baseMessage());
    prismaMock.clientMailboxIdentity.findFirst.mockResolvedValue(null);
    const result = await loadInboundMessageDetailForClient("c1", "ibm-1");
    expect(result).toBeNull();
  });

  it("reports unhandled when neither signal is set", async () => {
    prismaMock.inboundMailboxMessage.findFirst.mockResolvedValue(baseMessage());

    const result = await loadInboundMessageDetailForClient("c1", "ibm-1");

    expect(result?.handling.handledAt).toBeNull();
  });

  it("reports handled from its own metadata when set directly", async () => {
    prismaMock.inboundMailboxMessage.findFirst.mockResolvedValue(
      baseMessage({
        metadata: {
          handling: { handledAt: "2026-08-30T11:00:00.000Z" },
        },
      }),
    );

    const result = await loadInboundMessageDetailForClient("c1", "ibm-1");

    expect(result?.handling.handledAt).toBe("2026-08-30T11:00:00.000Z");
  });

  it("row 150 — falls back to the correlated InboundReply's handledAt when the message's own metadata has no handling block (desync fix)", async () => {
    // Mirrors the real failure: an operator marked the conversation handled
    // from the reply-detail page (`markInboundReplyHandled`), which only
    // ever writes `InboundReply.handledAt`, never this message's own
    // metadata. Before row 150 this loader ignored that signal entirely, so
    // the message-detail page kept showing "Unhandled" with a live
    // Send-reply button for a conversation the reply-detail page already
    // closed out.
    prismaMock.inboundMailboxMessage.findFirst.mockResolvedValue(baseMessage());
    prismaMock.inboundReply.findFirst.mockResolvedValue({
      id: "reply-1",
      linkedOutboundEmailId: "ob-1",
      matchMethod: "BY_CONTACT_EMAIL",
      handledAt: new Date("2026-08-31T09:00:00Z"),
    });

    const result = await loadInboundMessageDetailForClient("c1", "ibm-1");

    expect(result?.handling.handledAt).toBe("2026-08-31T09:00:00.000Z");
  });

  it("row 150 — the message's own metadata signal wins when both are set", async () => {
    prismaMock.inboundMailboxMessage.findFirst.mockResolvedValue(
      baseMessage({
        metadata: {
          handling: { handledAt: "2026-08-30T11:00:00.000Z" },
        },
      }),
    );
    prismaMock.inboundReply.findFirst.mockResolvedValue({
      id: "reply-1",
      linkedOutboundEmailId: "ob-1",
      matchMethod: "BY_CONTACT_EMAIL",
      handledAt: new Date("2026-08-31T09:00:00Z"),
    });

    const result = await loadInboundMessageDetailForClient("c1", "ibm-1");

    expect(result?.handling.handledAt).toBe("2026-08-30T11:00:00.000Z");
  });

  it("does not look up an InboundReply when the message has no providerMessageId", async () => {
    prismaMock.inboundMailboxMessage.findFirst.mockResolvedValue(
      baseMessage({ providerMessageId: null }),
    );

    await loadInboundMessageDetailForClient("c1", "ibm-1");

    expect(prismaMock.inboundReply.findFirst).not.toHaveBeenCalled();
  });
});
