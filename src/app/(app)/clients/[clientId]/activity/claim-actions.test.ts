import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Row 132 — `claimReplyAction` and `releaseReplyClaimAction`, the two
 * explicit ownership moves a person can make from the reply-detail page:
 * "this is mine" and "I'm done with it / hand it back".
 */
const { requireStaff, requireAccess, claimForStaff, releaseClaims, revalidatePath } =
  vi.hoisted(() => ({
    requireStaff: vi.fn(),
    requireAccess: vi.fn(),
    claimForStaff: vi.fn(),
    releaseClaims: vi.fn(),
    revalidatePath: vi.fn(),
  }));

vi.mock("@/server/auth/staff", () => ({
  requireOpensDoorsStaff: (...a: unknown[]) => requireStaff(...a),
}));
vi.mock("@/server/tenant/access", () => ({
  requireClientAccess: (...a: unknown[]) => requireAccess(...a),
}));
vi.mock("@/server/inbox/reply-claim", () => ({
  claimReplyForStaff: (...a: unknown[]) => claimForStaff(...a),
  releaseReplyClaims: (...a: unknown[]) => releaseClaims(...a),
}));
vi.mock("next/cache", () => ({ revalidatePath: (...a: unknown[]) => revalidatePath(...a) }));

import { claimReplyAction, releaseReplyClaimAction } from "./claim-actions";

const SUBJECT = { subjectType: "INBOUND_REPLY" as const, subjectId: "reply-1" };

beforeEach(() => {
  requireStaff.mockReset().mockResolvedValue({ id: "staff-bob" });
  requireAccess.mockReset().mockResolvedValue(undefined);
  claimForStaff.mockReset().mockResolvedValue(undefined);
  releaseClaims.mockReset().mockResolvedValue(undefined);
  revalidatePath.mockReset();
});

describe("claimReplyAction", () => {
  it("re-verifies staff and client access before writing the claim", async () => {
    await claimReplyAction({ clientId: "client-a", ...SUBJECT });

    expect(requireStaff).toHaveBeenCalledTimes(1);
    expect(requireAccess).toHaveBeenCalledWith({ id: "staff-bob" }, "client-a");
    expect(claimForStaff).toHaveBeenCalledWith({
      clientId: "client-a",
      subject: SUBJECT,
      staffUserId: "staff-bob",
    });
  });

  it("does not revalidate anything when no path is given (the passive auto-claim case)", async () => {
    await claimReplyAction({ clientId: "client-a", ...SUBJECT });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("revalidates the given path when one is supplied (the explicit 'Claim' button)", async () => {
    await claimReplyAction({
      clientId: "client-a",
      ...SUBJECT,
      revalidateReplyPath: "/clients/client-a/activity/replies/reply-1",
    });
    expect(revalidatePath).toHaveBeenCalledWith(
      "/clients/client-a/activity/replies/reply-1",
    );
  });
});

describe("releaseReplyClaimAction", () => {
  it("re-verifies staff and client access, then clears every claim on the conversation", async () => {
    await releaseReplyClaimAction({ clientId: "client-a", ...SUBJECT });

    expect(requireAccess).toHaveBeenCalledWith({ id: "staff-bob" }, "client-a");
    expect(releaseClaims).toHaveBeenCalledWith({
      clientId: "client-a",
      subject: SUBJECT,
    });
  });

  it("any staff member can release — not only the one who claimed it (advisory, not a lock)", async () => {
    requireStaff.mockResolvedValue({ id: "staff-someone-else" });

    const result = await releaseReplyClaimAction({ clientId: "client-a", ...SUBJECT });

    expect(result.ok).toBe(true);
    expect(releaseClaims).toHaveBeenCalledWith({
      clientId: "client-a",
      subject: SUBJECT,
    });
  });

  it("revalidates the given path so the badge updates without a manual refresh", async () => {
    await releaseReplyClaimAction({
      clientId: "client-a",
      ...SUBJECT,
      revalidateReplyPath: "/clients/client-a/activity/replies/reply-1",
    });
    expect(revalidatePath).toHaveBeenCalledWith(
      "/clients/client-a/activity/replies/reply-1",
    );
  });
});
