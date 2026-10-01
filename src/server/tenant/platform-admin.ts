import "server-only";

import type { StaffUser } from "@/generated/prisma/client";
import { hasPlatformAdminAccess } from "@/lib/tenant/organisation";
import { requireOpensDoorsStaff } from "@/server/auth/staff";

/**
 * Bidlow platform console. Verified @bidlow.co.uk and the explicit flag.
 * An OpensDoors address never passes, even with the flag set.
 */
export async function requirePlatformAdminForAction(): Promise<StaffUser> {
  try {
    const staff = await requireOpensDoorsStaff();
    if (!hasPlatformAdminAccess(staff)) {
      throw new Error("You do not have permission to manage organisations.");
    }
    return staff;
  } catch (error) {
    if (error instanceof Error && error.message === "You do not have permission to manage organisations.") {
      throw error;
    }
    throw new Error("You do not have permission to manage organisations.");
  }
}
