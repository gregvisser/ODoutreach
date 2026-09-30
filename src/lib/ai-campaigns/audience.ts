import { z } from "zod";

import { isRocketReachIndustry } from "@/lib/clients/rocketreach-industries";

import {
  AI_CAMPAIGN_CONFIRMATION_PHRASE,
  isAiCampaignConfirmation,
} from "./policy";

const line = z.string().trim().min(2).max(120);
const lines = z.array(line).min(1).max(20);
const optionalLines = z.array(line).max(10);

export const aiCampaignDraftSchema = z.object({
  brief: z.string().trim().min(20).max(4000),
  jobTitles: lines,
  countries: lines,
  industries: lines,
  seniorities: optionalLines,
  companySizeMin: z.number().int().min(1).max(1_000_000).nullable(),
  companySizeMax: z.number().int().min(1).max(1_000_000).nullable(),
  targetContactCount: z.number().int().min(1).max(5000),
  creditBudgetTotal: z.number().int().min(1).max(10000),
  creditBudgetPerDay: z.number().int().min(1).max(500),
  endsAt: z.date().nullable(),
  confirmationPhrase: z.string(),
}).strict().superRefine((value, context) => {
  if (!isAiCampaignConfirmation(value.confirmationPhrase, AI_CAMPAIGN_CONFIRMATION_PHRASE)) {
    context.addIssue({
      code: "custom",
      path: ["confirmationPhrase"],
      message: `Type ${AI_CAMPAIGN_CONFIRMATION_PHRASE} to start.`,
    });
  }
  if (value.creditBudgetPerDay > value.creditBudgetTotal) {
    context.addIssue({
      code: "custom",
      path: ["creditBudgetPerDay"],
      message: "The daily credit budget cannot be higher than the total budget.",
    });
  }
  if (
    value.companySizeMin !== null &&
    value.companySizeMax !== null &&
    value.companySizeMax < value.companySizeMin
  ) {
    context.addIssue({
      code: "custom",
      path: ["companySizeMax"],
      message: "The largest company size cannot be below the smallest.",
    });
  }
  const invalid = value.industries.filter((industry) => !isRocketReachIndustry(industry));
  if (invalid.length > 0) {
    context.addIssue({
      code: "custom",
      path: ["industries"],
      message: `Use industry names from the RocketReach list. These are not on it: ${invalid.join(", ")}.`,
    });
  }
});

export type AiCampaignDraft = z.infer<typeof aiCampaignDraftSchema>;

export function splitAudienceLines(value: string): string[] {
  const seen = new Set<string>();
  const linesOut: string[] = [];
  for (const raw of value.split(/[\n,]/)) {
    const trimmed = raw.trim();
    const key = trimmed.toLocaleLowerCase("en-GB");
    if (trimmed.length < 2 || seen.has(key)) continue;
    seen.add(key);
    linesOut.push(trimmed);
  }
  return linesOut;
}

export type AudienceSuggestion = {
  jobTitles: string[];
  countries: string[];
  industries: string[];
  seniorities: string[];
};

const COUNTRY_NAMES = [
  "United Kingdom",
  "Ireland",
  "United States",
  "Canada",
  "Australia",
  "Germany",
  "France",
  "Netherlands",
  "Spain",
  "Sweden",
] as const;

/**
 * Suggest filters from the brief and the client's saved audience.
 * This does not call a model, so a missing AI key cannot block the form.
 * Writing and checking the emails still use xAI.
 */
export function proposeAudienceFromBrief(input: {
  briefText: string;
  knownJobTitles: readonly string[];
  knownIndustries: readonly string[];
  rocketReachIndustries: readonly string[];
}): AudienceSuggestion {
  const haystack = ` ${input.briefText.toLocaleLowerCase("en-GB")} `;
  const industries = new Set<string>();
  for (const industry of input.rocketReachIndustries) {
    if (haystack.includes(` ${industry.toLocaleLowerCase("en-GB")} `)) industries.add(industry);
  }
  for (const industry of input.knownIndustries) {
    if (input.rocketReachIndustries.includes(industry)) industries.add(industry);
  }
  const countries = COUNTRY_NAMES.filter((country) => haystack.includes(country.toLocaleLowerCase("en-GB")));
  const seniorityWords = ["Director", "Manager", "Head", "Vice President", "Founder"];
  const seniorities = seniorityWords.filter((word) => haystack.includes(word.toLocaleLowerCase("en-GB")));
  return {
    jobTitles: [...input.knownJobTitles].slice(0, 20),
    countries,
    industries: [...industries].slice(0, 20),
    seniorities,
  };
}

