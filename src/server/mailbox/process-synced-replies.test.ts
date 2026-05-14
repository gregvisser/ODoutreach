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
};

describe("processSyncedMessageForReply", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stopFollowUpsMock.mockResolvedValue({ enrollmentsStopped: 0 });
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

  it("creates InboundReply linked to outbound when contact email matches", async () => {
    prismaMock.inboundReply.findFirst.mockResolvedValue(null);
    prismaMock.outboundEmail.findFirst.mockResolvedValue({
      id: "ob1",
      contactId: "ct1",
      status: "SENT",
    });
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

  it("matches outbound by mailboxIdentityId scope", async () => {
    prismaMock.inboundReply.findFirst.mockResolvedValue(null);
    prismaMock.outboundEmail.findFirst.mockResolvedValue({
      id: "ob5",
      contactId: "ct5",
      status: "DELIVERED",
    });
    prismaMock.inboundReply.create.mockResolvedValue({ id: "reply5" });

    await processSyncedMessageForReply(BASE_INPUT);

    expect(prismaMock.outboundEmail.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          clientId: "c1",
          mailboxIdentityId: "mbx1",
          toEmail: "contact@example.com",
          sentAt: { not: null },
          status: { in: ["SENT", "DELIVERED", "REPLIED"] },
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

  it("normalizes email before matching", async () => {
    prismaMock.inboundReply.findFirst.mockResolvedValue(null);
    prismaMock.outboundEmail.findFirst.mockResolvedValue({
      id: "ob6",
      contactId: "ct6",
      status: "SENT",
    });
    prismaMock.inboundReply.create.mockResolvedValue({ id: "reply6" });

    await processSyncedMessageForReply({
      ...BASE_INPUT,
      fromEmail: "  CONTACT@Example.COM  ",
    });

    expect(prismaMock.outboundEmail.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          toEmail: "contact@example.com",
        }),
      }),
    );
  });
});
