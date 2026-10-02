import { redirect } from "next/navigation";

import { STAFF_WORKSPACE_HOME_PATH, staffLandingPath } from "@/lib/tenant/platform";
import { gateStaffAccess } from "@/server/auth/staff";

export const dynamic = "force-dynamic";

/**
 * Signed-in home. A Bidlow platform administrator opens the platform
 * dashboard. Everyone else opens Reports, the organisation workspace home.
 * Someone who is signed in but not allowed into the app still reaches the
 * workspace shell, which explains why.
 */
export default async function HomePage() {
  const gate = await gateStaffAccess();
  if (gate.status !== "ok") {
    redirect(STAFF_WORKSPACE_HOME_PATH);
  }
  redirect(staffLandingPath(gate.staff));
}
