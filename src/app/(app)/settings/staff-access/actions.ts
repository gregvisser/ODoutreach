"use server";

import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { normalizeEmail } from "@/lib/normalize";
import { isStaffEmailAllowed, requireStaffAdminForAction } from "@/server/auth/staff";
import { logStaffAccessAudit } from "@/server/staff-access/audit";
import { assertLastActiveAdminProtected } from "@/server/staff-access/last-admin";
import {
  createGuestInvitation,
  getGuestUserExternalState,
} from "@/server/microsoft-graph/guest-invitations";

export type StaffActionResult =
  | { ok: true; message?: string }
  | { ok: false; error: string };

const staffRoleSchema = z.enum(["ADMIN", "MANAGER", "OPERATOR", "VIEWER"]);

function inviteRedirectUrl(): string {
  const explicit = process.env.STAFF_INVITE_REDIRECT_URL?.trim();
  const authUrl = process.env.AUTH_URL?.trim();
  const base = explicit || authUrl;
  if (!base) {
    throw new Error("Set AUTH_URL or STAFF_INVITE_REDIRECT_URL for invitation return URL");
  }
  return `${base.replace(/\/$/, "")}/sign-in`;
}

function assertInviteeDomainAllowed(email: string): void {
  if (!isStaffEmailAllowed({ email })) {
    throw new Error(
      "That email is not allowed by STAFF_EMAIL_DOMAINS — update policy or use an allowed address.",
    );
  }
}

const inviteSchema = z.object({
  email: z.string().email(),
  role: staffRoleSchema,
  isActive: z.boolean().optional().default(true),
});

export async function inviteStaffUser(
  raw: z.infer<typeof inviteSchema>,
): Promise<StaffActionResult> {
  try {
    const admin = await requireStaffAdminForAction();
    const data = inviteSchema.parse(raw);
    const email = normalizeEmail(data.email);
    assertInviteeDomainAllowed(email);

    const existing = await prisma.staffUser.findUnique({ where: { email } });
    if (existing) {
      return { ok: false, error: "A staff user with this email already exists." };
    }

    const redirect = inviteRedirectUrl();

    const draft = await prisma.staffUser.create({
      data: {
        entraObjectId: randomUUID(),
        email,
        displayName: null,
        role: data.role,
        isActive: data.isActive,
        guestInvitationState: "PENDING",
        invitedAt: new Date(),
        invitedById: admin.id,
      },
    });

    try {
      const graph = await createGuestInvitation(email, redirect);
      await prisma.staffUser.update({
        where: { id: draft.id },
        data: {
          graphInvitationId: graph.invitationId,
          graphInvitedUserObjectId: graph.invitedUserObjectId,
          invitationLastSentAt: new Date(),
        },
      });
    } catch (graphErr) {
      await prisma.staffUser.delete({ where: { id: draft.id } });
      throw graphErr;
    }

    await logStaffAccessAudit({
      actorStaffUserId: admin.id,
      action: "CREATE",
      targetStaffUserId: draft.id,
      metadata: { op: "invite_sent", inviteeEmail: email, role: data.role },
    });

    revalidatePath("/settings/staff-access");
    return { ok: true, message: "Invitation sent. The user must accept the Microsoft email before signing in." };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Invitation failed";
    return { ok: false, error: msg };
  }
}

export async function resendStaffInvitation(staffUserId: string): Promise<StaffActionResult> {
  try {
    const admin = await requireStaffAdminForAction();
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
      const msg = e instanceof Error ? e.message + hint : "Resend failed" + hint;
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
    const admin = await requireStaffAdminForAction();
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
    const admin = await requireStaffAdminForAction();
    const data = updateRoleSchema.parse(raw);
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
    const admin = await requireStaffAdminForAction();
    const data = setActiveSchema.parse(raw);
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
