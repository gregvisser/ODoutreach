import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  inboundReply: {
    findFirst: vi.fn(),
    create: vi.fn(),
  },
  outboundEmail: {
    findFirst: vi.fn(),
    update: vi.fn(),
  },
}));

const stopFollowUpsMock = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ enrollmentsStopped: 0 }),
);

vi.mock("@/lib/db", () => ({
  prisma: prismaMock,
}));

vi.mock("@/lib/normalize", () => ({
  normalizeEmail: (e: string) => e.toLowerCase().trim(),
}));

vi.mock("@/server/email/outbound/lifecycle", () => ({
  canApplyReplyMilestone: (status: string) =>
    !["BLOCKED_SUPPRESSION", "BOUNCED", "FAILED"].includes(status),
}));

vi.mock("@/server/email-sequences/stop-follow-ups-on-reply", () => ({
  stopFollowUpsForLinkedReply: stopFollowUpsMock,
}));

import { processSyncedMessageForReply } from "./process-synced-replies";

const BASE_INPUT = {
  clientId: "c1",
  mailboxIdentityId: "mbx1",
  providerMessageId: "msg-inbound-1",
  fromEmail: "contact@example.com",
  toEmail: "staff@bidlow.co.uk",
  subject: "Re: Hello",
  snippet: "Thanks for reaching out",
  bodyPreview: "Thanks for reaching out, I'd love to chat.",
  receivedAt: new Date("2026-05-14T12:00:00Z"),
  conversationId: "conv-abc",
  inReplyToHeader: "<outbound-msg-id@mail.gmail.com>",
};

