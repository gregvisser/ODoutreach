"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { ORGANISATION_FEATURE_KEYS } from "@/lib/tenant/organisation";
import { FIRST_ORGANISATION_ADMIN } from "@/lib/tenant/platform";
import { inviteStaffIntoOrganisation } from "@/server/tenant/invite-organisation-staff";
import { requirePlatformAdminForAction } from "@/server/tenant/platform-admin";
import {
  createOrganisationRecord,
  setOrganisationStatus,
  updateOrganisationFlags,
} from "@/server/tenant/platform-orgs";

export type PlatformFormState = {
  error: string | null;
  message: string | null;
};

const idleDenied = "You do not have permission to manage organisations.";

function denied(error: unknown): PlatformFormState {
  return {
    error: error instanceof Error ? error.message : idleDenied,
    message: null,
  };
}

export async function createOrganisationAction(
  _previous: PlatformFormState,
  formData: FormData,
): Promise<PlatformFormState> {
  try {
    await requirePlatformAdminForAction();
    const result = await createOrganisationRecord({
      name: String(formData.get("name") ?? ""),
      slug: String(formData.get("slug") ?? ""),
    });
    if (!result.ok) return { error: result.error, message: null };
    revalidatePath("/platform");
    return { error: null, message: "Organisation created." };
  } catch (error) {
    return denied(error);
  }
}

const statusSchema = z.object({
  organisationId: z.string().min(1),
  status: z.enum(["ACTIVE", "SUSPENDED"]),
});

export async function setOrganisationStatusAction(
  _previous: PlatformFormState,
  formData: FormData,
): Promise<PlatformFormState> {
  try {
    await requirePlatformAdminForAction();
    const parsed = statusSchema.safeParse({
      organisationId: formData.get("organisationId"),
      status: formData.get("status"),
    });
    if (!parsed.success) return { error: "Choose a valid organisation status.", message: null };
    const result = await setOrganisationStatus(parsed.data.organisationId, parsed.data.status);
    if (!result.ok) return { error: result.error, message: null };
    revalidatePath("/platform");
    revalidatePath(`/platform/${parsed.data.organisationId}`);
    return {
      error: null,
      message: parsed.data.status === "SUSPENDED" ? "Organisation suspended." : "Organisation active.",
    };
  } catch (error) {
    return denied(error);
  }
}

export async function updateOrganisationFlagsAction(
  _previous: PlatformFormState,
  formData: FormData,
): Promise<PlatformFormState> {
  try {
    await requirePlatformAdminForAction();
    const organisationId = String(formData.get("organisationId") ?? "");
    if (!organisationId) return { error: "Organisation not found.", message: null };
    const stored: Record<string, boolean> = {};
    for (const key of ORGANISATION_FEATURE_KEYS) {
      stored[key] = formData.get(`flag_${key}`) === "on";
    }
    const result = await updateOrganisationFlags(organisationId, stored);
    if (!result.ok) return { error: result.error, message: null };
    revalidatePath(`/platform/${organisationId}`);
    return { error: null, message: "Feature switches saved." };
  } catch (error) {
    return denied(error);
  }
}

const inviteSchema = z.object({
  organisationId: z.string().min(1),
  email: z.string().trim().email(),
});

export async function inviteOrganisationOwnerAction(
  _previous: PlatformFormState,
  formData: FormData,
): Promise<PlatformFormState> {
  try {
    const admin = await requirePlatformAdminForAction();
    const parsed = inviteSchema.safeParse({
      organisationId: formData.get("organisationId"),
      email: formData.get("email"),
    });
    if (!parsed.success) return { error: "Enter a valid email address.", message: null };
    const result = await inviteStaffIntoOrganisation({
      actorStaffUserId: admin.id,
      organisationId: parsed.data.organisationId,
      email: parsed.data.email,
      staffRole: FIRST_ORGANISATION_ADMIN.staffRole,
      membershipRole: FIRST_ORGANISATION_ADMIN.membershipRole,
      isActive: true,
    });
    if (!result.ok) return { error: result.error, message: null };
    return { error: null, message: result.message ?? "Invitation sent." };
  } catch (error) {
    return denied(error);
  }
}
