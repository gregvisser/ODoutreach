import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  createGuestInvitation,
  logStaffAccessAudit,
  revalidatePath,
  requireSuperAdminForAction,
  isStaffEmailAllowed,
  staffUserCreate,
  staffUserDelete,
  staffUserFindUnique,
  staffUserUpdate,
} = vi.hoisted(() => ({
  createGuestInvitation: vi.fn(),
  logStaffAccessAudit: vi.fn(),
  revalidatePath: vi.fn(),
  requireSuperAdminForAction: vi.fn(),
  isStaffEmailAllowed: vi.fn(),
  staffUserCreate: vi.fn(),
  staffUserDelete: vi.fn(),
  staffUserFindUnique: vi.fn(),
  staffUserUpdate: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath,
}));

vi.mock("@/server/auth/staff", () => ({
  requireSuperAdminForAction,
  isStaffEmailAllowed,
}));

vi.mock("@/server/microsoft-graph/guest-invitations", () => ({
  createGuestInvitation,
  GuestInvitationError: class GuestInvitationError extends Error {},
  getGuestUserExternalState: vi.fn(),
}));

vi.mock("@/server/staff-access/audit", () => ({
  logStaffAccessAudit,
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    staffUser: {
      create: staffUserCreate,
      delete: staffUserDelete,
      findUnique: staffUserFindUnique,
      update: staffUserUpdate,
    },
  },
}));

import { inviteStaffUser } from "./actions";

describe("inviteStaffUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.AUTH_URL = "https://app.example.test";
    requireSuperAdminForAction.mockResolvedValue({ id: "admin-1" });
    isStaffEmailAllowed.mockReturnValue(true);
    staffUserFindUnique.mockResolvedValue(null);
    staffUserCreate.mockResolvedValue({ id: "staff-1" });
    staffUserUpdate.mockResolvedValue({ id: "staff-1" });
    createGuestInvitation.mockResolvedValue({
      invitationId: "invitation-1",
      invitedUserObjectId: "guest-oid",
      status: "PendingAcceptance",
    });
  });

  it("defaults a new staff invitation to OPERATOR", async () => {
    expect(await inviteStaffUser({ email: "staff@example.com" })).toMatchObject({ ok: true });
    expect(staffUserCreate).toHaveBeenCalledWith({ data: expect.objectContaining({ role: "OPERATOR" }) });
  });

  it("writes and invites using a trimmed, lowercase staff email", async () => {
    await expect(
      inviteStaffUser({
        email: " Invited.Staff@Example.COM ",
        role: "OPERATOR",
        isActive: true,
      }),
    ).resolves.toMatchObject({ ok: true });

    expect(staffUserCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        email: "invited.staff@example.com",
        guestInvitationState: "PENDING",
      }),
    });
    expect(createGuestInvitation).toHaveBeenCalledWith(
      "invited.staff@example.com",
      "https://app.example.test/sign-in",
    );
    expect(logStaffAccessAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({ inviteeEmail: "invited.staff@example.com" }),
      }),
    );
    expect(revalidatePath).toHaveBeenCalledWith("/settings/staff-access");
  });
});
