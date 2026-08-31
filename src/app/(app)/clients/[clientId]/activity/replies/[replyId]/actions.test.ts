import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Row 132 — `markReplyHandledAction`, the durable "I've dealt with this"
 * a person can trigger from the reply-detail page. Distinct from the
 * pre-existing `markEnrollmentCompletedAction` ("Stop follow-ups") below it
 * on the same page — that halts future sequence sends; this records that a
 * person answered or closed out the conversation.
 */
const { requireStaff, markHandled, revalidatePath } = vi.hoisted(() => ({
  requireStaff: vi.fn(),
  markHandled: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/server/auth/staff", () => ({
  requireOpensDoorsStaff: (...a: unknown[]) => requireStaff(...a),
}));
vi.mock("@/server/inbox/mark-reply-handled", () => ({
  markInboundReplyHandled: (...a: unknown[]) => markHandled(...a),
}));
vi.mock("next/cache", () => ({ revalidatePath: (...a: unknown[]) => revalidatePath(...a) }));
vi.mock("@/lib/db", () => ({ prisma: {} }));
vi.mock("@/server/email-sequences/mutator-access", () => ({
  getClientEmailSequenceMutationAllowed: vi.fn(),
}));
vi.mock("@/server/tenant/access", () => ({ requireClientAccess: vi.fn() }));

import { markReplyHandledAction } from "./actions";

const SUBJECT = { subjectType: "INBOUND_REPLY" as const, subjectId: "reply-1" };

beforeEach(() => {
  requireStaff.mockReset().mockResolvedValue({ id: "staff-bob" });
  markHandled.mockReset().mockResolvedValue({
    ok: true,
    handledAt: new Date(),
    handledByStaffUserId: "staff-bob",
  });
  revalidatePath.mockReset();
});

describe("markReplyHandledAction", () => {
  it("delegates to markInboundReplyHandled with the current staff and resolved subject", async () => {
    await markReplyHandledAction({ clientId: "client-a", replyId: "reply-1", ...SUBJECT });

    expect(markHandled).toHaveBeenCalledWith({
      staff: { id: "staff-bob" },
      clientId: "client-a",
      replyId: "reply-1",
      subjectType: "INBOUND_REPLY",
      subjectId: "reply-1",
    });
  });

  it("revalidates the reply page, the client activity tab, and the cross-client queue", async () => {
    await markReplyHandledAction({ clientId: "client-a", replyId: "reply-1", ...SUBJECT });

    expect(revalidatePath).toHaveBeenCalledWith(
      "/clients/client-a/activity/replies/reply-1",
    );
    expect(revalidatePath).toHaveBeenCalledWith("/clients/client-a/activity");
    expect(revalidatePath).toHaveBeenCalledWith("/replies");
  });

  it("surfaces a failure reason without revalidating anything", async () => {
    markHandled.mockResolvedValue({ ok: false, reason: "That reply is not part of this workspace." });

    const result = await markReplyHandledAction({
      clientId: "client-a",
      replyId: "reply-elsewhere",
      ...SUBJECT,
    });

    expect(result).toEqual({ ok: false, reason: "That reply is not part of this workspace." });
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
