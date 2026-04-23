import { z } from "zod";

import {
  isMainContactComplete,
  isStructuredAddressComplete,
  parseBriefMainContact,
  parseStructuredBusinessAddress,
} from "@/lib/brief/brief-field-helpers";

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
  emailSignature: z.string().optional(),
  mailboxSetupNotes: z.string().optional(),
  campaignObjective: z.string().optional(),
  sequenceNotes: z.string().optional(),
  suppressionSheetUrl: z.string().optional(),
  rocketReachSearchNotes: z.string().optional(),
  pilotSubjectTemplate: z.string().optional(),
  pilotBodyTemplate: z.string().optional(),
  /// Business / targeting — v2 (preferred; backfilled in parse from legacy fields)
  valueProposition: z.string().optional(),
  coreOffer: z.string().optional(),
  differentiators: z.string().optional(),
  proofNotes: z.string().optional(),
});

export type OpensDoorsBriefFields = z.infer<typeof opensDoorsBriefFieldsSchema>;

const MAX_FIELD = 20_000;

/**
 * Best-effort backfill of v2 fields from legacy v1 so operators see data
 * after the redesign without a one-time DB migration.
 */
function enrichParsedBrief(b: OpensDoorsBriefFields): OpensDoorsBriefFields {
  const o = (s: string | undefined) => (s ?? "").trim();
  return {
    ...b,
    valueProposition: o(b.valueProposition) || o(b.campaignObjective) || undefined,
    coreOffer: o(b.coreOffer) || o(b.offer) || undefined,
    differentiators: o(b.differentiators) || o(b.usps) || undefined,
    proofNotes: o(b.proofNotes) || o(b.assetNotes) || undefined,
  };
}

export function parseOpensDoorsBrief(formData: unknown): OpensDoorsBriefFields {
  if (!formData || typeof formData !== "object") return {};
  const raw = formData as Record<string, unknown>;
  const pick: Record<string, string> = {};
  for (const key of Object.keys(opensDoorsBriefFieldsSchema.shape)) {
    const v = raw[key];
    if (typeof v === "string") pick[key] = v;
  }
  const parsed = opensDoorsBriefFieldsSchema.safeParse(pick);
  if (!parsed.success) return {};
  return enrichParsedBrief(parsed.data);
}

export function briefLooksFilled(brief: OpensDoorsBriefFields): boolean {
  return Object.values(brief).some((v) => typeof v === "string" && v.trim().length > 0);
}

/**
 * @deprecated v1 only — 11 string keys. Kept for `getLegacyBriefReadinessState`.
 */
export const LEGACY_BRIEF_READINESS_KEYS = [
  "businessAddress",
  "targetGeography",
  "targetCustomerProfile",
  "usps",
  "offer",
  "exclusions",
  "campaignObjective",
  "senderIdentityNotes",
  "emailSignature",
  "mailboxSetupNotes",
  "sequenceNotes",
] as const satisfies readonly (keyof OpensDoorsBriefFields)[];

export type LegacyBriefReadinessKey = (typeof LEGACY_BRIEF_READINESS_KEYS)[number];

export const LEGACY_BRIEF_READINESS_LABELS: Record<LegacyBriefReadinessKey, string> = {
  businessAddress: "Business address",
  targetGeography: "Target geography / service areas",
  targetCustomerProfile: "Target customer profile",
  usps: "USPs",
  offer: "Offer / proposition",
  exclusions: "Exclusions / do-not-target",
  campaignObjective: "Campaign objective",
  senderIdentityNotes: "Sender identity notes",
  emailSignature: "Email signature (renders {{email_signature}})",
  mailboxSetupNotes: "Mailbox setup notes",
  sequenceNotes: "Sequence / message notes",
};

export type OnboardingBriefCompletion = {
  completedCount: number;
  totalCount: number;
  missingKeys: string[];
  missingLabels: string[];
  percent: number;
  status: "empty" | "partial" | "ready";
  nextRecommendedLabel: string | null;
};

type TaxonomyCounts = Partial<
  Record<"SERVICE_AREA" | "TARGET_INDUSTRY" | "COMPANY_SIZE" | "JOB_TITLE", number>
