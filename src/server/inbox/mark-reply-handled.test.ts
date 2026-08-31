import { beforeEach, describe, expect, it, vi } from "vitest";

import type { StaffIdentity } from "@/server/tenant/access";

vi.mock("server-only", () => ({}));

const { replyFindFirst, replyUpdate, claimDeleteMany, requireClientAccess } = vi.hoisted(() => ({
  replyFindFirst: vi.fn(),
  replyUpdate: vi.fn(),
  claimDeleteMany: vi.fn().mockResolvedValue({ count: 0 }),
  requireClientAccess: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    inboundReply: { findFirst: replyFindFirst, update: replyUpdate },
    replyClaim: { deleteMany: claimDeleteMany },
  },
}));

vi.mock("@/server/tenant/access", () => ({ requireClientAccess }));

import { markInboundReplyHandled } from "./mark-reply-handled";

const STAFF: StaffIdentity = { id: "staff-sarah", role: "OPERATOR" };
const NOW = new Date("2026-08-31T10:00:00.000Z");

beforeEach(() => {
  vi.clearAllMocks();
  requireClientAccess.mockResolvedValue(undefined);
  claimDeleteMany.mockResolvedValue({ count: 0 });
});

describe("markInboundReplyHandled — row 132, the durable 'somebody dealt with this' state", () => {
  it("re-verifies staff access to the client before touching anything", async () => {
    replyFindFirst.mockResolvedValue({ id: "reply-1", handledAt: null, handledByStaffUserId: null });
    replyUpdate.mockResolvedValue({});

    await markInboundReplyHandled({
      staff: STAFF,
      clientId: "client-a",
      replyId: "reply-1",
      now: NOW,
    });

    expect(requireClientAccess).toHaveBeenCalledWith(STAFF, "client-a");
  });

  it("returns not-found for a reply outside this client's workspace", async () => {
    replyFindFirst.mockResolvedValue(null);

    const result = await markInboundReplyHandled({
      staff: STAFF,
      clientId: "client-a",
      replyId: "reply-elsewhere",
      now: NOW,
    });

    expect(result.ok).toBe(false);
    expect(replyUpdate).not.toHaveBeenCalled();
  });

  it("writes handledAt and handledByStaffUserId, scoped to this reply", async () => {
    replyFindFirst.mockResolvedValue({ id: "reply-1", handledAt: null, handledByStaffUserId: null });
    replyUpdate.mockResolvedValue({});

    const result = await markInboundReplyHandled({
      staff: STAFF,
      clientId: "client-a",
      replyId: "reply-1",
      now: NOW,
    });

    expect(result).toEqual({ ok: true, handledAt: NOW, handledByStaffUserId: "staff-sarah" });
    expect(replyUpdate).toHaveBeenCalledWith({
      where: { id: "reply-1" },
      data: { handledAt: NOW, handledByStaffUserId: "staff-sarah" },
    });
  });

  it("is idempotent — first write wins, a second call preserves the original owner", async () => {
    const firstHandledAt = new Date("2026-08-31T09:00:00.000Z");
    replyFindFirst.mockResolvedValue({
      id: "reply-1",
      handledAt: firstHandledAt,
      handledByStaffUserId: "staff-bob",
    });

    const result = await markInboundReplyHandled({
      staff: STAFF,
      clientId: "client-a",
      replyId: "reply-1",
      now: NOW,
    });

    expect(result).toEqual({
      ok: true,
      handledAt: firstHandledAt,
      handledByStaffUserId: "staff-bob",
    });
    // Nothing to write — the state is already what it should be.
    expect(replyUpdate).not.toHaveBeenCalled();
  });

  it("releases every claim on the conversation once handled — nobody should still see 'X has this'", async () => {
    replyFindFirst.mockResolvedValue({ id: "reply-1", handledAt: null, handledByStaffUserId: null });
    replyUpdate.mockResolvedValue({});

    await markInboundReplyHandled({
      staff: STAFF,
      clientId: "client-a",
      replyId: "reply-1",
      subjectType: "INBOUND_MESSAGE",
      subjectId: "msg-1",
      now: NOW,
    });

    expect(claimDeleteMany).toHaveBeenCalledWith({
      where: { clientId: "client-a", subjectType: "INBOUND_MESSAGE", subjectId: "msg-1" },
    });
  });

  it("falls back to releasing by the reply's own id when no correlated subject is given", async () => {
    replyFindFirst.mockResolvedValue({ id: "reply-1", handledAt: null, handledByStaffUserId: null });
    replyUpdate.mockResolvedValue({});

    await markInboundReplyHandled({
      staff: STAFF,
      clientId: "client-a",
      replyId: "reply-1",
      now: NOW,
    });

    expect(claimDeleteMany).toHaveBeenCalledWith({
      where: { clientId: "client-a", subjectType: "INBOUND_REPLY", subjectId: "reply-1" },
    });
  });
});
