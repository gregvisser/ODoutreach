import { z } from "zod";

/** Stored inside `ClientOnboarding.formData` alongside legacy keys (emailSheetId, etc.). */
export const opensDoorsBriefFieldsSchema = z.object({
  tradingName: z.string().optional(),
  businessAddress: z.string().optional(),
  targetGeography: z.string().optional(),
  targetCustomerProfile: z.string().optional(),
  usps: z.string().optional(),
  offer: z.string().optional(),
  exclusions: z.string().optional(),
  assetNotes: z.string().optional(),
  complianceNotes: z.string().optional(),
  senderIdentityNotes: z.string().optional(),
  /** How the five outreach mailboxes are named, owned, or handed off */
  mailboxSetupNotes: z.string().optional(),
  campaignObjective: z.string().optional(),
  sequenceNotes: z.string().optional(),
  suppressionSheetUrl: z.string().optional(),
  rocketReachSearchNotes: z.string().optional(),
  /** First-step templates for governed / pilot sends */
  pilotSubjectTemplate: z.string().optional(),
  pilotBodyTemplate: z.string().optional(),
});

export type OpensDoorsBriefFields = z.infer<typeof opensDoorsBriefFieldsSchema>;

const MAX_FIELD = 20_000;

export function parseOpensDoorsBrief(formData: unknown): OpensDoorsBriefFields {
  if (!formData || typeof formData !== "object") return {};
  const raw = formData as Record<string, unknown>;
  const pick: Record<string, string> = {};
  for (const key of Object.keys(opensDoorsBriefFieldsSchema.shape)) {
    const v = raw[key];
    if (typeof v === "string") pick[key] = v;
  }
  const parsed = opensDoorsBriefFieldsSchema.safeParse(pick);
  return parsed.success ? parsed.data : {};
}

export function briefLooksFilled(brief: OpensDoorsBriefFields): boolean {
  return Object.values(brief).some((v) => typeof v === "string" && v.trim().length > 0);
}

/** Merge brief fields into existing onboarding JSON without dropping legacy keys. */
export function mergeBriefIntoFormData(
  existing: unknown,
  patch: OpensDoorsBriefFields,
): Record<string, unknown> {
  const base =
    existing && typeof existing === "object" && !Array.isArray(existing)
      ? { ...(existing as Record<string, unknown>) }
      : {};
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue;
    const s = typeof v === "string" ? v.slice(0, MAX_FIELD) : v;
    base[k] = s;
  }
  return base;
}
