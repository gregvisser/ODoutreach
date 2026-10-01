import "server-only";

import type { StaffUser } from "@/generated/prisma/client";
import { isOrganisationAdminRole } from "@/lib/tenant/platform";
import { requireOpensDoorsStaff } from "@/server/auth/staff";

import { loadStaffHomeOrganisation, type StaffHomeOrganisation } from "./organisation-scope";

const DENIED = "You do not have permission to manage this organisation.";

/**
 * Home-organisation owner or admin. Used by organisation settings so a
 * second organisation can invite its own staff without super-admin, and
 * without reaching another organisation's directory.
 */
export async function requireOrganisationAdminForAction(): Promise<{
  staff: StaffUser;
  home: StaffHomeOrganisation;
}> {
  try {
    const staff = await requireOpensDoorsStaff();
    const home = await loadStaffHomeOrganisation(staff.id);
    if (!home || !isOrganisationAdminRole(home.role)) {
      throw new Error(DENIED);
    }
    return { staff, home };
  } catch (error) {
    if (error instanceof Error && error.message === DENIED) throw error;
    throw new Error(DENIED);
  }
}