>;

export type ClientBriefReadinessContext = {
  client: {
    name: string;
    website: string | null;
    industry: string | null;
    briefBusinessAddress: unknown;
    briefMainContact: unknown;
    briefLinkedinUrl: string | null;
    briefAssignedAccountManagerId: string | null;
  } | null;
  taxonomyCounts: TaxonomyCounts;
};

const V2_CHECKLIST: ReadonlyArray<{
  id: string;
  label: string;
  check: (args: {
    brief: OpensDoorsBriefFields;
    client: ClientBriefReadinessContext["client"];
    tax: TaxonomyCounts;
  }) => boolean;
}> = [
  { id: "web", label: "Website", check: ({ client }) => !!client?.website?.trim() },
  { id: "li", label: "Company LinkedIn URL", check: ({ client }) => !!client?.briefLinkedinUrl?.trim() },
  {
    id: "sector",
    label: "Sector / business type (workspace or ICP industries)",
    check: ({ client, tax }) =>
      !!client?.industry?.trim() || (tax.TARGET_INDUSTRY ?? 0) > 0,
  },
  {
    id: "addr",
    label: "Business address",
    check: ({ client, brief }) =>
      isStructuredAddressComplete(
        parseStructuredBusinessAddress(client?.briefBusinessAddress),
        (brief.businessAddress ?? "").trim(),
      ),
  },
  {
    id: "mc",
    label: "Main contact (name and work email)",
    check: ({ client }) =>
      isMainContactComplete(parseBriefMainContact(client?.briefMainContact)),
  },
  { id: "vp", label: "Value proposition", check: ({ brief }) => (brief.valueProposition ?? "").trim().length > 0 },
  { id: "co", label: "Core offer", check: ({ brief }) => (brief.coreOffer ?? "").trim().length > 0 },
  { id: "diff", label: "Differentiators", check: ({ brief }) => (brief.differentiators ?? "").trim().length > 0 },
  { id: "excl", label: "Exclusions / do-not-target", check: ({ brief }) => (brief.exclusions ?? "").trim().length > 0 },
  {
    id: "svc",
    label: "Service or target areas",
    check: ({ brief, tax }) => (tax.SERVICE_AREA ?? 0) > 0 || (brief.targetGeography ?? "").trim().length > 0,
  },
  {
    id: "ind",
    label: "Target industries (structured or legacy profile)",
    check: ({ brief, tax }) => (tax.TARGET_INDUSTRY ?? 0) > 0 || (brief.targetCustomerProfile ?? "").trim().length > 0,
  },
  {
    id: "sz",
    label: "Target company sizes (structured or legacy profile)",
    check: ({ brief, tax }) => (tax.COMPANY_SIZE ?? 0) > 0 || (brief.targetCustomerProfile ?? "").trim().length > 0,
  },
  {
    id: "jt",
    label: "Target job titles (structured or legacy profile)",
    check: ({ brief, tax }) => (tax.JOB_TITLE ?? 0) > 0 || (brief.targetCustomerProfile ?? "").trim().length > 0,
  },
  { id: "cnotes", label: "Compliance notes", check: ({ brief }) => (brief.complianceNotes ?? "").trim().length > 0 },
  { id: "proof", label: "Proof / case notes", check: ({ brief }) => (brief.proofNotes ?? "").trim().length > 0 },
  {
    id: "am",
    label: "Assigned account manager",
    check: ({ client }) => !!client?.briefAssignedAccountManagerId,
  },
];

function evaluateV2(
  formData: unknown,
  client: ClientBriefReadinessContext["client"],
  taxonomyCounts: TaxonomyCounts,
) {
  const brief = parseOpensDoorsBrief(formData);
  const missing: typeof V2_CHECKLIST[number][] = [];
  for (const row of V2_CHECKLIST) {
    if (!row.check({ brief, client, tax: taxonomyCounts })) missing.push(row);
  }
  return { missing };
}

/**
 * v1 11-key readiness — if still fully satisfied, launch/brief can stay green
 * while migrating form fields in the DB.
 */