describe("processSyncedMessageForReply", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stopFollowUpsMock.mockResolvedValue({ enrollmentsStopped: 0 });
  });

  it("links definitively by rfc822 Message-ID (BY_THREAD_REF)", async () => {
    prismaMock.inboundReply.findFirst.mockResolvedValue(null);
    // First findFirst = rfc822MessageId lookup → returns the outbound.
    prismaMock.outboundEmail.findFirst.mockResolvedValue({
      id: "ob-thread",
      contactId: "ct-thread",
      status: "SENT",
    });
    prismaMock.inboundReply.create.mockResolvedValue({ id: "reply-thread" });

    const result = await processSyncedMessageForReply(BASE_INPUT);

    expect(result.created).toBe(true);
    // The definitive lookup is keyed on rfc822MessageId == In-Reply-To value.
    expect(prismaMock.outboundEmail.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          clientId: "c1",
          rfc822MessageId: "<outbound-msg-id@mail.gmail.com>",
        }),
      }),
    );
    expect(prismaMock.inboundReply.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        matchMethod: "BY_THREAD_REF",
        linkedOutboundEmailId: "ob-thread",
        inReplyToProviderId: "<outbound-msg-id@mail.gmail.com>",
      }),
    });
  });

  it("calls stopFollowUpsForLinkedReply for the matched outbound (PR #137)", async () => {
    prismaMock.inboundReply.findFirst.mockResolvedValue(null);
    prismaMock.outboundEmail.findFirst.mockResolvedValue({
      id: "ob-stop",
      contactId: "ct-stop",
      status: "SENT",
    });
    prismaMock.inboundReply.create.mockResolvedValue({ id: "reply-stop" });

    await processSyncedMessageForReply(BASE_INPUT);

    expect(stopFollowUpsMock).toHaveBeenCalledWith({
      clientId: "c1",
      outboundEmailId: "ob-stop",
    });
  });

  it("does not call stopFollowUpsForLinkedReply when no outbound matched", async () => {
    prismaMock.inboundReply.findFirst.mockResolvedValue(null);
    prismaMock.outboundEmail.findFirst.mockResolvedValue(null);

    await processSyncedMessageForReply(BASE_INPUT);

    expect(stopFollowUpsMock).not.toHaveBeenCalled();
  });

  it("does not call stopFollowUpsForLinkedReply when reply is a duplicate", async () => {
    prismaMock.inboundReply.findFirst.mockResolvedValue({ id: "existing" });

    await processSyncedMessageForReply(BASE_INPUT);

    expect(stopFollowUpsMock).not.toHaveBeenCalled();
  });

  it("falls back to contact-email match for legacy sends (BY_CONTACT_EMAIL)", async () => {
    prismaMock.inboundReply.findFirst.mockResolvedValue(null);
    // No rfc822 Message-ID match (legacy send), then the contact-email fallback hits.
    prismaMock.outboundEmail.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "ob1", contactId: "ct1", status: "SENT" });
    prismaMock.inboundReply.create.mockResolvedValue({ id: "reply1" });

    const result = await processSyncedMessageForReply(BASE_INPUT);

    expect(result.created).toBe(true);
    expect(result.replyId).toBe("reply1");
    expect(prismaMock.inboundReply.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        clientId: "c1",
        contactId: "ct1",
        linkedOutboundEmailId: "ob1",
        providerMessageId: "msg-inbound-1",
        fromEmail: "contact@example.com",
        matchMethod: "BY_CONTACT_EMAIL",
        ingestionSource: "mailbox_sync",
      }),
    });
  });

  it("legacy fallback only matches outbounds with no stamped Message-ID", async () => {
    prismaMock.inboundReply.findFirst.mockResolvedValue(null);
    prismaMock.outboundEmail.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "ob-legacy", contactId: "ct1", status: "SENT" });
    prismaMock.inboundReply.create.mockResolvedValue({ id: "reply-legacy" });

    await processSyncedMessageForReply(BASE_INPUT);

    // The fallback query must constrain rfc822MessageId to null so modern sends
    // are never loosely linked by an unrelated thread reply.
    expect(prismaMock.outboundEmail.findFirst).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          clientId: "c1",
          mailboxIdentityId: "mbx1",
          toEmail: "contact@example.com",
          rfc822MessageId: null,
        }),
      }),
    );
  });

  it("updates outbound status to REPLIED for SENT outbound", async () => {
    prismaMock.inboundReply.findFirst.mockResolvedValue(null);
    prismaMock.outboundEmail.findFirst.mockResolvedValue({
      id: "ob1",
      contactId: "ct1",
      status: "SENT",
    });
    prismaMock.inboundReply.create.mockResolvedValue({ id: "reply1" });

    await processSyncedMessageForReply(BASE_INPUT);

    expect(prismaMock.outboundEmail.update).toHaveBeenCalledWith({
      where: { id: "ob1" },
      data: { status: "REPLIED" },
    });
  });

  it("updates outbound status to REPLIED for DELIVERED outbound", async () => {
    prismaMock.inboundReply.findFirst.mockResolvedValue(null);
    prismaMock.outboundEmail.findFirst.mockResolvedValue({
      id: "ob2",
      contactId: "ct2",
      status: "DELIVERED",
    });
    prismaMock.inboundReply.create.mockResolvedValue({ id: "reply2" });

    await processSyncedMessageForReply(BASE_INPUT);

    expect(prismaMock.outboundEmail.update).toHaveBeenCalledWith({
      where: { id: "ob2" },
      data: { status: "REPLIED" },
    });
  });

  it("does not update outbound status if already REPLIED", async () => {
    prismaMock.inboundReply.findFirst.mockResolvedValue(null);
    prismaMock.outboundEmail.findFirst.mockResolvedValue({
      id: "ob3",
      contactId: "ct3",
      status: "REPLIED",
    });
    prismaMock.inboundReply.create.mockResolvedValue({ id: "reply3" });

    await processSyncedMessageForReply(BASE_INPUT);

    expect(prismaMock.outboundEmail.update).toHaveBeenCalledWith({
      where: { id: "ob3" },
      data: { status: "REPLIED" },
    });
  });

  it("does not update BOUNCED outbound to REPLIED", async () => {
    prismaMock.inboundReply.findFirst.mockResolvedValue(null);
    prismaMock.outboundEmail.findFirst.mockResolvedValue({
      id: "ob4",
      contactId: "ct4",
      status: "BOUNCED",
    });
    prismaMock.inboundReply.create.mockResolvedValue({ id: "reply4" });

    await processSyncedMessageForReply(BASE_INPUT);

    expect(prismaMock.outboundEmail.update).not.toHaveBeenCalled();
  });

  it("skips if InboundReply already exists for this providerMessageId", async () => {
    prismaMock.inboundReply.findFirst.mockResolvedValue({ id: "existing" });

    const result = await processSyncedMessageForReply(BASE_INPUT);

    expect(result.created).toBe(false);
    expect(prismaMock.outboundEmail.findFirst).not.toHaveBeenCalled();
    expect(prismaMock.inboundReply.create).not.toHaveBeenCalled();
  });

  it("skips if no matching outbound email found", async () => {
    prismaMock.inboundReply.findFirst.mockResolvedValue(null);
    prismaMock.outboundEmail.findFirst.mockResolvedValue(null);

    const result = await processSyncedMessageForReply(BASE_INPUT);

    expect(result.created).toBe(false);
    expect(prismaMock.inboundReply.create).not.toHaveBeenCalled();
  });

  it("does not create unlinked reply for random inbox mail", async () => {
    prismaMock.inboundReply.findFirst.mockResolvedValue(null);
    prismaMock.outboundEmail.findFirst.mockResolvedValue(null);

    const result = await processSyncedMessageForReply({
      ...BASE_INPUT,
      fromEmail: "random-sender@unknown.com",
    });

    expect(result.created).toBe(false);
    expect(prismaMock.inboundReply.create).not.toHaveBeenCalled();
  });

  it("skips a fresh email — no In-Reply-To AND subject doesn't look like a reply", async () => {
    const result = await processSyncedMessageForReply({
      ...BASE_INPUT,
      inReplyToHeader: null,
      subject: "Quick intro from Acme", // not Re:/Fwd:/etc.
    });

    expect(result.created).toBe(false);
    // Gate fires before any DB work.
    expect(prismaMock.inboundReply.findFirst).not.toHaveBeenCalled();
    expect(prismaMock.outboundEmail.findFirst).not.toHaveBeenCalled();
    expect(prismaMock.inboundReply.create).not.toHaveBeenCalled();
    expect(stopFollowUpsMock).not.toHaveBeenCalled();
  });

  it("skips an empty In-Reply-To when subject also isn't a reply", async () => {
    const result = await processSyncedMessageForReply({
      ...BASE_INPUT,
      inReplyToHeader: "",
      subject: "Hello from Acme",
    });

    expect(result.created).toBe(false);
    expect(prismaMock.inboundReply.findFirst).not.toHaveBeenCalled();
    expect(prismaMock.outboundEmail.findFirst).not.toHaveBeenCalled();
  });

  it("links by subject 'Re:' when In-Reply-To header is missing (Microsoft Graph case)", async () => {
    // Microsoft Graph's list-messages endpoint silently omits
    // internetMessageHeaders even when $select'd. We fall back to the
    // subject prefix + the existing contact-email match.
    prismaMock.inboundReply.findFirst.mockResolvedValue(null);
    // BY_THREAD_REF is skipped (no In-Reply-To) — only the fallback runs.
    prismaMock.outboundEmail.findFirst.mockResolvedValueOnce({
      id: "ob-graph",
      contactId: "ct-graph",
      status: "SENT",
    });
    prismaMock.inboundReply.create.mockResolvedValue({ id: "reply-graph" });

    const result = await processSyncedMessageForReply({
      ...BASE_INPUT,
      inReplyToHeader: null,
      subject: "Re: Our intro email",
    });

    expect(result.created).toBe(true);
    expect(prismaMock.inboundReply.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        matchMethod: "BY_CONTACT_EMAIL",
        linkedOutboundEmailId: "ob-graph",
        inReplyToProviderId: null, // we had no In-Reply-To value to store
      }),
    });
  });

  it("recognises non-English reply prefixes (Sv:, Aw:, Tr:, Fwd:, etc.)", async () => {
    for (const subject of ["Sv: Hi", "AW: Frage", "Tr: Bonjour", "Fwd: heads up"]) {
      prismaMock.inboundReply.findFirst.mockResolvedValue(null);
      prismaMock.outboundEmail.findFirst.mockResolvedValueOnce({
        id: "ob",
        contactId: "ct",
        status: "SENT",
      });
      prismaMock.inboundReply.create.mockResolvedValue({ id: "reply" });

      const result = await processSyncedMessageForReply({
        ...BASE_INPUT,
        inReplyToHeader: null,
        subject,
      });
      expect(result.created).toBe(true);
    }
  });

  it("matches outbound by mailboxIdentityId scope (legacy fallback)", async () => {
    prismaMock.inboundReply.findFirst.mockResolvedValue(null);
    prismaMock.outboundEmail.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "ob5", contactId: "ct5", status: "DELIVERED" });
    prismaMock.inboundReply.create.mockResolvedValue({ id: "reply5" });

    await processSyncedMessageForReply(BASE_INPUT);

    expect(prismaMock.outboundEmail.findFirst).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          clientId: "c1",
          mailboxIdentityId: "mbx1",
          toEmail: "contact@example.com",
          sentAt: { not: null, lte: BASE_INPUT.receivedAt },
          status: { in: ["SENT", "DELIVERED", "REPLIED"] },
          rfc822MessageId: null,
        }),
        orderBy: { sentAt: "desc" },
      }),
    );
  });

  it("does not match outbound from different mailbox", async () => {
    prismaMock.inboundReply.findFirst.mockResolvedValue(null);
    prismaMock.outboundEmail.findFirst.mockResolvedValue(null);

    const result = await processSyncedMessageForReply({
      ...BASE_INPUT,
      mailboxIdentityId: "mbx-other",
    });

    expect(result.created).toBe(false);
    expect(prismaMock.outboundEmail.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          mailboxIdentityId: "mbx-other",
        }),
      }),
    );
  });

  it("normalizes email before matching (legacy fallback)", async () => {
    prismaMock.inboundReply.findFirst.mockResolvedValue(null);
    prismaMock.outboundEmail.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "ob6", contactId: "ct6", status: "SENT" });
    prismaMock.inboundReply.create.mockResolvedValue({ id: "reply6" });

    await processSyncedMessageForReply({
      ...BASE_INPUT,
      fromEmail: "  CONTACT@Example.COM  ",
    });

    expect(prismaMock.outboundEmail.findFirst).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          toEmail: "contact@example.com",
        }),
      }),
    );
  });
});
