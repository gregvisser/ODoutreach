import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * PR #137 — `loadClientLinkedReplyDetail` tests.
 *
 * Verifies:
 *   * Returns null for empty args.
 *   * Returns null when the reply has no link (matchMethod=UNLINKED or
 *     linkedOutboundEmailId=null).
 *   * Returns null when the reply belongs to a different client (FK miss).
 *   * Returns null when the linkedOutbound has no mailbox row.
 *   * Returns the full DTO with mailbox / sequence / enrolment context
 *     when all relationships line up.
 *   * Correlates an InboundMailboxMessage by (clientId, mailboxIdentityId,
 *     providerMessageId) so staff can deep-link to the existing reply form.
 *   * Does not call any prisma mutators.
 */

const prismaMock = vi.hoisted(() => ({
  inboundReply: { findFirst: vi.fn() },
  inboundMailboxMessage: { findFirst: vi.fn() },
}));

vi.mock("@/lib/db", () => ({
  prisma: prismaMock,
}));

import { loadClientLinkedReplyDetail } from "./client-linked-reply-detail";

function baseRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "reply-1",
    fromEmail: "prospect@corp.com",
    toEmail: "adam@client.com",
    subject: "Re: Hello",
    snippet: "Thanks!",
    bodyPreview: "Thanks for reaching out!",
    receivedAt: new Date("2026-05-13T10:00:00Z"),
    matchMethod: "BY_CONTACT_EMAIL",
    ingestionSource: "mailbox_sync",
    providerMessageId: "msg-1",
    handledAt: null,
    handledByStaffUserId: null,
    handledByStaff: null,
    contact: {
      id: "ct-1",
      fullName: "Jane Doe",
      email: "prospect@corp.com",
      isSuppressed: false,
    },
    linkedOutbound: {
      id: "ob-1",
      clientId: "c1",
      subject: "Original intro",
      sentAt: new Date("2026-05-10T09:00:00Z"),
      status: "REPLIED",
      mailboxIdentityId: "mbx-adam",
      mailbox: {
        id: "mbx-adam",
        email: "adam@client.com",
        displayName: "Adam",
        provider: "MICROSOFT",
        connectionStatus: "CONNECTED",
      },
      sequenceStepSends: [
        {
          enrollment: {
            id: "enr-1",
            status: "COMPLETED",
            completedAt: new Date("2026-05-13T10:00:00Z"),
            pausedAt: null,
            sequence: { id: "seq-1", name: "Q2 outreach" },
          },
        },
      ],
    },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.inboundMailboxMessage.findFirst.mockResolvedValue({
    id: "ibm-1",
  });
});