export function formatClientBriefPrefill(input: {
  clientName: string;
  industry: string | null;
  notes: string | null;
  serviceAreas: readonly string[];
  targetIndustries: readonly string[];
  targetJobTitles: readonly string[];
  companySizes: readonly string[];
}): string {
  const lines = [
    input.clientName,
    input.industry ? `Industry: ${input.industry}` : null,
    input.serviceAreas.length ? `What they sell: ${input.serviceAreas.join(", ")}` : null,
    input.targetIndustries.length ? `Industries to contact: ${input.targetIndustries.join(", ")}` : null,
    input.targetJobTitles.length ? `Job titles to contact: ${input.targetJobTitles.join(", ")}` : null,
    input.companySizes.length ? `Company size: ${input.companySizes.join(", ")}` : null,
    input.notes?.trim() ? input.notes.trim() : null,
    "Who to contact and the offer:",
  ];
  return lines.filter((line): line is string => line !== null && line.length > 0).join("\n");
}

export function parseOptionalWholeNumber(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!/^\d+$/.test(trimmed)) return Number.NaN;
  const parsed = Number(trimmed);
  return Number.isSafeInteger(parsed) ? parsed : Number.NaN;
}

export type AiCampaignFormFields = {
  brief: string;
  jobTitles: string;
  countries: string;
  industries: string;
  seniorities: string;
  companySizeMin: string;
  companySizeMax: string;
  targetContactCount: string;
  creditBudgetTotal: string;
  creditBudgetPerDay: string;
  endsAt: string;
  confirmationPhrase: string;
};

function requiredCount(value: string, label: string): { ok: true; value: number } | { ok: false; error: string } {
  const parsed = parseOptionalWholeNumber(value);
  if (parsed === null || Number.isNaN(parsed)) {
    return { ok: false, error: `${label} must be a whole number.` };
  }
  return { ok: true, value: parsed };
}

/** End of the chosen UTC day, so that day is included. Empty means no end date. */
export function parseAiCampaignEndDate(value: string, now: Date): Date | null | "invalid" | "past" {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return "invalid";
  const [year, month, day] = trimmed.split("-").map((part) => Number(part));
  if (!year || !month || !day) return "invalid";
  const date = new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999));
  if (Number.isNaN(date.getTime()) || date.getUTCDate() !== day) return "invalid";
  if (date.getTime() <= now.getTime()) return "past";
  return date;
}

export function aiCampaignDraftFromForm(
  fields: AiCampaignFormFields,
  now: Date,
): { ok: true; draft: AiCampaignDraft } | { ok: false; error: string } {
  const target = requiredCount(fields.targetContactCount, "People to contact");
  if (!target.ok) return target;
  const total = requiredCount(fields.creditBudgetTotal, "RocketReach credit budget");
  if (!total.ok) return total;
  const daily = requiredCount(fields.creditBudgetPerDay, "Credits per day");
  if (!daily.ok) return daily;
  const minSize = parseOptionalWholeNumber(fields.companySizeMin);
  const maxSize = parseOptionalWholeNumber(fields.companySizeMax);
  if (Number.isNaN(minSize) || Number.isNaN(maxSize)) {
    return { ok: false, error: "Company size must be a whole number, or left blank." };
  }
  const endsAt = parseAiCampaignEndDate(fields.endsAt, now);
  if (endsAt === "invalid") return { ok: false, error: "The end date is not a real date." };
  if (endsAt === "past") return { ok: false, error: "The end date must be after today." };
  const parsed = aiCampaignDraftSchema.safeParse({
    brief: fields.brief,
    jobTitles: splitAudienceLines(fields.jobTitles),
    countries: splitAudienceLines(fields.countries),
    industries: splitAudienceLines(fields.industries),
    seniorities: splitAudienceLines(fields.seniorities),
    companySizeMin: minSize,
    companySizeMax: maxSize,
    targetContactCount: target.value,
    creditBudgetTotal: total.value,
    creditBudgetPerDay: daily.value,
    endsAt,
    confirmationPhrase: fields.confirmationPhrase,
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the form and try again." };
  }
  return { ok: true, draft: parsed.data };
}
