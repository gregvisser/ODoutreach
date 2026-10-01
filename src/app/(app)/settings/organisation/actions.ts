"use server";

import { z } from "zod";

import { membershipRoleForStaff } from "@/lib/tenant/organisation";
import { inviteStaffIntoOrganisation } from "@/server/tenant/invite-organisation-staff";
import { requireOrganisationAdminForAction } from "@/server/tenant/organisation-admin";

export type OrganisationInviteState = {
  error: string | null;
  message: string | null;
};

const roleSchema = z.enum(["ADMIN", "MANAGER", "OPERATOR", "VIEWER"]);

export async function inviteOrganisationStaffAction(
  _previous: OrganisationInviteState,
  formData: FormData,
): Promise<OrganisationInviteState> {
  try {
    const { staff, home } = await requireOrganisationAdminForAction();
    const parsedRole = roleSchema.safeParse(formData.get("role") ?? "OPERATOR");
    const email = String(formData.get("email") ?? "");
    if (!parsedRole.success) {
      return { error: "Choose a valid access level.", message: null };
    }
    const result = await inviteStaffIntoOrganisation({
      actorStaffUserId: staff.id,
      organisationId: home.organisationId,
      email,
      staffRole: parsedRole.data,
      membershipRole: membershipRoleForStaff({ isSuperAdmin: false, role: parsedRole.data }),
      isActive: true,
    });
    if (!result.ok) return { error: result.error, message: null };
    return { error: null, message: result.message ?? "Invitation sent." };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Invitation failed",
      message: null,
    };
  }
}