describe("loadClientLinkedReplyDetail", () => {
  it("returns null for empty clientId", async () => {
    const result = await loadClientLinkedReplyDetail({
      clientId: "",
      replyId: "reply-1",
    });
    expect(result).toBeNull();
    expect(prismaMock.inboundReply.findFirst).not.toHaveBeenCalled();
  });

  it("returns null for empty replyId", async () => {
    const result = await loadClientLinkedReplyDetail({
      clientId: "c1",
      replyId: "",
    });
    expect(result).toBeNull();
  });

  it("scopes the query to clientId, matchMethod ≠ UNLINKED, linked outbound NOT NULL", async () => {
    prismaMock.inboundReply.findFirst.mockResolvedValue(null);

    await loadClientLinkedReplyDetail({
      clientId: "c1",
      replyId: "reply-1",
    });

    const call = prismaMock.inboundReply.findFirst.mock.calls[0]![0]!;
    expect(call.where.id).toBe("reply-1");
    expect(call.where.clientId).toBe("c1");
    expect(call.where.matchMethod).toEqual({ not: "UNLINKED" });
    expect(call.where.linkedOutboundEmailId).toEqual({ not: null });
  });

  it("returns null when the reply is not found / not linked", async () => {
    prismaMock.inboundReply.findFirst.mockResolvedValue(null);
    const result = await loadClientLinkedReplyDetail({
      clientId: "c1",
      replyId: "missing",
    });
    expect(result).toBeNull();
  });

  it("returns null when the linkedOutbound belongs to another client", async () => {
    prismaMock.inboundReply.findFirst.mockResolvedValue(
      baseRow({
        linkedOutbound: {
          ...baseRow().linkedOutbound,
          clientId: "OTHER",
        },
      }),
    );

    const result = await loadClientLinkedReplyDetail({
      clientId: "c1",
      replyId: "reply-1",
    });
    expect(result).toBeNull();
  });

  it("returns null when the linkedOutbound has no mailbox row", async () => {
    prismaMock.inboundReply.findFirst.mockResolvedValue(
      baseRow({
        linkedOutbound: {
          ...baseRow().linkedOutbound,
          mailbox: null,
        },
      }),
    );

    const result = await loadClientLinkedReplyDetail({
      clientId: "c1",
      replyId: "reply-1",
    });
    expect(result).toBeNull();
  });

  it("returns the full DTO with mailbox + sequence + enrolment context", async () => {
    prismaMock.inboundReply.findFirst.mockResolvedValue(baseRow());

    const result = await loadClientLinkedReplyDetail({
      clientId: "c1",
      replyId: "reply-1",
    });

    expect(result).not.toBeNull();
    expect(result!.reply.subject).toBe("Re: Hello");
    expect(result!.contact.fullName).toBe("Jane Doe");
    expect(result!.linkedOutbound.id).toBe("ob-1");
    expect(result!.mailbox.email).toBe("adam@client.com");
    expect(result!.sequence?.name).toBe("Q2 outreach");
    expect(result!.enrollment?.status).toBe("COMPLETED");
    expect(result!.inboundMailboxMessageId).toBe("ibm-1");
  });

  it("row 132 — an untouched reply reports no handled state", async () => {
    prismaMock.inboundReply.findFirst.mockResolvedValue(baseRow());

    const result = await loadClientLinkedReplyDetail({
      clientId: "c1",
      replyId: "reply-1",
    });

    expect(result?.handledAt).toBeNull();
    expect(result?.handledByName).toBeNull();
    expect(result?.handledByStaffUserId).toBeNull();
  });

  it("row 132 — surfaces who handled it and when, falling back to email when no display name", async () => {
    const handledAt = new Date("2026-08-31T09:00:00Z");
    prismaMock.inboundReply.findFirst.mockResolvedValue(
      baseRow({
        handledAt,
        handledByStaffUserId: "staff-sarah",
        handledByStaff: { displayName: null, email: "sarah@opensdoors.co.uk" },
      }),
    );

    const result = await loadClientLinkedReplyDetail({
      clientId: "c1",
      replyId: "reply-1",
    });

    expect(result?.handledAt).toEqual(handledAt);
    expect(result?.handledByName).toBe("sarah@opensdoors.co.uk");
    expect(result?.handledByStaffUserId).toBe("staff-sarah");
  });

  it("returns null inboundMailboxMessageId when no correlated message exists", async () => {
    prismaMock.inboundReply.findFirst.mockResolvedValue(baseRow());
    prismaMock.inboundMailboxMessage.findFirst.mockResolvedValue(null);

    const result = await loadClientLinkedReplyDetail({
      clientId: "c1",
      replyId: "reply-1",
    });

    expect(result?.inboundMailboxMessageId).toBeNull();
  });

  it("does not look up an InboundMailboxMessage when providerMessageId is missing", async () => {
    prismaMock.inboundReply.findFirst.mockResolvedValue(
      baseRow({ providerMessageId: null }),
    );

    await loadClientLinkedReplyDetail({
      clientId: "c1",
      replyId: "reply-1",
    });

    expect(prismaMock.inboundMailboxMessage.findFirst).not.toHaveBeenCalled();
  });

  it("row 150 — falls back to the correlated mailbox message's own handled signal when InboundReply.handledAt is unset (desync fix)", async () => {
    // Mirrors the real failure: an operator marked the conversation handled
    // from the message-detail page (`markInboundMailboxMessageHandled`),
    // which only ever writes `InboundMailboxMessage.metadata.handling`, not
    // `InboundReply.handledAt`. Before row 150 this loader read
    // `reply.handledAt` only, so the reply-detail page kept showing
    // "Unclaimed" with live Claim/Mark-handled buttons for an already-closed
    // conversation — the exact desync that let a second operator send a
    // genuine duplicate reply.
    prismaMock.inboundReply.findFirst.mockResolvedValue(baseRow());
    prismaMock.inboundMailboxMessage.findFirst.mockResolvedValue({
      id: "ibm-1",
      metadata: {
        handling: {
          handledAt: "2026-08-31T09:00:00.000Z",
          handledByStaffUserId: "staff-bob",
        },
      },
    });

    const result = await loadClientLinkedReplyDetail({
      clientId: "c1",
      replyId: "reply-1",
    });

    expect(result?.handledAt).toEqual(new Date("2026-08-31T09:00:00.000Z"));
  });

  it("row 150 — InboundReply.handledAt still wins when both signals are set", async () => {
    const replyHandledAt = new Date("2026-08-30T08:00:00Z");
    prismaMock.inboundReply.findFirst.mockResolvedValue(
      baseRow({ handledAt: replyHandledAt, handledByStaffUserId: "staff-sarah" }),
    );
    prismaMock.inboundMailboxMessage.findFirst.mockResolvedValue({
      id: "ibm-1",
      metadata: {
        handling: { handledAt: "2026-08-31T09:00:00.000Z" },
      },
    });

    const result = await loadClientLinkedReplyDetail({
      clientId: "c1",
      replyId: "reply-1",
    });

    expect(result?.handledAt).toEqual(replyHandledAt);
  });

  it("returns null enrolment + sequence when no step-sends are attached", async () => {
    prismaMock.inboundReply.findFirst.mockResolvedValue(
      baseRow({
        linkedOutbound: {
          ...baseRow().linkedOutbound,
          sequenceStepSends: [],
        },
      }),
    );

    const result = await loadClientLinkedReplyDetail({
      clientId: "c1",
      replyId: "reply-1",
    });
    expect(result?.sequence).toBeNull();
    expect(result?.enrollment).toBeNull();
  });
});
