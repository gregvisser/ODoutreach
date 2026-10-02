import "server-only";

import { cache } from "react";

import {
  type EffectiveBrand,
  type GlobalBrandStored,
  resolveEffectiveBrand,
} from "@/lib/branding/global-brand";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { OPENSDOORS_ORGANISATION_ID } from "@/lib/tenant/organisation";
import { organisationIdForRequest } from "@/server/tenant/hostname";
import { organisationIdForStaff } from "@/server/tenant/organisation-scope";

const brandSelect = {
  appLogoUrl: true,
  appMarkUrl: true,
  appFaviconUrl: true,
  appBrandName: true,
  appProductName: true,
  appLogoAltText: true,
} as const;

function mergeStoredBrand(
  primary: GlobalBrandStored | null,
  fallback: GlobalBrandStored | null,
): GlobalBrandStored | null {
  if (!primary && !fallback) return null;
  return {
    appLogoUrl: primary?.appLogoUrl ?? fallback?.appLogoUrl ?? null,
    appMarkUrl: primary?.appMarkUrl ?? fallback?.appMarkUrl ?? null,
    appFaviconUrl: primary?.appFaviconUrl ?? fallback?.appFaviconUrl ?? null,
    appBrandName: primary?.appBrandName ?? fallback?.appBrandName ?? null,
    appProductName: primary?.appProductName ?? fallback?.appProductName ?? null,
    appLogoAltText: primary?.appLogoAltText ?? fallback?.appLogoAltText ?? null,
  };
}

/**
 * Brand for the host that asked. opensdoors.bidlow.co.uk, localhost, and
 * any host that is not saved on an organisation stay on the OpensDoors
 * brand (organisation fields, then the legacy global singleton, then the
 * shipped defaults). A saved hostname uses that organisation's fields,
 * and its name when a brand name has not been set, so the shell does not
 * say OpensDoors.
 *
 * Memoised per request. A database error falls back to the shipped
 * OpensDoors defaults so the portal is never left without branding.
 */
async function staffActingOrganisationId(): Promise<string | null> {
  try {
    const session = await auth();
    const entraObjectId = session?.user?.id?.trim();
    if (!entraObjectId) return null;
    const staff = await prisma.staffUser.findUnique({
      where: { entraObjectId },
      select: { id: true, isActive: true },
    });
    if (!staff?.isActive) return null;
    return organisationIdForStaff(staff.id);
  } catch {
    return null;
  }
}

export const getGlobalBrand = cache(async (): Promise<EffectiveBrand> => {
  try {
    const actingId = await staffActingOrganisationId();
    const organisationId = actingId ?? (await organisationIdForRequest());
    if (organisationId !== OPENSDOORS_ORGANISATION_ID) {
      const organisation = await prisma.organisation.findUnique({
        where: { id: organisationId },
        select: { name: true, ...brandSelect },
      });
      if (organisation) {
        const { name, ...stored } = organisation;
        return resolveEffectiveBrand({
          ...stored,
          appBrandName: stored.appBrandName?.trim() || name,
        });
      }
    }
  } catch (error) {
    console.warn("[global-brand] failed to resolve the request host, using OpensDoors", error);
  }
  const stored = await loadStoredBrand();
  return resolveEffectiveBrand(stored);
});

export async function loadStoredBrand(): Promise<GlobalBrandStored | null> {
  try {
    const [organisation, global] = await Promise.all([
      prisma.organisation.findUnique({
        where: { id: OPENSDOORS_ORGANISATION_ID },
        select: brandSelect,
      }),
      prisma.globalBrandSetting.findUnique({
        where: { id: "global" },
        select: brandSelect,
      }),
    ]);
    return mergeStoredBrand(organisation, global);
  } catch (error) {
    console.warn(
      "[global-brand] failed to load GlobalBrandSetting, using defaults",
      error,
    );
    return null;
  }
}
