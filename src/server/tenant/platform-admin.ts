import "server-only";

import { notFound } from "next/navigation";

import type { StaffUser } from "@/generated/prisma/client";
import { platformDashboardDecision } from "@/lib/tenant/platform";
import { hasPlatformAdminAccess } from "@/lib/tenant/organisation";
import { requireOpensDoorsStaff } from "@/server/auth/staff";

/**
 * Stop a request that is not a Bidlow platform administrator.
 * Pages and the platform layout both call this. notFound hides the
 * dashboard; it does not redirect into an organisation workspace.
 */
export function assertPlatformDashboardAccess(staff: {
  isPlatformAdmin: boolean;
  email: string;
}): void {
  if (platformDashboardDecision(staff) === "deny") {
    notFound();
  }
}

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
