"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { hasPlatformAdminAccess } from "@/lib/tenant/organisation";
import { requireOpensDoorsStaff } from "@/server/auth/staff";
import { enterOrganisation } from "@/server/tenant/acting-organisation";

/**
 * Switch the signed-in person into an organisation and open its clients.
 * Platform admins can enter any organisation. Everyone else can enter only
 * an organisation they belong to.
 */
export async function enterOrganisationAction(formData: FormData): Promise<void> {
  const staff = await requireOpensDoorsStaff();
  const result = await enterOrganisation({
    staffUserId: staff.id,
    email: staff.email,
    isPlatformAdmin: staff.isPlatformAdmin,
    organisationId: String(formData.get("organisationId") ?? ""),
  });
  if (!result.ok) {
    if (hasPlatformAdminAccess(staff)) {
      redirect(`/platform?error=${encodeURIComponent(result.error)}`);
    }
    redirect("/clients");
  }
  revalidatePath("/", "layout");
  redirect("/clients");
}
