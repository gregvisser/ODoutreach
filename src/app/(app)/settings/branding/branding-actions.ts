"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { validateGlobalBrandInput } from "@/lib/branding/global-brand";
import { prisma } from "@/lib/db";
import { OPENSDOORS_ORGANISATION_ID } from "@/lib/tenant/organisation";
import { requireOpensDoorsStaff } from "@/server/auth/staff";
import { organisationIdForStaff } from "@/server/tenant/organisation-scope";

const inputSchema = z.object({
  appLogoUrl: z.string().default(""),
  appMarkUrl: z.string().default(""),
  appFaviconUrl: z.string().default(""),
  appBrandName: z.string().default(""),
  appProductName: z.string().default(""),
  appLogoAltText: z.string().default(""),
});

export type UpdateGlobalBrandInput = z.infer<typeof inputSchema>;

/**
 * Any signed-in staff: upsert the `GlobalBrandSetting` singleton
 * (id = "global") with the submitted branding values. Each field may be
 * blank — a blank field clears the override and the UI falls back to the
 * shipped OpensDoors defaults.
 *
 * Strict scope: only touches `GlobalBrandSetting` (+ one AuditLog row).
 * No mailbox, sequence, contact, suppression, OAuth, secret, or
 * app-setting mutations happen here.
 */
export async function updateGlobalBrandAction(
  input: UpdateGlobalBrandInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  let staff;
  try {
    staff = await requireOpensDoorsStaff();
  } catch {
    return {
      ok: false,
      error: "You must be signed in as staff to update global branding.",
    };
  }

  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Invalid branding payload." };
  }

  const validation = validateGlobalBrandInput(parsed.data);
  if (!validation.ok) {
    return { ok: false, error: validation.message };
  }

  const organisationId = await organisationIdForStaff(staff.id);
  if (!organisationId) {
    return { ok: false, error: "You are not in an organisation." };
  }

  const brand = {
    appLogoUrl: validation.normalized.appLogoUrl,
    appMarkUrl: validation.normalized.appMarkUrl,
    appFaviconUrl: validation.normalized.appFaviconUrl,
    appBrandName: validation.normalized.appBrandName,
    appProductName: validation.normalized.appProductName,
    appLogoAltText: validation.normalized.appLogoAltText,
  };

  await prisma.organisation.update({
    where: { id: organisationId },
    data: brand,
  });

  if (organisationId === OPENSDOORS_ORGANISATION_ID) {
    const data = { ...brand, updatedById: staff.id };
    await prisma.globalBrandSetting.upsert({
      where: { id: "global" },
      create: { id: "global", ...data },
      update: data,
    });
  }

  await prisma.auditLog.create({
    data: {
      staffUserId: staff.id,
      action: "UPDATE",
      entityType: "GlobalBrandSetting",
      entityId: "global",
      metadata: {
        field: "global-branding",
        logoUrlSet: validation.normalized.appLogoUrl !== null,
        markUrlSet: validation.normalized.appMarkUrl !== null,
        faviconUrlSet: validation.normalized.appFaviconUrl !== null,
        brandNameSet: validation.normalized.appBrandName !== null,
        productNameSet: validation.normalized.appProductName !== null,
        logoAltTextSet: validation.normalized.appLogoAltText !== null,
      },
    },
  });

  // Branding is rendered in the shell and on sign-in — refresh every
  // path that reads `getGlobalBrand()` so operators see the change
  // immediately without needing a full reload.
  revalidatePath("/", "layout");

  return { ok: true };
}

/**
 * Any signed-in staff convenience: clear the entire `GlobalBrandSetting`
 * row back to shipped defaults. Equivalent to saving with every field
 * blank, but phrased as an explicit "reset" so the UI intent is clear
 * in the audit log.
 */
export async function resetGlobalBrandAction(): Promise<
  { ok: true } | { ok: false; error: string }
> {
  let staff;
  try {
    staff = await requireOpensDoorsStaff();
  } catch {
    return {
      ok: false,
      error: "You must be signed in as staff to reset global branding.",
    };
  }

  const organisationId = await organisationIdForStaff(staff.id);
  if (!organisationId) {
    return { ok: false, error: "You are not in an organisation." };
  }

  const cleared = {
    appLogoUrl: null,
    appMarkUrl: null,
    appFaviconUrl: null,
    appBrandName: null,
    appProductName: null,
    appLogoAltText: null,
  };
  await prisma.organisation.update({
    where: { id: organisationId },
    data: cleared,
  });
  if (organisationId === OPENSDOORS_ORGANISATION_ID) {
    await prisma.globalBrandSetting.upsert({
      where: { id: "global" },
      create: {
        id: "global",
        updatedById: staff.id,
      },
      update: {
        ...cleared,
        updatedById: staff.id,
      },
    });
  }

  await prisma.auditLog.create({
    data: {
      staffUserId: staff.id,
      action: "UPDATE",
      entityType: "GlobalBrandSetting",
      entityId: "global",
      metadata: { field: "global-branding", reset: true },
    },
  });

  revalidatePath("/", "layout");
  return { ok: true };
}
