"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { membershipRoleForStaff } from "@/lib/tenant/organisation";
import { requireSuperAdminForAction } from "@/server/auth/staff";
import { logStaffAccessAudit } from "@/server/staff-access/audit";
import { assertLastActiveAdminProtected } from "@/server/staff-access/last-admin";
import {
  createGuestInvitation,
  getGuestUserExternalState,
  GuestInvitationError,
} from "@/server/microsoft-graph/guest-invitations";
import { formatInvitationErrorForBanner } from "@/lib/staff-access/invitation-errors";
import {
  inviteStaffIntoOrganisation,
  staffInviteRedirectUrl,
} from "@/server/tenant/invite-organisation-staff";

function describeInvitationFailure(e: unknown, fallback: string): string {
  if (e instanceof GuestInvitationError) {
    return formatInvitationErrorForBanner(e.classified);
  }
  if (e instanceof Error) {
    return e.message;
  }
  return fallback;
}

export type StaffActionResult =
  | { ok: true; message?: string }
  | { ok: false; error: string };

const staffRoleSchema = z.enum(["ADMIN", "MANAGER", "OPERATOR", "VIEWER"]);

function inviteRedirectUrl(): string {
  return staffInviteRedirectUrl();
}

async function actorOrganisationId(staffUserId: string): Promise<string | null> {
  const row = await prisma.organisationMember.findUnique({
    where: { staffUserId },
    select: { organisationId: true },
  });
  return row?.organisationId ?? null;
}

/**
 * Super-admin staff tools stay inside the actor's home organisation.
 * A missing membership is reported as such. A person in another
 * organisation is reported as not found so the directory does not leak.
 */
async function requireSameOrganisationStaff(
  actorStaffUserId: string,
  targetStaffUserId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const organisationId = await actorOrganisationId(actorStaffUserId);
  if (!organisationId) {
    return { ok: false, error: "You are not in an organisation." };
  }
  const target = await prisma.organisationMember.findUnique({
    where: { staffUserId: targetStaffUserId },
    select: { organisationId: true },
  });
  if (!target || target.organisationId !== organisationId) {
    return { ok: false, error: "Staff user not found." };
  }
  return { ok: true };
}

const inviteSchema = z.object({
  email: z.preprocess((value) => {
    if (typeof value !== "string") return value;
    return value.trim();
  }, z.string().email()),
  // Everyday staff receive operator access; elevation requires an explicit owner action.
  role: staffRoleSchema.default("OPERATOR"),
  isActive: z.boolean().optional().default(true),
});