export function getLegacyBriefReadinessState(formData: unknown): OnboardingBriefCompletion {
  const brief = parseOpensDoorsBrief(formData);
  const missingKeys: string[] = [];
  for (const key of LEGACY_BRIEF_READINESS_KEYS) {
    const v = brief[key as keyof typeof brief];
    if (typeof v !== "string" || !v.trim()) missingKeys.push(String(key));
  }
  const totalCount = LEGACY_BRIEF_READINESS_KEYS.length;
  const done = totalCount - missingKeys.length;
  const percent = Math.min(100, Math.round((done / totalCount) * 100));
  let status: OnboardingBriefCompletion["status"];
  if (done === 0) status = "empty";
  else if (missingKeys.length === 0) status = "ready";
  else status = "partial";
  const map = missingKeys
    .map((k) => k as LegacyBriefReadinessKey)
    .map((k) => LEGACY_BRIEF_READINESS_LABELS[k]);
  return {
    completedCount: done,
    totalCount,
    missingKeys,
    missingLabels: map,
    percent,
    status,
    nextRecommendedLabel: map[0] ?? null,
  };
}

function buildV2Completion(
  formData: unknown,
  context: ClientBriefReadinessContext,
): OnboardingBriefCompletion {
  const { missing } = evaluateV2(formData, context.client, context.taxonomyCounts);
  if (missing.length === 0) {
    return {
      completedCount: V2_CHECKLIST.length,
      totalCount: V2_CHECKLIST.length,
      missingKeys: [],
      missingLabels: [],
      percent: 100,
      status: "ready",
      nextRecommendedLabel: null,
    };
  }
  if (getLegacyBriefReadinessState(formData).status === "ready") {
    return {
      completedCount: V2_CHECKLIST.length,
      totalCount: V2_CHECKLIST.length,
      missingKeys: [],
      missingLabels: [],
      percent: 100,
      status: "ready",
      nextRecommendedLabel: null,
    };
  }
  const done = V2_CHECKLIST.length - missing.length;
  const percent = Math.min(100, Math.round((done / V2_CHECKLIST.length) * 100));
  return {
    completedCount: done,
    totalCount: V2_CHECKLIST.length,
    missingKeys: missing.map((m) => m.id),
    missingLabels: missing.map((m) => m.label),
    percent,
    status: done === 0 ? "empty" : "partial",
    nextRecommendedLabel: missing[0]?.label ?? null,
  };
}

/**
 * When `context` is omitted, the legacy 11-key check runs (isolated unit tests & scripts).
 * Production passes `context` from the workspace bundle.
 */
export function computeOnboardingBriefCompletion(
  formData: unknown,
  context?: ClientBriefReadinessContext,
): OnboardingBriefCompletion {
  if (context) {
    return buildV2Completion(formData, context);
  }
  return getLegacyBriefReadinessState(formData);
}

/** @deprecated use LEGACY_BRIEF_READINESS_* */
export const ONBOARDING_READINESS_KEYS = LEGACY_BRIEF_READINESS_KEYS;
export type OnboardingReadinessKey = LegacyBriefReadinessKey;
export const ONBOARDING_READINESS_LABELS = LEGACY_BRIEF_READINESS_LABELS;

/**
 * `senderCompanyName` from the Client row. `emailSignature` still read from
 * stored brief for legacy `{{email_signature}}` — operators configure
 * per-mailbox signatures in Mailboxes.
 */
export type ClientSenderProfile = {
  senderCompanyName: string;
  emailSignature: string;
  tradingName: string | null;
  businessAddress: string | null;
};

export function getClientSenderProfile(params: {
  client: { name: string };
  formData: unknown;
}): ClientSenderProfile {
  const brief = parseOpensDoorsBrief(params.formData);
  const signature = (brief.emailSignature ?? "").trim();
  const trading = (brief.tradingName ?? "").trim();
  const address = (brief.businessAddress ?? "").trim();
  return {
    senderCompanyName: params.client.name,
    emailSignature: signature,
    tradingName: trading.length > 0 ? trading : null,
    businessAddress: address.length > 0 ? address : null,
  };
}

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
