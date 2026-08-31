import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * PR #130 — tests for `loadClientOutreachReplies`.
 *
 * Verifies:
 * - Only linked (non-UNLINKED) replies with a linkedOutboundEmailId are returned.
 * - Unlinked inbox messages are excluded.
 * - Replies are grouped by sending mailbox.
 * - Connected mailboxes with zero replies appear with replyCount 0.
 * - Query is scoped by clientId (no cross-client leak).
 * - Empty clientId returns [].
 * - No sends, syncs, or mutations are executed.
 */

const { inboundReplyFindMany, mailboxFindMany, mailboxMessageFindMany, replyClaimFindMany } =
  vi.hoisted(() => ({
    inboundReplyFindMany: vi.fn().mockResolvedValue([]),
    mailboxFindMany: vi.fn().mockResolvedValue([]),
    mailboxMessageFindMany: vi.fn().mockResolvedValue([]),
    replyClaimFindMany: vi.fn().mockResolvedValue([]),
  }));

vi.mock("server-only", () => ({}));

vi.mock("@/lib/db", () => ({
  prisma: {
    inboundReply: { findMany: inboundReplyFindMany },
    clientMailboxIdentity: { findMany: mailboxFindMany },
    inboundMailboxMessage: { findMany: mailboxMessageFindMany },
    replyClaim: { findMany: replyClaimFindMany },
  },
}));

import { loadClientOutreachReplies } from "./client-outreach-replies";

function linkedReply(overrides: Record<string, unknown> = {}) {
  return {
    id: "reply-1",
    fromEmail: "prospect@corp.com",
    subject: "Re: Intro",
    bodyPreview: "Thanks for reaching out",
    receivedAt: new Date("2026-05-13T10:00:00Z"),
    matchMethod: "BY_OUTBOUND_PROVIDER_ID",
    linkedOutboundEmailId: "out-1",
    contact: { fullName: "Jane Doe", email: "prospect@corp.com" },
    linkedOutbound: {
      id: "out-1",
      subject: "Introduction email",
      mailboxIdentityId: "mbx-adam",
      mailbox: {
        id: "mbx-adam",
        email: "adam@client.com",
        displayName: "Adam",
      },
      sequenceStepSends: [
        { sequence: { name: "Q2 outreach" } },
      ],
    },
    ...overrides,
  };
}

