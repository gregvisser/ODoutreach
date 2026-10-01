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
  organisationMemberUpsert,
  organisationMemberFindUnique,
  organisationMemberDeleteMany,
  organisationMemberCreate,
  organisationFindUnique,
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
  organisationMemberUpsert: vi.fn(),
  organisationMemberFindUnique: vi.fn(),
  organisationMemberDeleteMany: vi.fn(),
  organisationMemberCreate: vi.fn(),
  organisationFindUnique: vi.fn(),
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
    organisation: {
      findUnique: organisationFindUnique,
    },
    organisationMember: {
      upsert: organisationMemberUpsert,
      findUnique: organisationMemberFindUnique,
      deleteMany: organisationMemberDeleteMany,
      create: organisationMemberCreate,
    },
  },
}));

import { inviteStaffUser, resendStaffInvitation } from "./actions";

describe("inviteStaffUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.AUTH_URL = "https://app.example.test";
    requireSuperAdminForAction.mockResolvedValue({ id: "admin-1" });
    isStaffEmailAllowed.mockReturnValue(true);
    staffUserFindUnique.mockImplementation(async ({ where }: { where: { id?: string; email?: string } }) => {
      if (where.id === "admin-1") {
        return {
          id: "admin-1",
          email: "owner@opensdoors.co.uk",
          isPlatformAdmin: false,
          organisationMemberships: [
            {
              organisationId: "org_opensdoors",
              role: "OWNER",
              createdAt: new Date("2020-01-01T00:00:00.000Z"),
              organisation: { status: "ACTIVE", name: "OpensDoors", slug: "opensdoors" },
            },
          ],
        };
      }
      return null;
    });
    staffUserCreate.mockResolvedValue({ id: "staff-1" });
    staffUserUpdate.mockResolvedValue({ id: "staff-1" });
    organisationFindUnique.mockResolvedValue({ id: "org_opensdoors" });
    organisationMemberFindUnique.mockResolvedValue(null);
    organisationMemberDeleteMany.mockResolvedValue({ count: 0 });
    organisationMemberCreate.mockResolvedValue({ id: "member-1" });
    organisationMemberUpsert.mockResolvedValue({ id: "member-1" });
    createGuestInvitation.mockResolvedValue({
      invitationId: "invitation-1",
      invitedUserObjectId: "guest-oid",
      status: "PendingAcceptance",
    });
  });

  it("defaults a new staff invitation to OPERATOR", async () => {
    expect(await inviteStaffUser({ email: "staff@example.com" })).toMatchObject({ ok: true });
    expect(staffUserCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          role: "OPERATOR",
          isPlatformAdmin: false,
          isSuperAdmin: false,
        }),
      }),
    );
    expect(organisationMemberUpsert).toHaveBeenCalledWith({
      where: {
        organisationId_staffUserId: {
          organisationId: "org_opensdoors",
          staffUserId: "staff-1",
        },
      },
      create: expect.objectContaining({
        organisationId: "org_opensdoors",
        staffUserId: "staff-1",
        role: "USER",
      }),
      update: { role: "USER" },
    });
  });

  it("adds an existing account to this organisation without a second invitation", async () => {
    staffUserFindUnique.mockImplementation(async ({ where }: { where: { id?: string; email?: string } }) => {
      if (where.id === "admin-1") {
        return {
          id: "admin-1",
          email: "owner@opensdoors.co.uk",
          isPlatformAdmin: false,
          organisationMemberships: [
            {
              organisationId: "org_opensdoors",
              role: "OWNER",
              createdAt: new Date("2020-01-01T00:00:00.000Z"),
              organisation: { status: "ACTIVE", name: "OpensDoors", slug: "opensdoors" },
            },
          ],
        };
      }
      if (where.id === "greg" || where.email === "greg@bidlow.co.uk") {
        return { id: "greg", email: "greg@bidlow.co.uk" };
      }
      return null;
    });

    await expect(inviteStaffUser({ email: "greg@bidlow.co.uk" })).resolves.toMatchObject({
      ok: true,
      message: expect.stringContaining("already have an account"),
    });
    expect(staffUserCreate).not.toHaveBeenCalled();
    expect(createGuestInvitation).not.toHaveBeenCalled();
    expect(organisationMemberCreate).toHaveBeenCalledWith({
      data: {
        organisationId: "org_opensdoors",
        staffUserId: "greg",
        role: "USER",
      },
    });
  });

  it("refuses to invite when the owner is not in an organisation", async () => {
    staffUserFindUnique.mockResolvedValue(null);
    await expect(inviteStaffUser({ email: "staff@example.com" })).resolves.toEqual({
      ok: false,
      error: "You are not in an organisation.",
    });
    expect(createGuestInvitation).not.toHaveBeenCalled();
  });

  it("writes and invites using a trimmed, lowercase staff email", async () => {
    await expect(
      inviteStaffUser({
        email: " Invited.Staff@Example.COM ",
        role: "OPERATOR",
        isActive: true,
      }),
    ).resolves.toMatchObject({ ok: true });

    expect(staffUserCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          email: "invited.staff@example.com",
          guestInvitationState: "PENDING",
        }),
      }),
    );
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

  it("names STAFF_EMAIL_DOMAINS when the address is outside the allowlist", async () => {
    process.env.STAFF_EMAIL_DOMAINS = "opensdoors.co.uk";
    await expect(inviteStaffUser({ email: "ada@northwind.example" })).resolves.toMatchObject({
      ok: false,
      error: expect.stringContaining("STAFF_EMAIL_DOMAINS"),
    });
    expect(staffUserCreate).not.toHaveBeenCalled();
    delete process.env.STAFF_EMAIL_DOMAINS;
  });

  it("deletes the pending staff row when Microsoft refuses the invitation", async () => {
    createGuestInvitation.mockRejectedValue(new Error("graph down"));
    await expect(inviteStaffUser({ email: "staff@example.com" })).resolves.toMatchObject({
      ok: false,
    });
    expect(staffUserDelete).toHaveBeenCalledWith({ where: { id: "staff-1" } });
  });

  it("does not resend an invitation for someone in another organisation", async () => {
    organisationMemberFindUnique.mockResolvedValue(null);
    await expect(resendStaffInvitation("staff-other")).resolves.toEqual({
      ok: false,
      error: "Staff user not found.",
    });
    expect(createGuestInvitation).not.toHaveBeenCalled();
  });
});