export async function inviteStaffUser(
  raw: z.input<typeof inviteSchema>,
): Promise<StaffActionResult> {
  try {
    const admin = await requireSuperAdminForAction();
    const data = inviteSchema.parse(raw);
    const organisationId = await actorOrganisationId(admin.id);
    if (!organisationId) {
      return { ok: false, error: "You are not in an organisation." };
    }
    return await inviteStaffIntoOrganisation({
      actorStaffUserId: admin.id,
      organisationId,
      email: data.email,
      staffRole: data.role,
      membershipRole: membershipRoleForStaff({ isSuperAdmin: false, role: data.role }),
      isActive: data.isActive,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Invitation failed";
    return { ok: false, error: msg };
  }
}

export async function resendStaffInvitation(staffUserId: string): Promise<StaffActionResult> {
  try {
    const admin = await requireSuperAdminForAction();
    const sameOrg = await requireSameOrganisationStaff(admin.id, staffUserId);
    if (!sameOrg.ok) return sameOrg;
    const staff = await prisma.staffUser.findUnique({ where: { id: staffUserId } });
    if (!staff) {
      return { ok: false, error: "Staff user not found." };
    }
    if (staff.guestInvitationState === "ACCEPTED") {
      return { ok: false, error: "This user has already accepted their invitation." };
    }

    const redirect = inviteRedirectUrl();
    try {
      await createGuestInvitation(staff.email, redirect);
      await prisma.staffUser.update({
        where: { id: staff.id },
        data: { invitationLastSentAt: new Date() },
      });
      await logStaffAccessAudit({
        actorStaffUserId: admin.id,
        action: "UPDATE",
        targetStaffUserId: staff.id,
        metadata: { op: "invite_resent", inviteeEmail: staff.email },
      });
    } catch (e) {
      const hint =
        " If Microsoft rejects a duplicate invite, use “Sync invite status” or ask the user to check their inbox.";
      const msg = describeInvitationFailure(e, "Resend failed") + hint;
      return { ok: false, error: msg };
    }

    revalidatePath("/settings/staff-access");
    return { ok: true, message: "Invitation email sent again (if Microsoft accepted the request)." };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Resend failed";
    return { ok: false, error: msg };
  }
}

export async function syncStaffInvitationStatus(
  staffUserId: string,
): Promise<StaffActionResult> {
  try {
    const admin = await requireSuperAdminForAction();
    const sameOrg = await requireSameOrganisationStaff(admin.id, staffUserId);
    if (!sameOrg.ok) return sameOrg;
    const staff = await prisma.staffUser.findUnique({ where: { id: staffUserId } });
    if (!staff?.graphInvitedUserObjectId) {
      return {
        ok: false,
        error: "No Graph guest id on file — invite may have been created outside this app.",
      };
    }

    const state = await getGuestUserExternalState(staff.graphInvitedUserObjectId);
    if (!state) {
      return { ok: false, error: "Could not read guest user from Microsoft Graph." };
    }

    const normalized = state.toLowerCase();
    let guestInvitationState = staff.guestInvitationState;
    if (normalized === "accepted") {
      guestInvitationState = "ACCEPTED";
    } else if (normalized === "pendingacceptance") {
      guestInvitationState = "PENDING";
    }

    await prisma.staffUser.update({
      where: { id: staff.id },
      data: { guestInvitationState },
    });

    await logStaffAccessAudit({
      actorStaffUserId: admin.id,
      action: "SYNC",
      targetStaffUserId: staff.id,
      metadata: {
        op: "invitation_status_sync",
        inviteeEmail: staff.email,
        externalUserState: state,
        guestInvitationState,
      },
    });

    revalidatePath("/settings/staff-access");
    return { ok: true, message: `Microsoft reports: ${state}` };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Sync failed";
    return { ok: false, error: msg };
  }
}

const updateRoleSchema = z.object({
  staffUserId: z.string().min(1),
  role: staffRoleSchema,
});

export async function updateStaffRole(
  raw: z.infer<typeof updateRoleSchema>,
): Promise<StaffActionResult> {
  try {
    const admin = await requireSuperAdminForAction();
    const data = updateRoleSchema.parse(raw);
    const sameOrg = await requireSameOrganisationStaff(admin.id, data.staffUserId);
    if (!sameOrg.ok) return sameOrg;
    const before = await prisma.staffUser.findUnique({
      where: { id: data.staffUserId },
      select: { role: true },
    });
    if (!before) {
      return { ok: false, error: "Staff user not found." };
    }
    await assertLastActiveAdminProtected({
      actorStaffUserId: admin.id,
      targetStaffUserId: data.staffUserId,
      nextRole: data.role,
    });
    await prisma.staffUser.update({
      where: { id: data.staffUserId },
      data: { role: data.role },
    });
    await logStaffAccessAudit({
      actorStaffUserId: admin.id,
      action: "UPDATE",
      targetStaffUserId: data.staffUserId,
      metadata: {
        op: "role_change",
        fromRole: before.role,
        toRole: data.role,
      },
    });
    revalidatePath("/settings/staff-access");
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Update failed";
    return { ok: false, error: msg };
  }
}

const setActiveSchema = z.object({
  staffUserId: z.string().min(1),
  isActive: z.boolean(),
});

export async function setStaffActive(
  raw: z.infer<typeof setActiveSchema>,
): Promise<StaffActionResult> {
  try {
    const admin = await requireSuperAdminForAction();
    const data = setActiveSchema.parse(raw);
    const sameOrg = await requireSameOrganisationStaff(admin.id, data.staffUserId);
    if (!sameOrg.ok) return sameOrg;
    await assertLastActiveAdminProtected({
      actorStaffUserId: admin.id,
      targetStaffUserId: data.staffUserId,
      nextActive: data.isActive,
    });
    await prisma.staffUser.update({
      where: { id: data.staffUserId },
      data: { isActive: data.isActive },
    });
    await logStaffAccessAudit({
      actorStaffUserId: admin.id,
      action: "UPDATE",
      targetStaffUserId: data.staffUserId,
      metadata: { op: "active_change", isActive: data.isActive },
    });
    revalidatePath("/settings/staff-access");
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Update failed";
    return { ok: false, error: msg };
  }
}