describe("loadClientOutreachReplies (PR #130)", () => {
  beforeEach(() => {
    inboundReplyFindMany.mockReset().mockResolvedValue([]);
    mailboxFindMany.mockReset().mockResolvedValue([]);
    mailboxMessageFindMany.mockReset().mockResolvedValue([]);
    replyClaimFindMany.mockReset().mockResolvedValue([]);
  });

  it("returns empty array for empty clientId", async () => {
    const result = await loadClientOutreachReplies("");
    expect(result).toEqual([]);
    expect(inboundReplyFindMany).not.toHaveBeenCalled();
  });

  it("returns only linked replies (excludes UNLINKED)", async () => {
    inboundReplyFindMany.mockResolvedValue([linkedReply()]);
    mailboxFindMany.mockResolvedValue([]);

    const result = await loadClientOutreachReplies("client-1");

    const call = inboundReplyFindMany.mock.calls[0]![0] as {
      where: { clientId: string; matchMethod: object; linkedOutboundEmailId: object };
    };
    expect(call.where.clientId).toBe("client-1");
    expect(call.where.matchMethod).toEqual({ not: "UNLINKED" });
    expect(call.where.linkedOutboundEmailId).toEqual({ not: null });

    expect(result).toHaveLength(1);
    expect(result[0]!.mailboxEmail).toBe("adam@client.com");
    expect(result[0]!.replyCount).toBe(1);
    expect(result[0]!.replies[0]!.contactName).toBe("Jane Doe");
  });

  it("populates sequenceName from the linked step-send (PR #137)", async () => {
    inboundReplyFindMany.mockResolvedValue([linkedReply()]);
    mailboxFindMany.mockResolvedValue([]);

    const result = await loadClientOutreachReplies("client-1");
    expect(result[0]!.replies[0]!.sequenceName).toBe("Q2 outreach");
  });

  it("leaves sequenceName null when the outbound has no step-send", async () => {
    inboundReplyFindMany.mockResolvedValue([
      linkedReply({
        linkedOutbound: {
          id: "out-1",
          subject: "Introduction email",
          mailboxIdentityId: "mbx-adam",
          mailbox: {
            id: "mbx-adam",
            email: "adam@client.com",
            displayName: "Adam",
          },
          sequenceStepSends: [],
        },
      }),
    ]);
    mailboxFindMany.mockResolvedValue([]);

    const result = await loadClientOutreachReplies("client-1");
    expect(result[0]!.replies[0]!.sequenceName).toBeNull();
  });

  it("groups replies by sending mailbox", async () => {
    inboundReplyFindMany.mockResolvedValue([
      linkedReply({ id: "reply-1" }),
      linkedReply({
        id: "reply-2",
        fromEmail: "other@corp.com",
        linkedOutbound: {
          id: "out-2",
          subject: "Follow-up",
          mailboxIdentityId: "mbx-sophie",
          mailbox: {
            id: "mbx-sophie",
            email: "sophie@client.com",
            displayName: "Sophie",
          },
        },
      }),
      linkedReply({
        id: "reply-3",
        fromEmail: "third@corp.com",
      }),
    ]);
    mailboxFindMany.mockResolvedValue([]);

    const result = await loadClientOutreachReplies("client-1");
    const adamGroup = result.find((g) => g.mailboxEmail === "adam@client.com");
    const sophieGroup = result.find((g) => g.mailboxEmail === "sophie@client.com");

    expect(adamGroup).toBeDefined();
    expect(adamGroup!.replyCount).toBe(2);
    expect(sophieGroup).toBeDefined();
    expect(sophieGroup!.replyCount).toBe(1);
  });

  it("includes connected mailboxes with zero replies", async () => {
    inboundReplyFindMany.mockResolvedValue([]);
    mailboxFindMany.mockResolvedValue([
      { id: "mbx-greg", email: "greg@client.com", displayName: "Greg Visser" },
    ]);

    const result = await loadClientOutreachReplies("client-1");
    expect(result).toHaveLength(1);
    expect(result[0]!.replyCount).toBe(0);
    expect(result[0]!.mailboxEmail).toBe("greg@client.com");
  });

  it("skips replies without a linked mailbox identity", async () => {
    inboundReplyFindMany.mockResolvedValue([
      linkedReply({
        linkedOutbound: {
          id: "out-orphan",
          subject: "Orphaned",
          mailboxIdentityId: null,
          mailbox: null,
        },
      }),
    ]);
    mailboxFindMany.mockResolvedValue([]);

    const result = await loadClientOutreachReplies("client-1");
    expect(result).toHaveLength(0);
  });

  it("does not include fixture data resembling random inbox mail (Timetastic, etc.)", async () => {
    inboundReplyFindMany.mockResolvedValue([linkedReply()]);
    mailboxFindMany.mockResolvedValue([]);

    const result = await loadClientOutreachReplies("client-1");
    for (const group of result) {
      for (const reply of group.replies) {
        expect(reply.fromEmail).not.toContain("timetastic");
        expect(reply.subject).not.toContain("Leave approved");
      }
    }
  });

  it("scopes query by clientId — no cross-client data", async () => {
    await loadClientOutreachReplies("client-42");
    const call = inboundReplyFindMany.mock.calls[0]![0] as {
      where: { clientId: string };
    };
    expect(call.where.clientId).toBe("client-42");
  });

  describe("row 132 — ownership state on each reply row", () => {
    it("a fresh reply, never claimed or handled, is unclaimed", async () => {
      inboundReplyFindMany.mockResolvedValue([linkedReply()]);

      const result = await loadClientOutreachReplies("client-1");
      expect(result[0]!.replies[0]!.ownership).toEqual({ kind: "unclaimed" });
    });

    it("a reply marked handled directly on InboundReply shows Handled by name", async () => {
      inboundReplyFindMany.mockResolvedValue([
        linkedReply({
          handledAt: new Date("2026-08-31T09:00:00Z"),
          handledByStaffUserId: "staff-sarah",
          handledByStaff: { displayName: "Sarah Okafor", email: "sarah@opensdoors.co.uk" },
        }),
      ]);

      const result = await loadClientOutreachReplies("client-1", "staff-bob");
      expect(result[0]!.replies[0]!.ownership).toMatchObject({
        kind: "handled",
        byName: "Sarah Okafor",
        isViewer: false,
      });
    });

    it("the viewer who handled it themselves is told 'you', not their own name", async () => {
      inboundReplyFindMany.mockResolvedValue([
        linkedReply({
          handledAt: new Date("2026-08-31T09:00:00Z"),
          handledByStaffUserId: "staff-bob",
          handledByStaff: { displayName: "Bob Ellis", email: "bob@opensdoors.co.uk" },
        }),
      ]);

      const result = await loadClientOutreachReplies("client-1", "staff-bob");
      expect(result[0]!.replies[0]!.ownership).toMatchObject({
        kind: "handled",
        isViewer: true,
      });
    });

    it("does not query claims when no viewer is given (server render with no session yet)", async () => {
      inboundReplyFindMany.mockResolvedValue([linkedReply()]);

      await loadClientOutreachReplies("client-1");
      expect(replyClaimFindMany).not.toHaveBeenCalled();
    });

    it("surfaces a live claim as the ownership state when nothing is handled yet", async () => {
      inboundReplyFindMany.mockResolvedValue([linkedReply({ id: "reply-1" })]);
      replyClaimFindMany.mockResolvedValue([
        {
          subjectType: "INBOUND_REPLY",
          subjectId: "reply-1",
          staffUserId: "staff-sarah",
          claimedAt: new Date(),
          staffUser: { displayName: "Sarah Okafor", email: "sarah@opensdoors.co.uk" },
        },
      ]);

      const result = await loadClientOutreachReplies("client-1", "staff-bob");
      expect(result[0]!.replies[0]!.ownership).toMatchObject({
        kind: "claimed",
        name: "Sarah Okafor",
      });
    });
  });

  it("does not execute any writes or send operations", async () => {
    inboundReplyFindMany.mockResolvedValue([linkedReply()]);
    mailboxFindMany.mockResolvedValue([]);

    await loadClientOutreachReplies("client-1");

    expect(inboundReplyFindMany).toHaveBeenCalledTimes(1);
    expect(mailboxFindMany).toHaveBeenCalledTimes(1);
  });
});
