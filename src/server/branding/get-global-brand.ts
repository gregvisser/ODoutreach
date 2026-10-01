import "server-only";

import { cache } from "react";

import {
  type EffectiveBrand,
  type GlobalBrandStored,
  resolveEffectiveBrand,
} from "@/lib/branding/global-brand";
import { prisma } from "@/lib/db";
import { OPENSDOORS_ORGANISATION_ID } from "@/lib/tenant/organisation";

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
 * Load the OpensDoors organisation brand, then the legacy global singleton
 * (id = "global") for any field the organisation has not set, and merge
 * that with the shipped OpensDoors defaults. Memoised per-request via
 * React `cache` so the root layout, app shell, sign-in page, and Settings
 * editor share one read. Host-specific brands are a later stage; this
 * shell stays OpensDoors.
 *
 * Safe against a missing row and against DB errors — if anything goes
 * wrong we fall back to the shipped defaults so the portal is never
 * left without branding.
 */
export const getGlobalBrand = cache(async (): Promise<EffectiveBrand> => {
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
