import "server-only";

import { cache } from "react";

import {
  type EffectiveBrand,
  type GlobalBrandStored,
  resolveEffectiveBrand,
} from "@/lib/branding/global-brand";
import { prisma } from "@/lib/db";

/**
 * Load the global brand singleton (id = "global") and merge it with the
 * shipped OpensDoors defaults. Memoised per-request via React `cache`
 * so the root layout, app shell, sign-in page, and Settings editor
 * share a single DB read.
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
    const row = await prisma.globalBrandSetting.findUnique({
      where: { id: "global" },
      select: {
        appLogoUrl: true,
        appMarkUrl: true,
        appFaviconUrl: true,
        appBrandName: true,
        appProductName: true,
        appLogoAltText: true,
      },
    });
    return row ?? null;
  } catch (error) {
    console.warn(
      "[global-brand] failed to load GlobalBrandSetting, using defaults",
      error,
    );
    return null;
  }
}
