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

/** Fields used for onboarding readiness (same storage as the rest of the brief). */
export const ONBOARDING_READINESS_KEYS = [
  "businessAddress",
  "targetGeography",
  "targetCustomerProfile",
  "usps",
  "offer",
  "exclusions",
  "campaignObjective",
  "senderIdentityNotes",
  "mailboxSetupNotes",
  "sequenceNotes",
] as const satisfies readonly (keyof OpensDoorsBriefFields)[];

export type OnboardingReadinessKey = (typeof ONBOARDING_READINESS_KEYS)[number];

export const ONBOARDING_READINESS_LABELS: Record<OnboardingReadinessKey, string> = {
  businessAddress: "Business address",
  targetGeography: "Target geography / service areas",
  targetCustomerProfile: "Target customer profile",
  usps: "USPs",
  offer: "Offer / proposition",
  exclusions: "Exclusions / do-not-target",
  campaignObjective: "Campaign objective",
  senderIdentityNotes: "Sender identity notes",
  mailboxSetupNotes: "Mailbox setup notes",
  sequenceNotes: "Sequence / message notes",
};

export type OnboardingBriefCompletion = {
  completedCount: number;
  totalCount: number;
  missingKeys: OnboardingReadinessKey[];
  missingLabels: string[];
  percent: number;
  status: "empty" | "partial" | "ready";
  /** First missing field in checklist order — for “next step” copy */
  nextRecommendedLabel: string | null;
};

/**
 * Readiness for the operating brief (stored in ClientOnboarding.formData).
 * Does not inspect secrets or unrelated legacy keys.
 */
export function computeOnboardingBriefCompletion(
  formData: unknown,
): OnboardingBriefCompletion {
  const brief = parseOpensDoorsBrief(formData);
  const missingKeys: OnboardingReadinessKey[] = [];
  for (const key of ONBOARDING_READINESS_KEYS) {
    const v = brief[key];
    if (typeof v !== "string" || !v.trim()) missingKeys.push(key);
  }
  const totalCount = ONBOARDING_READINESS_KEYS.length;
  const completedCount = totalCount - missingKeys.length;
  const percent = Math.min(100, Math.round((completedCount / totalCount) * 100));
  let status: OnboardingBriefCompletion["status"];
  if (completedCount === 0) status = "empty";
  else if (missingKeys.length === 0) status = "ready";
  else status = "partial";
  const missingLabels = missingKeys.map((k) => ONBOARDING_READINESS_LABELS[k]);
  const nextRecommendedLabel =
    missingLabels.length > 0 ? (missingLabels[0] ?? null) : null;
  return {
    completedCount,
    totalCount,
    missingKeys,
    missingLabels,
    percent,
    status,
    nextRecommendedLabel,
  };
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
