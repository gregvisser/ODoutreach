/**
 * Structured brief field helpers (address, main contact) — no opensdoors-brief import.
 */
import { z } from "zod";

const structuredAddressSchema = z
  .object({
    line1: z.string().optional(),
    line2: z.string().optional(),
    city: z.string().optional(),
    region: z.string().optional(),
    postalCode: z.string().optional(),
    country: z.string().optional(),
    formattedSummary: z.string().optional(),
  })
  .strict();

const mainContactSchema = z
  .object({
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    role: z.string().optional(),
    email: z.string().optional(),
    mobile: z.string().optional(),
    status: z.string().optional(),
  })
  .strict();

export function parseStructuredBusinessAddress(
  raw: unknown,
): z.infer<typeof structuredAddressSchema> | null {
  const p = structuredAddressSchema.safeParse(raw);
  return p.success ? p.data : null;
}

export function isStructuredAddressComplete(
  a: z.infer<typeof structuredAddressSchema> | null,
  legacyTextFallback?: string,
): boolean {
  if (legacyTextFallback && legacyTextFallback.trim().length > 0) return true;
  if (!a) return false;
  if (a.formattedSummary && a.formattedSummary.trim().length > 0) return true;
  if (!a.line1 || !a.line1.trim()) return false;
  if (a.postalCode && a.postalCode.trim() && a.country && a.country.trim()) return true;
  if (a.city && a.city.trim() && a.country && a.country.trim()) return true;
  return false;
}

export function parseBriefMainContact(
  raw: unknown,
): z.infer<typeof mainContactSchema> | null {
  const p = mainContactSchema.safeParse(raw);
  return p.success ? p.data : null;
}

export function isMainContactComplete(
  mc: z.infer<typeof mainContactSchema> | null,
): boolean {
  if (!mc) return false;
  const em = (mc.email ?? "").trim();
  if (!em || !em.includes("@")) return false;
  const first = (mc.firstName ?? "").trim();
  const last = (mc.lastName ?? "").trim();
  if (!first && !last) return false;
  return true;
}
