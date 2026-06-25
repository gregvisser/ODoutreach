"use server";

import { revalidatePath } from "next/cache";

import { requireSuperAdminForAction } from "@/server/auth/staff";
import {
  setInternalSeedAddressActive,
  upsertInternalSeedAddress,
} from "@/server/internal-seed/seed-allowlist";

const SETTINGS_PATH = "/settings/internal-seed";

/**
 * Feature A — add (or re-activate) an internal seed/allowlist address. Super-
 * admin only. The page is also super-admin-gated; this is defence-in-depth so a
 * direct POST from a non-owner is rejected.
 */
export async function addInternalSeedAddressAction(
  formData: FormData,
): Promise<void> {
  const staff = await requireSuperAdminForAction();
  const email = String(formData.get("email") ?? "");
  const label = String(formData.get("label") ?? "");
  const note = String(formData.get("note") ?? "");
  await upsertInternalSeedAddress({
    email,
    label,
    note,
    staffUserId: staff.id,
  });
  revalidatePath(SETTINGS_PATH);
}

/** Feature A — turn a seed address on/off (soft, keeps the row). Super-admin only. */
export async function setInternalSeedAddressActiveAction(
  formData: FormData,
): Promise<void> {
  await requireSuperAdminForAction();
  const id = String(formData.get("id") ?? "");
  const isActive = String(formData.get("isActive") ?? "") === "true";
  if (id) {
    await setInternalSeedAddressActive(id, isActive);
  }
  revalidatePath(SETTINGS_PATH);
}
